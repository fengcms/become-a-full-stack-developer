package article

import (
	"context"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func stub(a model.Article) any {
	if a.ID == 0 {
		return nil
	}
	return map[string]any{"id": a.ID, "title": a.Title, "slug": a.Slug}
}
func (s *Service) Adjacent(ctx context.Context, id int64) (any, error) {
	db := s.DB.WithContext(ctx)
	a, e := Published(db, id)
	if e != nil {
		return nil, e
	}
	result := map[string]any{"prev": nil, "next": nil}
	if a.PublishedAt == nil {
		return result, nil
	}
	for _, side := range []struct{ k, op, order string }{{"prev", "<", "DESC"}, {"next", ">", "ASC"}} {
		var row model.Article
		r := db.Where("status = ? AND deleted_at IS NULL AND published_at "+side.op+" ?", "published", *a.PublishedAt).Order("published_at " + side.order + ", id ASC").Limit(1).Find(&row)
		if r.Error != nil {
			return nil, r.Error
		}
		result[side.k] = stub(row)
	}
	return result, nil
}
func (s *Service) Related(ctx context.Context, id int64, limit int) (any, error) {
	db := s.DB.WithContext(ctx)
	a, e := Published(db, id)
	if e != nil {
		return nil, e
	}
	if limit < 1 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	var rows []model.Article
	if e = db.Where("status = ? AND deleted_at IS NULL AND id <> ?", "published", id).Order("id ASC").Find(&rows).Error; e != nil {
		return nil, e
	}
	type scored struct {
		a     model.Article
		score int
	}
	items := []scored{}
	tags := map[string]bool{}
	for _, t := range Tags(a.Tags) {
		tags[t] = true
	}
	for _, r := range rows {
		n := 0
		for _, t := range Tags(r.Tags) {
			if tags[t] {
				n += 2
			}
		}
		if a.CategoryID != nil && r.CategoryID != nil && *a.CategoryID == *r.CategoryID {
			n++
		}
		if n > 0 {
			items = append(items, scored{r, n})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].score != items[j].score {
			return items[i].score > items[j].score
		}
		return items[i].a.ViewCount > items[j].a.ViewCount
	})
	out := []map[string]any{}
	for i, item := range items {
		if i >= limit {
			break
		}
		r := stub(item.a).(map[string]any)
		r["viewCount"] = item.a.ViewCount
		out = append(out, r)
	}
	return out, nil
}
func (s *Service) Search(ctx context.Context, q url.Values) (any, error) {
	term := strings.TrimSpace(q.Get("q"))
	if term == "" {
		return nil, fault.New(fault.Validation)
	}
	db := s.DB.WithContext(ctx)
	p := values.Paging(q)
	kw := "%" + term + "%"
	result := map[string]any{"articles": nil, "members": nil}
	if q.Get("type") == "member" {
		filter := db.Model(&model.User{}).Where("status <> ? AND (LOWER(display_name) LIKE LOWER(?) OR LOWER(username) LIKE LOWER(?))", "disabled", kw, kw)
		var n int64
		if e := filter.Session(&gorm.Session{}).Count(&n).Error; e != nil {
			return nil, e
		}
		var rows []model.User
		if e := filter.Order("id ASC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
			return nil, e
		}
		list := []map[string]any{}
		for _, u := range rows {
			var count int64
			if e := db.Model(&model.Article{}).Where("author_id = ? AND status = ? AND deleted_at IS NULL", u.ID, "published").Count(&count).Error; e != nil {
				return nil, e
			}
			list = append(list, map[string]any{"id": u.ID, "nickname": values.Name(u.DisplayName, u.Username), "avatar": u.AvatarURL, "level": u.Level, "articleCount": count})
		}
		result["members"] = p.Result(list, n)
		return result, nil
	}
	filter := db.Model(&model.Article{}).Where("status = ? AND deleted_at IS NULL AND (LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?) OR LOWER(content) LIKE LOWER(?))", "published", kw, kw, kw)
	var n int64
	if e := filter.Session(&gorm.Session{}).Count(&n).Error; e != nil {
		return nil, e
	}
	var rows []model.Article
	if e := filter.Select(SummaryColumns).Order(Sort(q.Get("sort"))).Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	result["articles"] = p.Result(List(rows), n)
	return result, nil
}
func (s *Service) Toc(ctx context.Context, id int64) (any, error) {
	a, e := Published(s.DB.WithContext(ctx), id)
	if e != nil {
		return nil, e
	}
	return ParseToc(a.Content), nil
}
func (s *Service) Views(ctx context.Context, id int64, actor values.Actor, ip, ua string) (any, error) {
	db := s.DB.WithContext(ctx)
	var a model.Article
	e := db.Transaction(func(tx *gorm.DB) error {
		var e error
		a, e = Published(database.Lock(tx), id)
		if e != nil {
			return e
		}
		key := "u:" + strconv.FormatInt(actor.ID, 10)
		if actor.ID == 0 {
			key = "a:" + fnv(ip+"|"+ua)
		}
		now := s.Now().UnixMilli()
		var dedup model.ViewDedup
		err := tx.Where("article_id = ? AND dedup_key = ?", id, key).First(&dedup).Error
		increment := false
		if err == gorm.ErrRecordNotFound {
			dedup = model.ViewDedup{ArticleID: id, DedupKey: key, CreatedAt: now}
			if e := tx.Create(&dedup).Error; e != nil {
				return e
			}
			increment = true
		} else if err != nil {
			return err
		} else if now-dedup.CreatedAt >= 86400000 {
			if e := tx.Model(&dedup).UpdateColumn("created_at", now).Error; e != nil {
				return e
			}
			increment = true
		}
		if increment {
			if e := tx.Model(&model.Article{}).Where("id = ?", id).UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error; e != nil {
				return e
			}
		}

		return tx.First(&a, id).Error
	})
	return map[string]any{"viewCount": a.ViewCount}, e
}
