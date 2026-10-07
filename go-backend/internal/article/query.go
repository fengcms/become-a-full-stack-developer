// Package article owns content visibility and publishing workflows.
package article

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

type Service struct {
	DB  *gorm.DB
	Now func() time.Time
}

func New(db *gorm.DB) *Service { return &Service{DB: db, Now: time.Now} }
func Get(db *gorm.DB, key string) (model.Article, error) {
	var a model.Article
	q := db.Where("deleted_at IS NULL")
	if id, e := strconv.ParseInt(key, 10, 64); e == nil {
		q = q.Where("id = ?", id)
	} else {
		q = q.Where("slug = ?", key)
	}
	e := q.First(&a).Error
	return a, e
}
func Published(db *gorm.DB, id int64) (model.Article, error) {
	a, e := Get(db, strconv.FormatInt(id, 10))
	if e != nil {
		return a, e
	}
	if a.Status != "published" {
		return a, fault.New(fault.NotFound)
	}
	return a, nil
}
func (s *Service) Get(ctx context.Context, key string, actor values.Actor) (map[string]any, error) {
	a, e := Get(s.DB.WithContext(ctx), key)
	if e != nil {
		return nil, e
	}
	if a.Status != "published" && actor.ID != a.AuthorID && actor.Role != "admin" {
		return nil, fault.New(fault.NotFound)
	}
	return Detail(a), nil
}
func Sort(raw string) string {
	desc := strings.HasPrefix(raw, "-")
	field := strings.TrimPrefix(raw, "-")
	cols := map[string]string{"publishedAt": "COALESCE(articles.published_at,articles.created_at)", "createdAt": "articles.created_at", "viewCount": "articles.view_count"}
	col, ok := cols[field]
	if !ok {
		col = cols["publishedAt"]
		desc = true
	}
	dir := "ASC"
	if desc {
		dir = "DESC"
	}
	return col + " " + dir + ", articles.id DESC"
}
func (s *Service) Page(ctx context.Context, q url.Values, status string, author int64) (map[string]any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx)
	filter := db.Model(&model.Article{}).Where("articles.deleted_at IS NULL")
	if status != "" {
		filter = filter.Where("articles.status = ?", status)
	}
	if author > 0 {
		filter = filter.Where("articles.author_id = ?", author)
	}
	if kw := q.Get("keyword"); kw != "" {
		filter = filter.Where("(LOWER(articles.title) LIKE LOWER(?) OR LOWER(articles.summary) LIKE LOWER(?))", "%"+kw+"%", "%"+kw+"%")
	}
	if tag := q.Get("tag"); tag != "" {
		filter = filter.Where("EXISTS (SELECT 1 FROM article_tags atg JOIN tags tg ON tg.id=atg.tag_id WHERE atg.article_id=articles.id AND tg.slug = ?)", tag)
	}
	if cat := q.Get("category"); cat != "" {
		var all []model.Category
		if e := db.Find(&all).Error; e != nil {
			return nil, e
		}
		slugs := []string{}
		ids := map[int64]bool{}
		for _, c := range all {
			if c.Slug == cat {
				ids[c.ID] = true
				slugs = append(slugs, c.Slug)
			}
		}
		for d := 0; d < 4; d++ {
			for _, c := range all {
				if c.ParentID != nil && ids[*c.ParentID] && !ids[c.ID] {
					ids[c.ID] = true
					slugs = append(slugs, c.Slug)
				}
			}
		}
		if len(slugs) == 0 {
			return p.Result([]any{}, 0), nil
		}
		filter = filter.Where("articles.category_slug IN ?", slugs)
	}
	var total int64
	countQuery := filter.Session(&gorm.Session{})
	if q.Get("keyword") != "" {
		bounded := countQuery.Select("articles.id").Limit(2000)
		if e := db.Table("(?) AS bounded_articles", bounded).Count(&total).Error; e != nil {
			return nil, e
		}
	} else if e := countQuery.Count(&total).Error; e != nil {
		return nil, e
	}
	var rows []model.Article
	if e := filter.Select(SummaryColumns).Order(Sort(q.Get("sort"))).Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	list := List(rows)
	return p.Result(list, total), nil
}
