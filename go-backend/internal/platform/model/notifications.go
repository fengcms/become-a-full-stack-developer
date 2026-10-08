// Package model contains persistence rows, never HTTP responses.
package model

// Notification 用户通知行，审核或发布事件在所属事务中创建。
type Notification struct {
	ID        int64   `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    int64   `gorm:"column:user_id"`
	Type      string  `gorm:"column:type"`
	Title     string  `gorm:"column:title"`
	Body      *string `gorm:"column:body"`
	Link      *string `gorm:"column:link"`
	IsRead    bool    `gorm:"column:is_read"`
	CreatedAt int64   `gorm:"column:created_at"`
}

func (Notification) TableName() string { return "notifications" }
