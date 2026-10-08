// Package main 提供隔离的本地 HTTP 测试夹具，使用微信替身及临时 SQLite 数据库。
// 此命令不参与 cmd/server 的装配。
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

// Exchange 为测试返回固定微信身份，不访问真实外部服务。
func (wechat) Exchange(context.Context, string) (string, error) { return "client-smoke-openid", nil }
func main() {
	dir, err := os.MkdirTemp("", "befull-client-smoke-")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(dir)
	db, err := database.Open("sqlite", filepath.Join(dir, "fixture.db"))
	if err != nil {
		log.Fatal(err)
	}
	raw, _ := db.DB()
	defer raw.Close()
	if err = database.Migrate(context.Background(), db, "sqlite"); err != nil {
		log.Fatal(err)
	}
	hash, err := auth.Hash("m6-smoke-password")
	if err != nil {
		log.Fatal(err)
	}
	u := model.User{
		Username:              "smoke-admin",
		PasswordHash:          hash,
		CredentialsConfigured: true,
		Role:                  "admin",
		Status:                "active",
		Level:                 1,
		CreatedAt:             1,
		UpdatedAt:             1,
	}
	if err = db.Create(&u).Error; err != nil {
		log.Fatal(err)
	}
	if _, err = article.New(db).Create(context.Background(), values.Actor{ID: u.ID, Role: u.Role}, values.Fields{
		"title":   "Go 客户端验证",
		"content": "# Go 实践",
		"status":  "published",
	}); err != nil {
		log.Fatal(err)
	}
	app, err := bootstrap.New(db, config.Config{
		JWTSecret:   strings.Repeat("t", 32),
		Storage:     "local",
		UploadDir:   filepath.Join(dir, "files"),
		WechatAppID: "client-smoke",
	}, bootstrap.Options{Wechat: wechat{}})
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              "127.0.0.1:18083",
		Handler:           app,
		ReadHeaderTimeout: 5 * time.Second,
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-signals
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Println("TEST fixture HTTP server: http://127.0.0.1:18083 (fake WeChat)")
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
