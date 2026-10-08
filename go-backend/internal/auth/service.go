// Package auth owns accounts, sessions and local credentials.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Service 负责密码、JWT、刷新会话和微信身份，外部换码与时钟可注入。
type Service struct {
	DB     *gorm.DB
	Secret string
	Now    func() time.Time
	Wechat WechatClient
	AppID  string
}

// New 装配数据库、JWT 密钥和默认时钟。
func New(db *gorm.DB, secret string) *Service {
	return &Service{
		DB:     db,
		Secret: secret,
		Now:    time.Now,
	}
}

// Hash 使用 bcrypt cost 12，按 UTF-8 字节截断到 72 字节以兼容 Node。
func Hash(s string) (string, error) {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	v, err := bcrypt.GenerateFromPassword(b, 12)
	return string(v), err
}

// Verify 按相同的 72 字节规则验证密码，不把密码内容写入日志。
func Verify(s, hash string) bool {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), b) == nil
}

// Public 转换公开用户字段，密码哈希和微信 openid 不进入响应。
func Public(u model.User) map[string]any {
	out := map[string]any{
		"id":                u.ID,
		"username":          u.Username,
		"nickname":          values.Name(u.DisplayName, u.Username),
		"avatar":            u.AvatarURL,
		"role":              u.Role,
		"status":            u.Status,
		"level":             u.Level,
		"createdAt":         values.ISO(u.CreatedAt),
		"canSetCredentials": !u.CredentialsConfigured,
	}
	if u.Email != nil && *u.Email != "" {
		out["email"] = *u.Email
	}
	return out
}

// User 读取账号行，供认证后的资料操作使用。
func (s *Service) User(ctx context.Context, id int64) (model.User, error) {
	var u model.User
	err := s.DB.WithContext(ctx).First(&u, id).Error
	return u, err
}

// Parse 限定 HS256 并验证 JWT 有效期，再提取字符串用户 ID 与角色。
func (s *Service) Parse(raw string) (values.Actor, error) {
	token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		return []byte(s.Secret), nil
	}, jwt.WithValidMethods([]string{
		"HS256",
	}), jwt.WithExpirationRequired(), jwt.WithTimeFunc(s.Now))
	if err != nil || !token.Valid {
		return values.Actor{}, fault.New(fault.Token)
	}
	c, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return values.Actor{}, fault.New(fault.Token)
	}
	sub, ok := c["sub"].(string)
	if !ok {
		return values.Actor{}, fault.New(fault.Token)
	}
	id, err := strconv.ParseInt(sub, 10, 64)
	role, _ := c["role"].(string)
	a := values.Actor{ID: id, Role: role}
	if err != nil || id < 1 || a.Rank() == 0 {
		return values.Actor{}, fault.New(fault.Token)
	}
	return a, nil
}

// Result 签发短期访问令牌和刷新令牌，数据库只保存刷新令牌哈希。
func (s *Service) Result(db *gorm.DB, u model.User) (map[string]any, error) {
	now := s.Now()
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	refresh := hex.EncodeToString(raw)
	digest := sha256.Sum256([]byte(refresh))
	row := model.RefreshToken{
		TokenHash: hex.EncodeToString(digest[:]),
		UserID:    u.ID,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(7 * 24 * time.Hour).UnixMilli(),
	}
	if err := db.Create(&row).Error; err != nil {
		return nil, err
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  strconv.FormatInt(u.ID, 10),
		"role": u.Role,
		"exp":  now.Unix() + 3600,
	}).SignedString([]byte(s.Secret))
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"accessToken":  token,
		"refreshToken": refresh,
		"expiresIn":    3600,
		"user":         Public(u),
	}, nil
}

// Register 在事务内创建密码账号和首次刷新会话。
func (s *Service) Register(ctx context.Context, in values.Fields) (map[string]any, error) {
	if strings.TrimSpace(in.String("username")) == "" {
		return nil, fault.Field("username", "用户名不能为空")
	}
	hash, err := Hash(in.String("password"))
	if err != nil {
		return nil, err
	}
	now := s.Now().UnixMilli()
	name := in.String("username")
	if in.Has("nickname") {
		name = in.String("nickname")
	}
	u := model.User{
		Username:              in.String("username"),
		Email:                 in.Text("email"),
		DisplayName:           &name,
		PasswordHash:          hash,
		CredentialsConfigured: true,
		Role:                  "member",
		Status:                "active",
		Level:                 1,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	var result map[string]any
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&u).Error; err != nil {
			return err
		}
		var err error
		result, err = s.Result(tx, u)
		return err
	})
	return result, err
}

// Login 验证账号状态与密码，并在锁内复核凭据后签发新会话。
func (s *Service) Login(ctx context.Context, in values.Fields) (map[string]any, error) {
	var u model.User
	if err := s.DB.WithContext(ctx).Where("username = ?", in.String("username")).First(&u).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fault.New(fault.Credentials)
		}
		return nil, err
	}
	if u.Status == "disabled" {
		return nil, fault.New(fault.Disabled)
	}
	if !u.CredentialsConfigured || !Verify(in.String("password"), u.PasswordHash) {
		return nil, fault.New(fault.Credentials)
	}
	var result map[string]any
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.User
		if err := database.Lock(tx).First(&current, u.ID).Error; err != nil {
			return err
		}
		if current.Status == "disabled" {
			return fault.New(fault.Disabled)
		}
		if current.PasswordHash != u.PasswordHash {
			return fault.New(fault.Credentials)
		}
		var err error
		result, err = s.Result(tx, current)
		return err
	})
	return result, txErr
}

// Revoke 撤销一个账号的全部刷新会话；调用者决定所在事务。
func (s *Service) Revoke(tx *gorm.DB, id int64) error {
	return tx.Model(&model.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", s.Now().UnixMilli()).Error
}

// Logout 在账号锁保护下撤销刷新会话，不改变既有短期 JWT 协议。
func (s *Service) Logout(ctx context.Context, id int64) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if err := database.Lock(tx).First(&u, id).Error; err != nil {
			return err
		}
		return s.Revoke(tx, id)
	})
}

// Rotate 原子消费刷新令牌；检测重放时提交整族撤销，再返回业务错误。
func (s *Service) Rotate(ctx context.Context, raw string) (map[string]any, error) {
	hash := sha256.Sum256([]byte(raw))
	key := hex.EncodeToString(hash[:])
	var old model.RefreshToken
	if err := s.DB.WithContext(ctx).Where("token_hash = ?", key).First(&old).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fault.New(fault.Token)
		}
		return nil, err
	}
	var result map[string]any
	// decision 是业务结果，txErr 是执行失败；两者不能混为回滚原因。
	var decision error
	txErr := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if err := database.Lock(tx).First(&u, old.UserID).Error; err != nil {
			return err
		}
		var r model.RefreshToken
		if err := tx.Where("token_hash = ?", key).First(&r).Error; err != nil {
			return err
		}
		// 重放表示会话可能泄露：返回 nil 提交撤销，业务错误在事务外返回。
		if r.RevokedAt != nil {
			decision = fault.New(fault.Refresh)
			return s.Revoke(tx, u.ID)
		}
		if r.ExpiresAt < s.Now().UnixMilli() {
			decision = fault.New(fault.Refresh)
			return nil
		}
		if u.Status == "disabled" {
			decision = fault.New(fault.Disabled)
			return nil
		}
		changed := tx.Model(&model.RefreshToken{}).
			Where("id = ? AND revoked_at IS NULL", r.ID).
			Update("revoked_at", s.Now().UnixMilli())
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			decision = fault.New(fault.Refresh)
			return s.Revoke(tx, u.ID)
		}
		var err error
		result, err = s.Result(tx, u)
		return err
	})
	if txErr != nil {
		return nil, txErr
	}
	return result, decision
}
