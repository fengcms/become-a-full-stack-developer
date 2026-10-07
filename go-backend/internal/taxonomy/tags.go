package taxonomy

import (
	"context"
	"encoding/json"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func tagView(db *gorm.DB, t model.Tag) (map[string]any, error) {
	var n int64
	e := db.Model(&model.ArticleTag{}).Joins("JOIN articles ON articles.id=article_tags.article_id").Where("article_tags.tag_id = ? AND articles.status = ? AND articles.deleted_at IS NULL", t.ID, "published").Count(&n).Error
	return map[string]any{"id": t.ID, "name": t.Name, "slug": t.Slug, "articleCount": n}, e
}
func (s *Service) Tags(ctx context.Context) (any, error) {
	db := s.DB.WithContext(ctx)
	var rows []model.Tag
	if e := db.Order("id").Find(&rows).Error; e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, t := range rows {
		v, e := tagView(db, t)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, nil
}
func (s *Service) SaveTag(ctx context.Context, id int64, in values.Fields) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var t model.Tag
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if id > 0 {
			if e := tx.First(&t, id).Error; e != nil {
				return e
			}
		} else {
			t.CreatedAt = s.Now().UnixMilli()
		}
		oldName, oldSlug := t.Name, t.Slug
		t.Name = in.String("name")
		t.Slug = in.String("slug")
		t.UpdatedAt = s.Now().UnixMilli()
		if id == 0 {
			return tx.Create(&t).Error
		}
		if e := tx.Model(&t).Updates(map[string]any{"name": t.Name, "slug": t.Slug, "updated_at": t.UpdatedAt}).Error; e != nil {
			return e
		}
		var articles []model.Article
		if e := tx.Joins("JOIN article_tags ON article_tags.article_id=articles.id").Where("article_tags.tag_id = ?", id).Find(&articles).Error; e != nil {
			return e
		}
		for _, a := range articles {
			if a.Tags == nil {
				continue
			}
			var names []string
			if json.Unmarshal([]byte(*a.Tags), &names) != nil {
				continue
			}
			for i, n := range names {
				if n == oldName {
					names[i] = t.Name
				} else if n == oldSlug {
					names[i] = t.Slug
				}
			}
			b, _ := json.Marshal(names)
			if e := tx.Model(&model.Article{}).Where("id = ?", a.ID).Update("tags", string(b)).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if e != nil {
		return nil, e
	}
	return tagView(s.DB.WithContext(ctx), t)
}
func (s *Service) DeleteTag(ctx context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var t model.Tag
		if e := tx.First(&t, id).Error; e != nil {
			return e
		}
		var count int64
		if e := tx.Model(&model.ArticleTag{}).Where("tag_id = ?", id).Count(&count).Error; e != nil {
			return e
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		return tx.Delete(&t).Error
	})
}
