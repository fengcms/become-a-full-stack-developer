// Test-only local HTTP fixture. It uses a fake WeChat exchange and an isolated
// temporary SQLite database. It is never assembled by cmd/server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

type wechat struct{}

func (wechat) Exchange(context.Context, string) (string, error) { return "client-smoke-openid", nil }
func main() {
	dir, e := os.MkdirTemp("", "befull-client-smoke-")
	if e != nil {
		log.Fatal(e)
	}
	defer os.RemoveAll(dir)
	db, e := database.Open("sqlite", filepath.Join(dir, "fixture.db"))
	if e != nil {
		log.Fatal(e)
	}
	raw, _ := db.DB()
	defer raw.Close()
	if e = database.Migrate(context.Background(), db, "sqlite"); e != nil {
		log.Fatal(e)
	}
	hash, e := auth.Hash("m6-smoke-password")
	if e != nil {
		log.Fatal(e)
	}
	u := model.User{Username: "smoke-admin", PasswordHash: hash, CredentialsConfigured: true, Role: "admin", Status: "active", Level: 1, CreatedAt: 1, UpdatedAt: 1}
	if e = db.Create(&u).Error; e != nil {
		log.Fatal(e)
	}
	if _, e = article.New(db).Create(context.Background(), values.Actor{ID: u.ID, Role: u.Role}, values.Fields{"title": "Go 客户端验证", "content": "# Go 实践", "status": "published"}); e != nil {
		log.Fatal(e)
	}
	app, e := bootstrap.New(db, config.Config{JWTSecret: strings.Repeat("t", 32), Storage: "local", UploadDir: filepath.Join(dir, "files"), WechatAppID: "client-smoke"}, bootstrap.Options{Wechat: wechat{}})
	if e != nil {
		log.Fatal(e)
	}
	server := &http.Server{Addr: "127.0.0.1:18083", Handler: app, ReadHeaderTimeout: 5 * time.Second}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-signals
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Println("TEST fixture HTTP server: http://127.0.0.1:18083 (fake WeChat)")
	if e = server.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
		log.Fatal(e)
	}
}
