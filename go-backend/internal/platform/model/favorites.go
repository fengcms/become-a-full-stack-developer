package model

// Favorite 用户与文章的收藏关系，唯一约束确保重复收藏幂等。
type Favorite struct {
	ID        int64 `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    int64 `gorm:"column:user_id"`
	ArticleID int64 `gorm:"column:article_id"`
	CreatedAt int64 `gorm:"column:created_at"`
}

func (Favorite) TableName() string { return "favorites" }
