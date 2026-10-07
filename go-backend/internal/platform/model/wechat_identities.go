// Package model contains persistence rows, never HTTP responses.
package model

type WechatIdentity struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement"`
	AppID     string `gorm:"column:app_id"`
	OpenID    string `gorm:"column:open_id"`
	UserID    int64  `gorm:"column:user_id"`
	CreatedAt int64  `gorm:"column:created_at"`
}

func (WechatIdentity) TableName() string { return "wechat_identities" }
