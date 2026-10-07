// Package auth owns accounts, sessions and local credentials.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	DB     *gorm.DB
	Secret string
	Now    func() time.Time
	Wechat WechatClient
	AppID  string
}

func New(db *gorm.DB, secret string) *Service { return &Service{DB: db, Secret: secret, Now: time.Now} }
func Hash(s string) (string, error) {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	v, e := bcrypt.GenerateFromPassword(b, 12)
	return string(v), e
}
func Verify(s, hash string) bool {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), b) == nil
}
func Public(u model.User) map[string]any {
	out := map[string]any{"id": u.ID, "username": u.Username, "nickname": values.Name(u.DisplayName, u.Username), "avatar": u.AvatarURL, "role": u.Role, "status": u.Status, "level": u.Level, "createdAt": values.ISO(u.CreatedAt), "canSetCredentials": !u.CredentialsConfigured}
	if u.Email != nil && *u.Email != "" {
		out["email"] = *u.Email
	}
	return out
}
func (s *Service) User(ctx context.Context, id int64) (model.User, error) {
	var u model.User
	e := s.DB.WithContext(ctx).First(&u, id).Error
	return u, e
}
func (s *Service) Parse(raw string) (values.Actor, error) {
	token, e := jwt.Parse(raw, func(t *jwt.Token) (any, error) { return []byte(s.Secret), nil }, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired(), jwt.WithTimeFunc(s.Now))
	if e != nil || !token.Valid {
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
	id, e := strconv.ParseInt(sub, 10, 64)
	role, _ := c["role"].(string)
	a := values.Actor{ID: id, Role: role}
	if e != nil || id < 1 || a.Rank() == 0 {
		return values.Actor{}, fault.New(fault.Token)
	}
	return a, nil
}
func (s *Service) Result(db *gorm.DB, u model.User) (map[string]any, error) {
	now := s.Now()
	raw := make([]byte, 32)
	if _, e := rand.Read(raw); e != nil {
		return nil, e
	}
	refresh := hex.EncodeToString(raw)
	digest := sha256.Sum256([]byte(refresh))
	row := model.RefreshToken{TokenHash: hex.EncodeToString(digest[:]), UserID: u.ID, CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(7 * 24 * time.Hour).UnixMilli()}
	if e := db.Create(&row).Error; e != nil {
		return nil, e
	}
	token, e := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": strconv.FormatInt(u.ID, 10), "role": u.Role, "exp": now.Unix() + 3600}).SignedString([]byte(s.Secret))
	if e != nil {
		return nil, e
	}
	return map[string]any{"accessToken": token, "refreshToken": refresh, "expiresIn": 3600, "user": Public(u)}, nil
}
func (s *Service) Register(ctx context.Context, in values.Fields) (map[string]any, error) {
	if strings.TrimSpace(in.String("username")) == "" {
		return nil, fault.Field("username", "用户名不能为空")
	}
	hash, e := Hash(in.String("password"))
	if e != nil {
		return nil, e
	}
	now := s.Now().UnixMilli()
	name := in.String("username")
	if in.Has("nickname") {
		name = in.String("nickname")
	}
	u := model.User{Username: in.String("username"), Email: in.Text("email"), DisplayName: &name, PasswordHash: hash, CredentialsConfigured: true, Role: "member", Status: "active", Level: 1, CreatedAt: now, UpdatedAt: now}
	var result map[string]any
	e = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&u).Error; e != nil {
			return e
		}
		var e error
		result, e = s.Result(tx, u)
		return e
	})
	return result, e
}
func (s *Service) Login(ctx context.Context, in values.Fields) (map[string]any, error) {
	var u model.User
	if e := s.DB.WithContext(ctx).Where("username = ?", in.String("username")).First(&u).Error; e != nil {
		if e == gorm.ErrRecordNotFound {
			return nil, fault.New(fault.Credentials)
		}
		return nil, e
	}
	if u.Status == "disabled" {
		return nil, fault.New(fault.Disabled)
	}
	if !u.CredentialsConfigured || !Verify(in.String("password"), u.PasswordHash) {
		return nil, fault.New(fault.Credentials)
	}
	var result map[string]any
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.User
		if e := database.Lock(tx).First(&current, u.ID).Error; e != nil {
			return e
		}
		if current.Status == "disabled" {
			return fault.New(fault.Disabled)
		}
		if current.PasswordHash != u.PasswordHash {
			return fault.New(fault.Credentials)
		}
		var e error
		result, e = s.Result(tx, current)
		return e
	})
	return result, e
}
func (s *Service) Revoke(tx *gorm.DB, id int64) error {
	return tx.Model(&model.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", id).Update("revoked_at", s.Now().UnixMilli()).Error
}
func (s *Service) Logout(ctx context.Context, id int64) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if e := database.Lock(tx).First(&u, id).Error; e != nil {
			return e
		}
		return s.Revoke(tx, id)
	})
}
func (s *Service) Rotate(ctx context.Context, raw string) (map[string]any, error) {
	hash := sha256.Sum256([]byte(raw))
	key := hex.EncodeToString(hash[:])
	var old model.RefreshToken
	if e := s.DB.WithContext(ctx).Where("token_hash = ?", key).First(&old).Error; e != nil {
		if e == gorm.ErrRecordNotFound {
			return nil, fault.New(fault.Token)
		}
		return nil, e
	}
	var result map[string]any
	var decision error
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		if e := database.Lock(tx).First(&u, old.UserID).Error; e != nil {
			return e
		}
		var r model.RefreshToken
		if e := tx.Where("token_hash = ?", key).First(&r).Error; e != nil {
			return e
		}
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
		changed := tx.Model(&model.RefreshToken{}).Where("id = ? AND revoked_at IS NULL", r.ID).Update("revoked_at", s.Now().UnixMilli())
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			decision = fault.New(fault.Refresh)
			return s.Revoke(tx, u.ID)
		}
		var e error
		result, e = s.Result(tx, u)
		return e
	})
	if e != nil {
		return nil, e
	}
	return result, decision
}
