// Package model contains persistence rows, never HTTP responses.
package model

// Category 分类节点，parentId 表示父节点，层级限制由领域服务检查。
type Category struct {
	ID          int64   `gorm:"column:id;primaryKey;autoIncrement"`
	Name        string  `gorm:"column:name"`
	Slug        string  `gorm:"column:slug"`
	Description *string `gorm:"column:description"`
	ParentID    *int64  `gorm:"column:parent_id"`
	SortOrder   int64   `gorm:"column:sort_order"`
	CreatedAt   int64   `gorm:"column:created_at"`
	UpdatedAt   int64   `gorm:"column:updated_at"`
}

func (Category) TableName() string { return "categories" }
