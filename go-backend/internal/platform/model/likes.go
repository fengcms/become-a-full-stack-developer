// Package model contains persistence rows, never HTTP responses.
package model

// Like 用户与文章的点赞关系，文章计数必须与关系行数一致。
type Like struct {
	ID        int64 `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    int64 `gorm:"column:user_id"`
	ArticleID int64 `gorm:"column:article_id"`
	CreatedAt int64 `gorm:"column:created_at"`
}

func (Like) TableName() string { return "likes" }
