package main

import (
	"context"
	"errors"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/contract"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/transport/httpapi"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if e := run(); e != nil {
		slog.Error("server stopped", "error", e)
		os.Exit(1)
	}
}
func run() error {
	c, e := config.Load()
	if e != nil {
		return e
	}
	db, e := database.Open(c.Driver, c.DSN)
	if e != nil {
		return e
	}
	sql, _ := db.DB()
	defer sql.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	e = sql.PingContext(ctx)
	cancel()
	if e != nil {
		return e
	}
	catalog, e := contract.Load()
	if e != nil {
		return e
	}
	identity := auth.New(db, c.JWTSecret)
	identity.AppID = c.WechatAppID
	identity.Wechat = auth.WechatHTTP{AppID: c.WechatAppID, Secret: c.WechatSecret}
	app := httpapi.New(catalog, identity, c.Origins)
	app.TrustedProxies = c.TrustedProxies
	app.BindAuth(identity)
	server := &http.Server{Addr: c.Address, Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	done := make(chan error, 1)
	go func() {
		slog.Info("server listening", "address", c.Address, "database", c.Driver)
		done <- server.ListenAndServe()
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case e := <-done:
		if !errors.Is(e, http.ErrServerClosed) {
			return e
		}
	case <-signals:
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(ctx)
	}
	return nil
}
