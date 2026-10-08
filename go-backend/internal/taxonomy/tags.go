package taxonomy

import (
	"context"
	"encoding/json"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func tagView(db *gorm.DB, t model.Tag) (map[string]any, error) {
	var n int64
	err := db.Model(&model.ArticleTag{}).
		Joins("JOIN articles ON articles.id=article_tags.article_id").
		Scopes(database.ActiveArticles).
		Where("article_tags.tag_id = ? AND articles.status = ?", t.ID, "published").
		Count(&n).Error
	return map[string]any{
		"id":           t.ID,
		"name":         t.Name,
		"slug":         t.Slug,
		"articleCount": n,
	}, err
}

// Tags 返回标签目录和其公开文章引用数。
func (s *Service) Tags(ctx context.Context) (any, error) {
	db := s.DB.WithContext(ctx)
	var rows []model.Tag
	if err := db.Order("id").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, t := range rows {
		v, err := tagView(db, t)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

// SaveTag 更新标签目录、关联文章 JSON 投影，在同一事务完成。
func (s *Service) SaveTag(ctx context.Context, id int64, in values.Fields) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var t model.Tag
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.saveTagTx(tx, id, in, &t)
	})
	if txErr != nil {
		return nil, txErr
	}
	return tagView(s.DB.WithContext(ctx), t)
}

// DeleteTag 禁止删除仍被文章关联引用的标签。
func (s *Service) DeleteTag(ctx context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var t model.Tag
		if err := tx.First(&t, id).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.ArticleTag{}).Where("tag_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		return tx.Delete(&t).Error
	})
}

// saveTagTx 仅使用调用者事务，目录行和文章投影必须一起成功。
func (s *Service) saveTagTx(tx *gorm.DB, id int64, in values.Fields, t *model.Tag) error {
	if id > 0 {
		if err := tx.First(t, id).Error; err != nil {
			return err
		}
	} else {
		t.CreatedAt = s.Now().UnixMilli()
	}
	oldName, oldSlug := t.Name, t.Slug
	t.Name = in.String("name")
	t.Slug = in.String("slug")
	t.UpdatedAt = s.Now().UnixMilli()
	if id == 0 {
		return tx.Create(t).Error
	}
	if err := tx.Model(t).Updates(map[string]any{
		"name":       t.Name,
		"slug":       t.Slug,
		"updated_at": t.UpdatedAt,
	}).Error; err != nil {
		return err
	}
	var articles []model.Article
	if err := tx.Joins("JOIN article_tags ON article_tags.article_id=articles.id").
		Where("article_tags.tag_id = ?", id).
		Find(&articles).Error; err != nil {
		return err
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
		if err := tx.Model(&model.Article{}).
			Where("id = ?", a.ID).
			Update("tags", string(b)).Error; err != nil {
			return err
		}
	}
	return nil
}
