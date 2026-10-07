// Package bootstrap is the only place that wires concrete domain services.
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

type Options struct {
	Wechat    auth.WechatClient
	Providers map[string]storage.Provider
}

func New(db *gorm.DB, c config.Config, o Options) (*httpapi.App, error) {
	catalog, e := contract.Load()
	if e != nil {
		return nil, e
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
			r2, e := storage.NewR2(c.R2Endpoint, c.R2Bucket, c.R2AccessKey, c.R2SecretKey)
			if e != nil {
				return nil, e
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
