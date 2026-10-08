// Package administration 管理后台用户操作和站点配置。
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

// Service 组合用户管理、站点设置和公开会员资料的业务能力。
type Service struct {
	DB       *gorm.DB
	Now      func() time.Time
	Articles *article.Service
}

// New 装配管理服务，并复用文章服务的公开查询规则。
func New(db *gorm.DB, a *article.Service) *Service {
	return &Service{
		DB:       db,
		Now:      time.Now,
		Articles: a,
	}
}

// Users 按允许的筛选字段分页查询用户。
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
	if err := db.Session(&gorm.Session{}).Count(&n).Error; err != nil {
		return nil, err
	}
	var rows []model.User
	if err := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, u := range rows {
		out = append(out, auth.Public(u))
	}
	return p.Result(out, n), nil
}

// User 读取后台用户详情，不输出密码哈希。
func (s *Service) User(ctx context.Context, id int64) (any, error) {
	var u model.User
	err := s.DB.WithContext(ctx).First(&u, id).Error
	return auth.Public(u), err
}

// UpdateUser 更新用户资料，并保护自身权限和最后一个活跃管理员。
func (s *Service) UpdateUser(ctx context.Context, id, operator int64, in values.Fields) (any, error) {
	var u model.User
	txErr := s.DB.WithContext(ctx).
		Transaction(func(tx *gorm.DB) error {
			// 先按 ID 锁定活跃管理员，避免并发修改同时移除最后管理员。
			var admins []model.User
			if err := database.Lock(tx).
				Where("role = ? AND status = ?", "admin", "active").
				Order("id ASC").
				Find(&admins).Error; err != nil {
				return err
			}
			if err := database.Lock(tx).First(&u, id).Error; err != nil {
				return err
			}
			priv := in.Has("role") || in.Has("status")
			if priv && id == operator {
				return fault.New(fault.Forbidden)
			}
			if priv && u.Role == "admin" && ((in.Has("role") && in.String("role") != "admin") || (in.Has("status") && in.String("status") == "disabled")) && len(admins) <= 1 {
				return fault.New(fault.Conflict)
			}
			patch := map[string]any{}
			for _, key := range []string{
				"role",
				"status",
				"level",
			} {
				if in.Has(key) {
					patch[key] = in[key]
				}
			}
			if len(patch) == 0 {
				return nil
			}
			patch["updated_at"] = s.Now().UnixMilli()
			if err := tx.Model(&u).Updates(patch).Error; err != nil {
				return err
			}
			return tx.First(&u, id).Error
		})
	return auth.Public(u), txErr
}

// Member 组合可公开的会员资料及其已发布文章。
func (s *Service) Member(ctx context.Context, id int64, q url.Values) (any, error) {
	var u model.User
	if err := s.DB.WithContext(ctx).Where("id = ? AND status = ?", id, "active").First(&u).Error; err != nil {
		return nil, err
	}
	p, err := s.Articles.Page(ctx, q, "published", id)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":           u.ID,
		"nickname":     values.Name(u.DisplayName, u.Username),
		"avatar":       u.AvatarURL,
		"level":        u.Level,
		"articleCount": p["pagination"].(values.Page).Total,
		"articles":     p["list"],
	}, nil
}
