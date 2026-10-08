// Package model contains persistence rows, never HTTP responses.
package model

// ArticleTag 文章与标签的规范关联行，和文章标签投影在事务内同步。
type ArticleTag struct {
	ID        int64 `gorm:"column:id;primaryKey;autoIncrement"`
	ArticleID int64 `gorm:"column:article_id"`
	TagID     int64 `gorm:"column:tag_id"`
	CreatedAt int64 `gorm:"column:created_at"`
}

func (ArticleTag) TableName() string { return "article_tags" }
