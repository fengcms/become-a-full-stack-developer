package model

// ViewDedup 文章阅读的去重键和滚动窗口起点，不参与历史数据迁移。
type ViewDedup struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement"`
	ArticleID int64  `gorm:"column:article_id"`
	DedupKey  string `gorm:"column:dedup_key"`
	CreatedAt int64  `gorm:"column:created_at"`
}

func (ViewDedup) TableName() string { return "article_view_dedup" }
