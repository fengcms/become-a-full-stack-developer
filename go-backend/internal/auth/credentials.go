package auth

import (
	"context"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

func (s *Service) Profile(ctx context.Context, id int64, in values.Fields) (map[string]any, error) {
	u, e := s.User(ctx, id)
	if e != nil {
		return nil, e
	}
	patch := map[string]any{}
	for key, col := range map[string]string{"nickname": "display_name", "avatar": "avatar_url", "email": "email"} {
		if in.Has(key) {
			patch[col] = in[key]
		}
	}
	if len(patch) > 0 {
		patch["updated_at"] = s.Now().UnixMilli()
		if e = s.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(patch).Error; e != nil {
			return nil, e
		}
		u, e = s.User(ctx, id)
	}
	return Public(u), e
}
func (s *Service) ChangePassword(ctx context.Context, id int64, old, newPassword string, reset bool) error {
	u, e := s.User(ctx, id)
	if e != nil {
		return e
	}
	if !reset && !Verify(old, u.PasswordHash) {
		return fault.Field("oldPassword", "旧密码错误")
	}
	hash, e := Hash(newPassword)
	if e != nil {
		return e
	}
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.User
		if e := database.Lock(tx).First(&current, id).Error; e != nil {
			return e
		}
		if !reset && current.PasswordHash != u.PasswordHash {
			return fault.Field("oldPassword", "旧密码错误")
		}
		if e := tx.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{"password_hash": hash, "credentials_configured": true, "updated_at": s.Now().UnixMilli()}).Error; e != nil {
			return e
		}
		return s.Revoke(tx, id)
	})
}
func (s *Service) Setup(ctx context.Context, id int64, in values.Fields) (map[string]any, error) {
	hash, e := Hash(in.String("password"))
	if e != nil {
		return nil, e
	}
	var result map[string]any
	e = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if e := database.Lock(tx).First(&u, id).Error; e != nil {
			return e
		}
		var count int64
		if e := tx.Model(&model.WechatIdentity{}).Where("user_id = ?", id).Count(&count).Error; e != nil {
			return e
		}
		if u.Status != "active" {
			return fault.New(fault.Disabled)
		}
		if u.CredentialsConfigured || count == 0 {
			return fault.New(fault.Conflict)
		}
		patch := map[string]any{"username": in.String("username"), "password_hash": hash, "credentials_configured": true, "updated_at": s.Now().UnixMilli()}
		r := tx.Model(&model.User{}).Where("id = ? AND credentials_configured = ?", id, false).Updates(patch)
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return fault.New(fault.Conflict)
		}
		if e := s.Revoke(tx, id); e != nil {
			return e
		}
		if e := tx.First(&u, id).Error; e != nil {
			return e
		}
		var e error
		result, e = s.Result(tx, u)
		return e
	})
	return result, e
}
