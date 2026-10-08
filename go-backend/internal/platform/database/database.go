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

// Open 选择实际数据库驱动并配置连接池；SQLite 强制外键和单写连接。
func Open(driver, dsn string) (*gorm.DB, error) {
	var dial gorm.Dialector
	switch driver {
	case "postgres":
		dial = postgres.Open(dsn)
	case "mysql":
		dial = mysql.Open(dsn)
	case "sqlite":
		base, query, _ := strings.Cut(dsn, "?")
		options, err := url.ParseQuery(query)
		if err != nil {
			return nil, fmt.Errorf("invalid SQLite options")
		}
		// 外键是业务不变量，DSN 显式关闭外键也不能绕过。
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
	db, err := gorm.Open(dial, &gorm.Config{
		TranslateError:         true,
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(16)
	sqlDB.SetMaxIdleConns(4)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	if driver == "sqlite" {
		// 单连接串行写入；WAL 提高读取可用性，不等于支持多个写实例。
		sqlDB.SetMaxOpenConns(1)
	}
	return db, nil
}

// Migrate 执行版本化方言 SQL；不使用隐式结构体同步修改数据库。
func Migrate(ctx context.Context, db *gorm.DB, driver string) error {
	dialect := goose.DialectPostgres
	switch driver {
	case "mysql":
		dialect = goose.DialectMySQL
	case "sqlite":
		dialect = goose.DialectSQLite3
	}
	raw, err := db.DB()
	if err != nil {
		return err
	}
	fsys, err := migrationsSub(driver)
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(dialect, raw, fsys)
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}

// ReadOnlyDSN prevents export from creating a missing SQLite source or changing
// its journal mode. Other drivers enforce READ ONLY on the export transaction.
func ReadOnlyDSN(driver, dsn string) (string, error) {
	if driver != "sqlite" {
		return dsn, nil
	}
	base, query, _ := strings.Cut(dsn, "?")
	options, err := url.ParseQuery(query)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(base, "file:") {
		base = "file:" + base
	}
	options.Set("mode", "ro")
	// 外键是业务不变量，DSN 显式关闭外键也不能绕过。
	options.Set("_foreign_keys", "on")
	options.Del("_journal_mode")
	options.Del("_journal")
	return base + "?" + options.Encode(), nil
}
