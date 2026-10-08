package model

// History 阅读历史行，可空进度区分没有记录与明确的零。
type History struct {
	ID         int64  `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     int64  `gorm:"column:user_id"`
	ArticleID  int64  `gorm:"column:article_id"`
	LastReadAt int64  `gorm:"column:last_read_at"`
	Progress   *int64 `gorm:"column:progress"`
}

func (History) TableName() string { return "view_history" }
