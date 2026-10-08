// Package model contains persistence rows, never HTTP responses.
package model

// Attachment 附件元数据，存储对象和所有者通过字段关联。
type Attachment struct {
	ID         int64  `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     int64  `gorm:"column:user_id"`
	ArticleID  *int64 `gorm:"column:article_id"`
	StorageKey string `gorm:"column:storage_key"`
	URL        string `gorm:"column:url"`
	Storage    string `gorm:"column:storage"`
	MimeType   string `gorm:"column:mime_type"`
	Size       int64  `gorm:"column:size"`
	CreatedAt  int64  `gorm:"column:created_at"`
}

func (Attachment) TableName() string { return "attachments" }
