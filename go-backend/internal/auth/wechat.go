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

// WechatClient 定义 code 换 openid 的最小边界，业务层不依赖具体 HTTP 客户端。
type WechatClient interface {
	// Exchange 将一次性微信 code 换成 openid，失败返回错误，不持久化用户。
	Exchange(context.Context, string) (string, error)
}

// WechatHTTP 保存官方换码配置；密钥只用于请求，不进入业务数据或日志。
type WechatHTTP struct {
	AppID, Secret string
	Client        *http.Client
}

// Exchange 访问固定微信官方地址，限制超时和重定向，并映射供应商错误。
func (w WechatHTTP) Exchange(ctx context.Context, code string) (string, error) {
	if w.AppID == "" || w.Secret == "" {
		return "", fault.New(fault.Internal)
	}
	q := url.Values{
		"appid":      {w.AppID},
		"secret":     {w.Secret},
		"js_code":    {code},
		"grant_type": {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.weixin.qq.com/sns/jscode2session?"+q.Encode(), nil)
	if err != nil {
		return "", fault.New(fault.Internal)
	}
	client := w.Client
	if client == nil {
		client = &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	r, err := client.Do(req)
	if err != nil {
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

// WechatLogin 按 AppID 与 openid 查找或创建账号，唯一约束处理并发首次登录。
func (s *Service) WechatLogin(ctx context.Context, code string) (map[string]any, error) {
	if s.Wechat == nil || s.AppID == "" {
		return nil, fault.New(fault.Internal)
	}
	openid, err := s.Wechat.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}
	random := make([]byte, 14)
	if _, err = rand.Read(random); err != nil {
		return nil, err
	}
	name := "wx_" + hex.EncodeToString(random)
	var preIdentity model.WechatIdentity
	lookup := s.DB.WithContext(ctx).Where("app_id = ? AND open_id = ?", s.AppID, openid).First(&preIdentity).Error
	passwordHash := ""
	if lookup == gorm.ErrRecordNotFound {
		passwordHash, err = Hash(hex.EncodeToString(random) + "-unavailable-local-credentials")
		if err != nil {
			return nil, err
		}
	} else if lookup != nil {
		return nil, lookup
	}

	now := s.Now().UnixMilli()
	var result map[string]any
	// 唯一身份约束裁决并发建号；仅在唯一键冲突且事务回滚后重试。
	for attempt := 0; attempt < 2; attempt++ {
		err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var identity model.WechatIdentity
			err := tx.Where("app_id = ? AND open_id = ?", s.AppID, openid).First(&identity).Error
			var u model.User
			if err == gorm.ErrRecordNotFound {
				u = model.User{
					Username:              name,
					PasswordHash:          passwordHash,
					CredentialsConfigured: false,
					DisplayName:           values.Text("微信会员"),
					Role:                  "member",
					Status:                "active",
					Level:                 1,
					CreatedAt:             now,
					UpdatedAt:             now,
				}
				if err = tx.Create(&u).Error; err != nil {
					return err
				}
				identity = model.WechatIdentity{
					AppID:     s.AppID,
					OpenID:    openid,
					UserID:    u.ID,
					CreatedAt: now,
				}
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
		if err == nil {
			return result, nil
		}
		if fault.Resolve(err).Code != fault.Conflict {
			return nil, err
		}
	}
	return nil, err
}
