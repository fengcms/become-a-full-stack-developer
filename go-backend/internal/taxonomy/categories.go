// Package taxonomy owns category trees and the tag catalog.
package taxonomy

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
	"sort"
	"sync"
	"time"
)

type Service struct {
	DB  *gorm.DB
	Now func() time.Time
	mu  sync.Mutex
}

func New(db *gorm.DB) *Service { return &Service{DB: db, Now: time.Now} }
func Category(c model.Category) map[string]any {
	return map[string]any{"id": c.ID, "name": c.Name, "slug": c.Slug, "description": c.Description, "parentId": c.ParentID, "sortOrder": c.SortOrder}
}
func (s *Service) Categories(ctx context.Context) ([]model.Category, error) {
	var rows []model.Category
	e := s.DB.WithContext(ctx).Order("id ASC").Find(&rows).Error
	return rows, e
}
func (s *Service) List(ctx context.Context) (any, error) {
	rows, e := s.Categories(ctx)
	out := []map[string]any{}
	for _, c := range rows {
		out = append(out, Category(c))
	}
	return out, e
}
func (s *Service) Tree(ctx context.Context) (any, error) {
	rows, e := s.Categories(ctx)
	if e != nil {
		return nil, e
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SortOrder != rows[j].SortOrder {
			return rows[i].SortOrder < rows[j].SortOrder
		}
		return rows[i].ID < rows[j].ID
	})
	seen := map[int64]bool{}
	var build func(*int64) []map[string]any
	build = func(parent *int64) []map[string]any {
		out := []map[string]any{}
		for _, c := range rows {
			match := parent == nil && c.ParentID == nil || parent != nil && c.ParentID != nil && *parent == *c.ParentID
			if match && !seen[c.ID] {
				seen[c.ID] = true
				n := Category(c)
				delete(n, "parentId")
				n["children"] = build(&c.ID)
				out = append(out, n)
			}
		}
		return out
	}
	return build(nil), nil
}
func (s *Service) Breadcrumb(ctx context.Context, id int64) (any, error) {
	rows, e := s.Categories(ctx)
	if e != nil {
		return nil, e
	}
	by := map[int64]model.Category{}
	for _, c := range rows {
		by[c.ID] = c
	}
	if _, ok := by[id]; !ok {
		return nil, fault.New(fault.NotFound)
	}
	out := []map[string]any{}
	seen := map[int64]bool{}
	for id != 0 && !seen[id] {
		c, ok := by[id]
		if !ok {
			break
		}
		seen[id] = true
		out = append([]map[string]any{{"id": c.ID, "name": c.Name, "slug": c.Slug}}, out...)
		id = 0
		if c.ParentID != nil {
			id = *c.ParentID
		}
	}
	return out, nil
}
func validateTree(rows []model.Category) error {
	by := map[int64]model.Category{}
	for _, c := range rows {
		by[c.ID] = c
	}
	for _, c := range rows {
		depth := 1
		seen := map[int64]bool{c.ID: true}
		p := c.ParentID
		for p != nil {
			if seen[*p] {
				return fault.New(fault.Conflict)
			}
			seen[*p] = true
			parent, ok := by[*p]
			if !ok {
				return fault.New(fault.NotFound)
			}
			depth++
			if depth > 4 {
				return fault.New(fault.Conflict)
			}
			p = parent.ParentID
		}
	}
	return nil
}
func (s *Service) Save(ctx context.Context, id int64, in values.Fields) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var c model.Category
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if id > 0 {
			if e := tx.First(&c, id).Error; e != nil {
				return e
			}
		} else {
			c.CreatedAt = s.Now().UnixMilli()
		}
		c.Name = in.String("name")
		c.Slug = in.String("slug")
		if in.Has("description") {
			c.Description = in.Text("description")
		}
		if in.Has("parentId") {
			c.ParentID = in.Number("parentId")
		}
		if in.Has("sortOrder") {
			c.SortOrder = in.Int("sortOrder")
		}
		c.UpdatedAt = s.Now().UnixMilli()
		var rows []model.Category
		if e := tx.Find(&rows).Error; e != nil {
			return e
		}
		if id == 0 {
			c.ID = -1
			rows = append(rows, c)
			c.ID = 0
		} else {
			for i := range rows {
				if rows[i].ID == id {
					rows[i] = c
				}
			}
		}
		if e := validateTree(rows); e != nil {
			return e
		}
		if id == 0 {
			return tx.Create(&c).Error
		}
		if e := tx.Model(&model.Category{}).Where("id = ?", id).Updates(map[string]any{"name": c.Name, "slug": c.Slug, "description": c.Description, "parent_id": c.ParentID, "sort_order": c.SortOrder, "updated_at": c.UpdatedAt}).Error; e != nil {
			return e
		}
		return tx.Model(&model.Article{}).Where("category_id = ? AND deleted_at IS NULL", id).Updates(map[string]any{"category_name": c.Name, "category_slug": c.Slug}).Error
	})
	return Category(c), e
}
func (s *Service) Delete(ctx context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var c model.Category
		if e := tx.First(&c, id).Error; e != nil {
			return e
		}
		var count int64
		if e := tx.Model(&model.Category{}).Where("parent_id = ?", id).Count(&count).Error; e != nil {
			return e
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		if e := tx.Model(&model.Article{}).Where("category_id = ? AND deleted_at IS NULL", id).Count(&count).Error; e != nil {
			return e
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		return tx.Delete(&c).Error
	})
}
func (s *Service) Stats(ctx context.Context) (any, error) {
	rows, e := s.Categories(ctx)
	if e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, c := range rows {
		var count int64
		if e := s.DB.WithContext(ctx).Model(&model.Article{}).Where("category_id = ? AND status = ? AND deleted_at IS NULL", c.ID, "published").Count(&count).Error; e != nil {
			return nil, e
		}
		out = append(out, map[string]any{"id": c.ID, "name": c.Name, "slug": c.Slug, "articleCount": count})
	}
	return out, nil
}
