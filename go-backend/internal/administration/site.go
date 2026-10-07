package administration

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func (s *Service) Site(ctx context.Context, in values.Fields) (any, error) {
	db := s.DB.WithContext(ctx)
	if len(in) > 0 {
		patch := map[string]any{"updated_at": s.Now().UnixMilli()}
		for key, col := range map[string]string{"siteName": "site_name", "siteTitle": "site_title", "siteDescription": "site_description", "siteKeywords": "site_keywords", "logoUrl": "logo_url", "copyright": "copyright"} {
			if in.Has(key) {
				patch[col] = in[key]
			}
		}
		if e := db.Model(&model.SiteSetting{}).Where("id = ?", 1).Updates(patch).Error; e != nil {
			return nil, e
		}
	}
	var v model.SiteSetting
	if e := db.First(&v, 1).Error; e != nil {
		return nil, e
	}
	return map[string]any{"id": v.ID, "siteName": v.SiteName, "siteTitle": v.SiteTitle, "siteDescription": v.SiteDescription, "siteKeywords": v.SiteKeywords, "logoUrl": v.LogoURL, "copyright": v.Copyright, "updatedAt": values.ISO(v.UpdatedAt)}, nil
}
func (s *Service) Stats(ctx context.Context) (any, error) {
	db := s.DB.WithContext(ctx)
	var a, c, u, v int64
	for _, q := range []struct {
		target *int64
		model  any
		where  string
		args   []any
	}{{&a, &model.Article{}, "status = ? AND deleted_at IS NULL", []any{"published"}}, {&c, &model.Comment{}, "status = ?", []any{"approved"}}, {&u, &model.User{}, "status = ?", []any{"active"}}} {
		if e := db.Model(q.model).Where(q.where, q.args...).Count(q.target).Error; e != nil {
			return nil, e
		}
	}
	if e := db.Model(&model.Article{}).Where("status = ? AND deleted_at IS NULL", "published").Select("COALESCE(SUM(view_count),0)").Scan(&v).Error; e != nil {
		return nil, e
	}
	return map[string]any{"articleCount": a, "commentCount": c, "memberCount": u, "viewTotal": v}, nil
}
