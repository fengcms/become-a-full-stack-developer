// Package model contains persistence rows, never HTTP responses.
package model

type History struct {
	ID         int64  `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     int64  `gorm:"column:user_id"`
	ArticleID  int64  `gorm:"column:article_id"`
	LastReadAt int64  `gorm:"column:last_read_at"`
	Progress   *int64 `gorm:"column:progress"`
}

func (History) TableName() string { return "view_history" }
