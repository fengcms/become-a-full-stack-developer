// Package administration owns user administration and site configuration.
package administration

import (
	"context"
	"net/url"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

type Service struct {
	DB       *gorm.DB
	Now      func() time.Time
	Articles *article.Service
}

func New(db *gorm.DB, a *article.Service) *Service {
	return &Service{DB: db, Now: time.Now, Articles: a}
}
func (s *Service) Users(ctx context.Context, q url.Values) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx).Model(&model.User{})
	for _, col := range []string{"role", "status"} {
		if v := q.Get(col); v != "" {
			db = db.Where(col+" = ?", v)
		}
	}
	if k := q.Get("keyword"); k != "" {
		kw := "%" + k + "%"
		db = db.Where("LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?)", kw, kw, kw)
	}
	var n int64
	if e := db.Session(&gorm.Session{}).Count(&n).Error; e != nil {
		return nil, e
	}
	var rows []model.User
	if e := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, u := range rows {
		out = append(out, auth.Public(u))
	}
	return p.Result(out, n), nil
}
func (s *Service) User(ctx context.Context, id int64) (any, error) {
	var u model.User
	e := s.DB.WithContext(ctx).First(&u, id).Error
	return auth.Public(u), e
}
func (s *Service) UpdateUser(ctx context.Context, id, operator int64, in values.Fields) (any, error) {
	var u model.User
	e := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error { // Lock active admins in a consistent order before target to protect the last admin.
		var admins []model.User
		if e := database.Lock(tx).Where("role = ? AND status = ?", "admin", "active").Order("id ASC").Find(&admins).Error; e != nil {
			return e
		}
		if e := database.Lock(tx).First(&u, id).Error; e != nil {
			return e
		}
		priv := in.Has("role") || in.Has("status")
		if priv && id == operator {
			return fault.New(fault.Forbidden)
		}
		if priv && u.Role == "admin" && ((in.Has("role") && in.String("role") != "admin") || (in.Has("status") && in.String("status") == "disabled")) && len(admins) <= 1 {
			return fault.New(fault.Conflict)
		}
		patch := map[string]any{}
		for _, key := range []string{"role", "status", "level"} {
			if in.Has(key) {
				patch[key] = in[key]
			}
		}
		if len(patch) == 0 {
			return nil
		}
		patch["updated_at"] = s.Now().UnixMilli()
		if e := tx.Model(&u).Updates(patch).Error; e != nil {
			return e
		}
		return tx.First(&u, id).Error
	})
	return auth.Public(u), e
}
func (s *Service) Member(ctx context.Context, id int64, q url.Values) (any, error) {
	var u model.User
	if e := s.DB.WithContext(ctx).Where("id = ? AND status = ?", id, "active").First(&u).Error; e != nil {
		return nil, e
	}
	p, e := s.Articles.Page(ctx, q, "published", id)
	if e != nil {
		return nil, e
	}
	return map[string]any{"id": u.ID, "nickname": values.Name(u.DisplayName, u.Username), "avatar": u.AvatarURL, "level": u.Level, "articleCount": p["pagination"].(values.Page).Total, "articles": p["list"]}, nil
}
