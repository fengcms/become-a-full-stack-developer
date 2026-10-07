package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

type WechatClient interface {
	Exchange(context.Context, string) (string, error)
}
type WechatHTTP struct {
	AppID, Secret string
	Client        *http.Client
}

func (w WechatHTTP) Exchange(ctx context.Context, code string) (string, error) {
	if w.AppID == "" || w.Secret == "" {
		return "", fault.New(fault.Internal)
	}
	q := url.Values{"appid": {w.AppID}, "secret": {w.Secret}, "js_code": {code}, "grant_type": {"authorization_code"}}
	req, e := http.NewRequestWithContext(ctx, "GET", "https://api.weixin.qq.com/sns/jscode2session?"+q.Encode(), nil)
	if e != nil {
		return "", fault.New(fault.Internal)
	}
	client := w.Client
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	r, e := client.Do(req)
	if e != nil {
		return "", fault.New(fault.Internal)
	}
	defer r.Body.Close()
	var b struct {
		OpenID string `json:"openid"`
		Code   int    `json:"errcode"`
	}
	if r.StatusCode != 200 || json.NewDecoder(io.LimitReader(r.Body, 65536)).Decode(&b) != nil {
		return "", fault.New(fault.Internal)
	}
	if b.Code == 45011 {
		return "", fault.New(fault.Limited)
	}
	if b.Code == 40029 || b.Code == 40163 || b.Code == 40226 {
		return "", fault.New(fault.Token)
	}
	if b.Code != 0 || b.OpenID == "" {
		return "", fault.New(fault.Internal)
	}
	return b.OpenID, nil
}
func (s *Service) WechatLogin(ctx context.Context, code string) (map[string]any, error) {
	if s.Wechat == nil || s.AppID == "" {
		return nil, fault.New(fault.Internal)
	}
	openid, e := s.Wechat.Exchange(ctx, code)
	if e != nil {
		return nil, e
	}
	random := make([]byte, 14)
	if _, e = rand.Read(random); e != nil {
		return nil, e
	}
	name := "wx_" + hex.EncodeToString(random)
	var preIdentity model.WechatIdentity
	lookup := s.DB.WithContext(ctx).Where("app_id = ? AND open_id = ?", s.AppID, openid).First(&preIdentity).Error
	passwordHash := ""
	if lookup == gorm.ErrRecordNotFound {
		passwordHash, e = Hash(hex.EncodeToString(random) + "-unavailable-local-credentials")
		if e != nil {
			return nil, e
		}
	} else if lookup != nil {
		return nil, lookup
	}

	now := s.Now().UnixMilli()
	var result map[string]any
	// Unique identity resolves competing first logins. Retry only a unique race after rollback.
	for attempt := 0; attempt < 2; attempt++ {
		e = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var identity model.WechatIdentity
			err := tx.Where("app_id = ? AND open_id = ?", s.AppID, openid).First(&identity).Error
			var u model.User
			if err == gorm.ErrRecordNotFound {
				u = model.User{Username: name, PasswordHash: passwordHash, CredentialsConfigured: false, DisplayName: values.Text("微信会员"), Role: "member", Status: "active", Level: 1, CreatedAt: now, UpdatedAt: now}
				if err = tx.Create(&u).Error; err != nil {
					return err
				}
				identity = model.WechatIdentity{AppID: s.AppID, OpenID: openid, UserID: u.ID, CreatedAt: now}
				if err = tx.Create(&identity).Error; err != nil {
					return err
				}
			} else if err != nil {
				return err
			} else {
				if err = database.Lock(tx).First(&u, identity.UserID).Error; err != nil {
					return err
				}
			}
			if u.Status == "disabled" {
				return fault.New(fault.Disabled)
			}
			result, err = s.Result(tx, u)
			return err
		})
		if e == nil {
			return result, nil
		}
		if fault.Resolve(e).Code != fault.Conflict {
			return nil, e
		}
	}
	return nil, e
}
