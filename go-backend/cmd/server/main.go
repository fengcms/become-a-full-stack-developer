package main

import (
	"context"
	"errors"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
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
	app, e := bootstrap.New(db, c, bootstrap.Options{})
	if e != nil {
		return e
	}
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
