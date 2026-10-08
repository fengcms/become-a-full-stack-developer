// Package model contains persistence rows, never HTTP responses.
package model

// Article 文章持久化行，毫秒时间和显式软删除字段与 Node 数据一致。
type Article struct {
	ID           int64   `gorm:"column:id;primaryKey;autoIncrement"`
	Title        string  `gorm:"column:title"`
	Slug         *string `gorm:"column:slug"`
	Summary      *string `gorm:"column:summary"`
	Content      string  `gorm:"column:content"`
	CoverImage   *string `gorm:"column:cover_image"`
	AuthorID     int64   `gorm:"column:author_id"`
	AuthorName   *string `gorm:"column:author_name"`
	CategoryID   *int64  `gorm:"column:category_id"`
	CategoryName *string `gorm:"column:category_name"`
	CategorySlug *string `gorm:"column:category_slug"`
	Status       string  `gorm:"column:status"`
	Tags         *string `gorm:"column:tags"`
	ViewCount    int64   `gorm:"column:view_count"`
	LikeCount    int64   `gorm:"column:like_count"`
	PublishedAt  *int64  `gorm:"column:published_at"`
	CreatedAt    int64   `gorm:"column:created_at"`
	UpdatedAt    int64   `gorm:"column:updated_at"`
	DeletedAt    *int64  `gorm:"column:deleted_at"`
}

func (Article) TableName() string { return "articles" }
