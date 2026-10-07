// Package model contains persistence rows, never HTTP responses.
package model

type RefreshToken struct {
	ID        int64  `gorm:"column:id;primaryKey;autoIncrement"`
	TokenHash string `gorm:"column:token_hash"`
	UserID    int64  `gorm:"column:user_id"`
	ExpiresAt int64  `gorm:"column:expires_at"`
	RevokedAt *int64 `gorm:"column:revoked_at"`
	CreatedAt int64  `gorm:"column:created_at"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }
