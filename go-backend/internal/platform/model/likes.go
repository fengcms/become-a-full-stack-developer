// Package model contains persistence rows, never HTTP responses.
package model

type Like struct {
	ID        int64 `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    int64 `gorm:"column:user_id"`
	ArticleID int64 `gorm:"column:article_id"`
	CreatedAt int64 `gorm:"column:created_at"`
}

func (Like) TableName() string { return "likes" }
