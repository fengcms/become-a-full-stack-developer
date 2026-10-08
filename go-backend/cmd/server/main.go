package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	c, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.Open(c.Driver, c.DSN)
	if err != nil {
		return err
	}
	if c.DatabaseMetricsOutput != "" {
		metrics := database.Observe(db)
		defer func() {
			if err := metrics.Write(c.DatabaseMetricsOutput); err != nil {
				slog.Warn("database metrics output failed")
			}
		}()
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	err = sqlDB.PingContext(ctx)
	cancel()
	if err != nil {
		return err
	}
	app, err := bootstrap.New(db, c, bootstrap.Options{})
	if err != nil {
		return err
	}
	server := &http.Server{
		Addr:              c.Address,
		Handler:           app,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	done := make(chan error, 1)
	go func() {
		slog.Info("server listening", "address", c.Address, "database", c.Driver)
		done <- server.ListenAndServe()
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-signals:
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(ctx)
	}
	return nil
}
