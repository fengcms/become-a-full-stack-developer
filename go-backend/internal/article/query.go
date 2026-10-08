// Package article 管理文章可见性和发布流程。
package article

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Service 负责文章可见性、发布状态和相关关系的一致性。
type Service struct {
	DB  *gorm.DB
	Now func() time.Time
}

// New 创建文章服务，时钟可在边界测试中替换。
func New(db *gorm.DB) *Service { return &Service{DB: db, Now: time.Now} }

// Get 按 ID 或 slug 查询未软删除文章，不判断发布状态或访问者权限。
func Get(db *gorm.DB, key string) (model.Article, error) {
	var a model.Article
	q := db.Scopes(database.ActiveArticles)
	if id, err := strconv.ParseInt(key, 10, 64); err == nil {
		q = q.Where("id = ?", id)
	} else {
		q = q.Where("slug = ?", key)
	}
	err := q.First(&a).Error
	return a, err
}

// Published 读取公开文章；未发布状态与不存在统一返回 404。
func Published(db *gorm.DB, id int64) (model.Article, error) {
	a, err := Get(db, strconv.FormatInt(id, 10))
	if err != nil {
		return a, err
	}
	if a.Status != "published" {
		return a, fault.New(fault.NotFound)
	}
	return a, nil
}

// Get 返回访问者可见的文章详情；未发布文章仅作者或管理员可读取。
func (s *Service) Get(ctx context.Context, key string, actor values.Actor) (map[string]any, error) {
	a, err := Get(s.DB.WithContext(ctx), key)
	if err != nil {
		return nil, err
	}
	if a.Status != "published" && actor.ID != a.AuthorID && actor.Role != "admin" {
		return nil, fault.New(fault.NotFound)
	}
	return Detail(a), nil
}

// sortColumns 是包内只读排序白名单，不能由请求扩展 SQL 字段。
var sortColumns = map[string]string{
	"publishedAt": "COALESCE(articles.published_at,articles.created_at)",
	"createdAt":   "articles.created_at",
	"viewCount":   "articles.view_count",
}

// Sort 将允许的排序字段映射为固定 SQL，并追加 ID 保证顺序稳定。
func Sort(raw string) string {
	desc := strings.HasPrefix(raw, "-")
	field := strings.TrimPrefix(raw, "-")

	col, ok := sortColumns[field]
	if !ok {
		col = sortColumns["publishedAt"]
		desc = true
	}
	dir := "ASC"
	if desc {
		dir = "DESC"
	}
	return col + " " + dir + ", articles.id DESC"
}

// Page 按权限调用方传入的范围分页查询；关键词计数限制在 2000 条以内。
func (s *Service) Page(ctx context.Context, q url.Values, status string, author int64) (map[string]any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx)
	filter := db.Model(&model.Article{}).Scopes(database.ActiveArticles)
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
		if err := db.Find(&all).Error; err != nil {
			return nil, err
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
		if err := db.Table("(?) AS bounded_articles", bounded).Count(&total).Error; err != nil {
			return nil, err
		}
	} else if err := countQuery.Count(&total).Error; err != nil {
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
	list := List(rows)
	return p.Result(list, total), nil
}
