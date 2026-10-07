package database

import (
	"context"
	"embed"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/pressly/goose/v3"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
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
		base, query, _ := strings.Cut(dsn, "?")
		options, e := url.ParseQuery(query)
		if e != nil {
			return nil, fmt.Errorf("invalid SQLite options")
		}
		options.Set("_foreign_keys", "on")
		if options.Get("_busy_timeout") == "" {
			options.Set("_busy_timeout", "5000")
		}
		if options.Get("mode") != "ro" {
			options.Set("_journal_mode", "WAL")
		}
		dsn = base + "?" + options.Encode()
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

// ReadOnlyDSN prevents export from creating a missing SQLite source or changing
// its journal mode. Other drivers enforce READ ONLY on the export transaction.
func ReadOnlyDSN(driver, dsn string) (string, error) {
	if driver != "sqlite" {
		return dsn, nil
	}
	base, query, _ := strings.Cut(dsn, "?")
	options, e := url.ParseQuery(query)
	if e != nil {
		return "", e
	}
	if !strings.HasPrefix(base, "file:") {
		base = "file:" + base
	}
	options.Set("mode", "ro")
	options.Set("_foreign_keys", "on")
	options.Del("_journal_mode")
	options.Del("_journal")
	return base + "?" + options.Encode(), nil
}
