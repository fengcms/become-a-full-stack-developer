// Package model contains persistence rows, never HTTP responses.
package model

// Tag 标签目录行，名称和 slug 通过领域更新同步到引用文章。
type Tag struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement"`
	Name      string `gorm:"column:name"`
	Slug      string `gorm:"column:slug"`
	CreatedAt int64  `gorm:"column:created_at"`
	UpdatedAt int64  `gorm:"column:updated_at"`
}

func (Tag) TableName() string { return "tags" }
