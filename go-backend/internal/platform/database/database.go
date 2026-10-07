package database

import (
	"context"
	"embed"
	"fmt"
	"github.com/pressly/goose/v3"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"strings"
	"time"
)

//go:embed migrations/*/*.sql
var migrations embed.FS

func Open(driver, dsn string) (*gorm.DB, error) {
	var dial gorm.Dialector
	switch driver {
	case "postgres":
		dial = postgres.Open(dsn)
	case "mysql":
		dial = mysql.Open(dsn)
	case "sqlite":
		if !strings.Contains(dsn, "_foreign_keys") {
			sep := "?"
			if strings.Contains(dsn, "?") {
				sep = "&"
			}
			dsn += sep + "_foreign_keys=on&_busy_timeout=5000&_journal_mode=WAL"
		}
		dial = sqlite.Open(dsn)
	default:
		return nil, fmt.Errorf("unsupported database driver %q", driver)
	}
	db, e := gorm.Open(dial, &gorm.Config{TranslateError: true, Logger: logger.Default.LogMode(logger.Silent), SkipDefaultTransaction: true})
	if e != nil {
		return nil, e
	}
	sql, e := db.DB()
	if e != nil {
		return nil, e
	}
	sql.SetMaxOpenConns(16)
	sql.SetMaxIdleConns(4)
	sql.SetConnMaxLifetime(30 * time.Minute)
	if driver == "sqlite" {
		sql.SetMaxOpenConns(1)
	}
	return db, nil
}
func Migrate(ctx context.Context, db *gorm.DB, driver string) error {
	dialect := goose.DialectPostgres
	switch driver {
	case "mysql":
		dialect = goose.DialectMySQL
	case "sqlite":
		dialect = goose.DialectSQLite3
	}
	raw, e := db.DB()
	if e != nil {
		return e
	}
	fsys, e := migrationsSub(driver)
	if e != nil {
		return e
	}
	p, e := goose.NewProvider(dialect, raw, fsys)
	if e != nil {
		return e
	}
	_, e = p.Up(ctx)
	return e
}
