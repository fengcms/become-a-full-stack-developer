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
	return map[string]any{
		"id":    a.ID,
		"title": a.Title,
		"slug":  a.Slug,
	}
}

// Adjacent 按发布时间寻找公开文章的上一篇和下一篇。
func (s *Service) Adjacent(ctx context.Context, id int64) (any, error) {
	db := s.DB.WithContext(ctx)
	a, err := Published(db, id)
	if err != nil {
		return nil, err
	}
	result := map[string]any{"prev": nil, "next": nil}
	if a.PublishedAt == nil {
		return result, nil
	}
	for _, side := range []struct{ k, op, order string }{{
		"prev",
		"<",
		"DESC",
	}, {
		"next",
		">",
		"ASC",
	}} {
		var row model.Article
		r := db.Scopes(database.ActiveArticles).
			Where("status = ? AND published_at "+side.op+" ?", "published", *a.PublishedAt).
			Order("published_at " + side.order + ", id ASC").
			Limit(1).
			Find(&row)
		if r.Error != nil {
			return nil, r.Error
		}
		result[side.k] = stub(row)
	}
	return result, nil
}

// Related 用共享标签和同分类评分，返回有界的公开文章推荐。
func (s *Service) Related(ctx context.Context, id int64, limit int) (any, error) {
	db := s.DB.WithContext(ctx)
	a, err := Published(db, id)
	if err != nil {
		return nil, err
	}
	if limit < 1 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	var rows []model.Article
	if err = db.Scopes(database.ActiveArticles).
		Where("status = ? AND id <> ?", "published", id).
		Order("id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
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

// Search 搜索公开文章或有效会员，采用该端点的独立分页默认值。
func (s *Service) Search(ctx context.Context, q url.Values) (any, error) {
	term := strings.TrimSpace(q.Get("q"))
	if term == "" {
		return nil, fault.Field("q", "请提供搜索关键词")
	}
	db := s.DB.WithContext(ctx)
	p := values.PagingWith(q, 10, 50)
	kw := "%" + term + "%"
	result := map[string]any{"articles": nil, "members": nil}
	if q.Get("type") == "member" {
		filter := db.Model(&model.User{}).
			Where("status <> ? AND (LOWER(display_name) LIKE LOWER(?) OR LOWER(username) LIKE LOWER(?))", "disabled", kw, kw)
		var n int64
		if err := filter.Session(&gorm.Session{}).Count(&n).Error; err != nil {
			return nil, err
		}
		var rows []model.User
		if err := filter.Order("id ASC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
			return nil, err
		}
		list := []map[string]any{}
		for _, u := range rows {
			var count int64
			if err := db.Model(&model.Article{}).
				Scopes(database.ActiveArticles).
				Where("author_id = ? AND status = ?", u.ID, "published").
				Count(&count).Error; err != nil {
				return nil, err
			}
			list = append(list, map[string]any{
				"id":           u.ID,
				"nickname":     values.Name(u.DisplayName, u.Username),
				"avatar":       u.AvatarURL,
				"level":        u.Level,
				"articleCount": count,
			})
		}
		result["members"] = p.Result(list, n)
		return result, nil
	}
	filter := db.Model(&model.Article{}).
		Scopes(database.ActiveArticles).
		Where("status = ? AND (LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?) OR LOWER(content) LIKE LOWER(?))", "published", kw, kw, kw)
	var n int64
	if err := filter.Session(&gorm.Session{}).Count(&n).Error; err != nil {
		return nil, err
	}
	var rows []model.Article
	if err := filter.Select(SummaryColumns).
		Order(Sort(q.Get("sort"))).
		Limit(p.Size).
		Offset(p.Offset()).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result["articles"] = p.Result(List(rows), n)
	return result, nil
}

// Toc 从公开文章的 Markdown 正文生成有界目录。
func (s *Service) Toc(ctx context.Context, id int64) (any, error) {
	a, err := Published(s.DB.WithContext(ctx), id)
	if err != nil {
		return nil, err
	}
	return ParseToc(a.Content), nil
}

// Views 在事务中维护阅读量和滚动 24 小时去重记录。
func (s *Service) Views(ctx context.Context, id int64, actor values.Actor, ip, ua string) (any, error) {
	db := s.DB.WithContext(ctx)
	var a model.Article
	txErr := db.Transaction(func(tx *gorm.DB) error {
		var err error
		a, err = Published(database.Lock(tx), id)
		if err != nil {
			return err
		}
		key := "u:" + strconv.FormatInt(actor.ID, 10)
		if actor.ID == 0 {
			key = "a:" + fnv(ip+"|"+ua)
		}
		now := s.Now().UnixMilli()
		var dedup model.ViewDedup
		err = tx.Where("article_id = ? AND dedup_key = ?", id, key).First(&dedup).Error
		increment := false
		if err == gorm.ErrRecordNotFound {
			dedup = model.ViewDedup{
				ArticleID: id,
				DedupKey:  key,
				CreatedAt: now,
			}
			if err := tx.Create(&dedup).Error; err != nil {
				return err
			}
			increment = true
		} else if err != nil {
			return err
		} else if now-dedup.CreatedAt >= 86400000 {
			if err := tx.Model(&dedup).UpdateColumn("created_at", now).Error; err != nil {
				return err
			}
			increment = true
		}
		if increment {
			if err := tx.Model(&model.Article{}).
				Scopes(database.ActiveArticles).
				Where("id = ?", id).
				UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error; err != nil {
				return err
			}
		}

		return tx.First(&a, id).Error
	})
	return map[string]any{"viewCount": a.ViewCount}, txErr
}
