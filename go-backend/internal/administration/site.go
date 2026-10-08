package administration

import (
	"context"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

// Site 读取单例站点设置；只有提供字段时才应用白名单更新。
func (s *Service) Site(ctx context.Context, in values.Fields) (any, error) {
	db := s.DB.WithContext(ctx)
	if len(in) > 0 {
		patch := map[string]any{"updated_at": s.Now().UnixMilli()}
		for key, col := range map[string]string{
			"siteName":        "site_name",
			"siteTitle":       "site_title",
			"siteDescription": "site_description",
			"siteKeywords":    "site_keywords",
			"logoUrl":         "logo_url",
			"copyright":       "copyright",
		} {
			if in.Has(key) {
				patch[col] = in[key]
			}
		}
		if err := db.Model(&model.SiteSetting{}).Where("id = ?", 1).Updates(patch).Error; err != nil {
			return nil, err
		}
	}
	var v model.SiteSetting
	if err := db.First(&v, 1).Error; err != nil {
		return nil, err
	}
	return map[string]any{
		"id":              v.ID,
		"siteName":        v.SiteName,
		"siteTitle":       v.SiteTitle,
		"siteDescription": v.SiteDescription,
		"siteKeywords":    v.SiteKeywords,
		"logoUrl":         v.LogoURL,
		"copyright":       v.Copyright,
		"updatedAt":       values.ISO(v.UpdatedAt),
	}, nil
}

// Stats 统计已发布文章、已审核评论、活跃会员和有效文章阅读总量。
func (s *Service) Stats(ctx context.Context) (any, error) {
	db := s.DB.WithContext(ctx)
	var a, c, u, v int64
	for _, q := range []struct {
		target *int64
		model  any
		where  string
		args   []any
	}{
		{
			&a,
			&model.Article{},
			"status = ?",
			[]any{"published"},
		},
		{
			&c,
			&model.Comment{},
			"status = ?",
			[]any{"approved"},
		},
		{
			&u,
			&model.User{},
			"status = ?",
			[]any{"active"},
		},
	} {
		query := db.Model(q.model)
		if _, isArticle := q.model.(*model.Article); isArticle {
			query = query.Scopes(database.ActiveArticles)
		}
		if err := query.Where(q.where, q.args...).Count(q.target).Error; err != nil {
			return nil, err
		}
	}
	if err := db.Model(&model.Article{}).
		Scopes(database.ActiveArticles).
		Where("status = ?", "published").
		Select("COALESCE(SUM(view_count),0)").
		Scan(&v).Error; err != nil {
		return nil, err
	}
	return map[string]any{
		"articleCount": a,
		"commentCount": c,
		"memberCount":  u,
		"viewTotal":    v,
	}, nil
}
