// Package model contains persistence rows, never HTTP responses.
package model

type Tag struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement"`
	Name      string `gorm:"column:name"`
	Slug      string `gorm:"column:slug"`
	CreatedAt int64  `gorm:"column:created_at"`
	UpdatedAt int64  `gorm:"column:updated_at"`
}

func (Tag) TableName() string { return "tags" }
