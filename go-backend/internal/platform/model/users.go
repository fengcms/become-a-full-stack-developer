// Package model contains persistence rows, never HTTP responses.
package model

// User 账号行；密码哈希和凭据配置标志不直接序列化为 HTTP 响应。
type User struct {
	ID                    int64   `gorm:"column:id;primaryKey;autoIncrement"`
	Username              string  `gorm:"column:username"`
	PasswordHash          string  `gorm:"column:password_hash"`
	CredentialsConfigured bool    `gorm:"column:credentials_configured"`
	Role                  string  `gorm:"column:role"`
	Email                 *string `gorm:"column:email"`
	DisplayName           *string `gorm:"column:display_name"`
	AvatarURL             *string `gorm:"column:avatar_url"`
	Bio                   *string `gorm:"column:bio"`
	Level                 int64   `gorm:"column:level"`
	Status                string  `gorm:"column:status"`
	CreatedAt             int64   `gorm:"column:created_at"`
	UpdatedAt             int64   `gorm:"column:updated_at"`
}

func (User) TableName() string { return "users" }
