// Package taxonomy 管理分类树和标签目录。
package taxonomy

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Service 负责分类树和标签目录；分类写操作在本进程互斥。
type Service struct {
	DB  *gorm.DB
	Now func() time.Time
	mu  sync.Mutex
}

// New 创建分类标签服务和默认时钟。
func New(db *gorm.DB) *Service { return &Service{DB: db, Now: time.Now} }

// Category 转换分类契约字段，不将 ORM 行直接作为响应。
func Category(c model.Category) map[string]any {
	return map[string]any{
		"id":          c.ID,
		"name":        c.Name,
		"slug":        c.Slug,
		"description": c.Description,
		"parentId":    c.ParentID,
		"sortOrder":   c.SortOrder,
	}
}

// Categories 按排序值和 ID 稳定读取分类节点。
func (s *Service) Categories(ctx context.Context) ([]model.Category, error) {
	var rows []model.Category
	err := s.DB.WithContext(ctx).Order("id ASC").Find(&rows).Error
	return rows, err
}

// List 返回平面分类目录，空结果保持数组形状。
func (s *Service) List(ctx context.Context) (any, error) {
	rows, err := s.Categories(ctx)
	out := []map[string]any{}
	for _, c := range rows {
		out = append(out, Category(c))
	}
	return out, err
}

// Tree 组装有界分类树，叶子节点 children 为数组而不是 NULL。
func (s *Service) Tree(ctx context.Context) (any, error) {
	rows, err := s.Categories(ctx)
	if err != nil {
		return nil, err
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

// Breadcrumb 返回从根到当前分类的路径，缺失节点返回不存在。
func (s *Service) Breadcrumb(ctx context.Context, id int64) (any, error) {
	rows, err := s.Categories(ctx)
	if err != nil {
		return nil, err
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
		out = append([]map[string]any{{
			"id":   c.ID,
			"name": c.Name,
			"slug": c.Slug,
		}}, out...)
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

// Save 在事务内创建或更新分类，并同步引用文章的分类投影。
func (s *Service) Save(ctx context.Context, id int64, in values.Fields) (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var c model.Category
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.saveCategoryTx(tx, id, in, &c)
	})
	return Category(c), txErr
}

// Delete 删除分类前检查子节点和未删除文章引用。
func (s *Service) Delete(ctx context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var c model.Category
		if err := tx.First(&c, id).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.Category{}).Where("parent_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		if err := tx.Model(&model.Article{}).
			Scopes(database.ActiveArticles).
			Where("category_id = ?", id).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fault.New(fault.Conflict)
		}
		return tx.Delete(&c).Error
	})
}

// Stats 按分类统计未删除且已发布文章。
func (s *Service) Stats(ctx context.Context) (any, error) {
	rows, err := s.Categories(ctx)
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, c := range rows {
		var count int64
		if err := s.DB.WithContext(ctx).
			Model(&model.Article{}).
			Scopes(database.ActiveArticles).
			Where("category_id = ? AND status = ?", c.ID, "published").
			Count(&count).Error; err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id":           c.ID,
			"name":         c.Name,
			"slug":         c.Slug,
			"articleCount": count,
		})
	}
	return out, nil
}

// saveCategoryTx 仅使用调用者事务，目录行和文章投影必须一起成功。
func (s *Service) saveCategoryTx(tx *gorm.DB, id int64, in values.Fields, c *model.Category) error {
	if id > 0 {
		if err := tx.First(c, id).Error; err != nil {
			return err
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
	if err := tx.Find(&rows).Error; err != nil {
		return err
	}
	if id == 0 {
		c.ID = -1
		rows = append(rows, *c)
		c.ID = 0
	} else {
		for i := range rows {
			if rows[i].ID == id {
				rows[i] = *c
			}
		}
	}
	if err := validateTree(rows); err != nil {
		return err
	}
	if id == 0 {
		return tx.Create(c).Error
	}
	if err := tx.Model(&model.Category{}).Where("id = ?", id).Updates(map[string]any{
		"name":        c.Name,
		"slug":        c.Slug,
		"description": c.Description,
		"parent_id":   c.ParentID,
		"sort_order":  c.SortOrder,
		"updated_at":  c.UpdatedAt,
	}).Error; err != nil {
		return err
	}
	return tx.Model(&model.Article{}).
		Scopes(database.ActiveArticles).
		Where("category_id = ?", id).
		Updates(map[string]any{
			"category_name": c.Name,
			"category_slug": c.Slug,
		}).Error
}
