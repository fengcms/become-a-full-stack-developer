package auth

import (
	"context"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

// Profile 读取或按存在性更新个人资料，保留 NULL 和未提交字段的区别。
func (s *Service) Profile(ctx context.Context, id int64, in values.Fields) (map[string]any, error) {
	u, err := s.User(ctx, id)
	if err != nil {
		return nil, err
	}
	patch := map[string]any{}
	for key, col := range map[string]string{
		"nickname": "display_name",
		"avatar":   "avatar_url",
		"email":    "email",
	} {
		if in.Has(key) {
			patch[col] = in[key]
		}
	}
	if len(patch) > 0 {
		patch["updated_at"] = s.Now().UnixMilli()
		if err = s.DB.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(patch).Error; err != nil {
			return nil, err
		}
		u, err = s.User(ctx, id)
	}
	return Public(u), err
}

// ChangePassword 在事务外执行昂贵的密码计算，锁内复核后更新并撤销会话。
func (s *Service) ChangePassword(ctx context.Context, id int64, old, newPassword string, reset bool) error {
	u, err := s.User(ctx, id)
	if err != nil {
		return err
	}
	if !reset && !Verify(old, u.PasswordHash) {
		return fault.Field("oldPassword", "旧密码错误")
	}
	// bcrypt 在取得数据库锁前完成，避免长时间占有账号行锁。
	hash, err := Hash(newPassword)
	if err != nil {
		return err
	}
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.User
		if err := database.Lock(tx).First(&current, id).Error; err != nil {
			return err
		}
		if !reset && current.PasswordHash != u.PasswordHash {
			return fault.Field("oldPassword", "旧密码错误")
		}
		if err := tx.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{
			"password_hash":          hash,
			"credentials_configured": true,
			"updated_at":             s.Now().UnixMilli(),
		}).Error; err != nil {
			return err
		}
		return s.Revoke(tx, id)
	})
}

// Setup 仅为未配置凭据的微信账号设置一次用户名密码，并旋转会话。
func (s *Service) Setup(ctx context.Context, id int64, in values.Fields) (map[string]any, error) {
	hash, err := Hash(in.String("password"))
	if err != nil {
		return nil, err
	}
	var result map[string]any
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if err := database.Lock(tx).First(&u, id).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.WechatIdentity{}).Where("user_id = ?", id).Count(&count).Error; err != nil {
			return err
		}
		if u.Status != "active" {
			return fault.New(fault.Disabled)
		}
		if u.CredentialsConfigured || count == 0 {
			return fault.New(fault.Conflict)
		}
		patch := map[string]any{
			"username":               in.String("username"),
			"password_hash":          hash,
			"credentials_configured": true,
			"updated_at":             s.Now().UnixMilli(),
		}
		r := tx.Model(&model.User{}).Where("id = ? AND credentials_configured = ?", id, false).Updates(patch)
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return fault.New(fault.Conflict)
		}
		if err := s.Revoke(tx, id); err != nil {
			return err
		}
		if err := tx.First(&u, id).Error; err != nil {
			return err
		}
		var err error
		result, err = s.Result(tx, u)
		return err
	})
	return result, err
}
