// Package model contains persistence rows, never HTTP responses.
package model

type Comment struct {
	ID             int64   `gorm:"column:id;primaryKey;autoIncrement"`
	ArticleID      int64   `gorm:"column:article_id"`
	UserID         int64   `gorm:"column:user_id"`
	UserName       string  `gorm:"column:user_name"`
	ParentID       *int64  `gorm:"column:parent_id"`
	Content        string  `gorm:"column:content"`
	Status         string  `gorm:"column:status"`
	RejectedReason *string `gorm:"column:rejected_reason"`
	CreatedAt      int64   `gorm:"column:created_at"`
}

func (Comment) TableName() string { return "comments" }
