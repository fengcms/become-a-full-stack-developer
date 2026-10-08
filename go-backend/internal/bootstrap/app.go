// Package bootstrap 集中装配具体领域服务及基础设施。
package bootstrap

import (
	"fmt"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/administration"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/attachment"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/comment"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/contract"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/member"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/storage"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/taxonomy"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/transport/httpapi"
	"gorm.io/gorm"
)

// Options 允许测试注入外部服务替身，正式运行使用真实适配器。
type Options struct {
	Wechat    auth.WechatClient
	Providers map[string]storage.Provider
}

// New 作为唯一装配根连接各领域，并检查全部契约操作已注册。
func New(db *gorm.DB, c config.Config, o Options) (*httpapi.App, error) {
	catalog, err := contract.Load()
	if err != nil {
		return nil, err
	}
	identity := auth.New(db, c.JWTSecret)
	identity.AppID = c.WechatAppID
	identity.Wechat = o.Wechat
	if identity.Wechat == nil {
		identity.Wechat = auth.WechatHTTP{AppID: c.WechatAppID, Secret: c.WechatSecret}
	}
	p := o.Providers
	if p == nil {
		p = map[string]storage.Provider{"local": storage.Local{Root: c.UploadDir}}
		if c.R2Endpoint != "" || c.Storage == "r2" {
			r2, err := storage.NewR2(c.R2Endpoint, c.R2Bucket, c.R2AccessKey, c.R2SecretKey)
			if err != nil {
				return nil, err
			}
			p["r2"] = r2
		}
	}
	content := article.New(db)
	app := httpapi.New(catalog, identity, c.Origins)
	app.TrustedProxies = c.TrustedProxies
	app.BindAuth(identity)
	app.BindContent(content, taxonomy.New(db))
	comments := comment.New(db)
	if c.CommentRejectRatio != nil {
		comments.RejectRatio = *c.CommentRejectRatio
	}
	app.BindDiscovery(content, comments)
	app.BindMember(member.New(db), administration.New(db, content))
	app.BindAttachments(attachment.New(db, c.Storage, p))
	for id := range catalog.Operations {
		if !app.Registered[id] {
			return nil, fmt.Errorf("operation not implemented: %s", id)
		}
	}
	return app, nil
}
