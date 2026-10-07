package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/pressly/goose/v3"
)

func TestMigrations(t *testing.T) {
	cases := []struct{ driver, dsn string }{{"sqlite", filepath.Join(t.TempDir(), "db.sqlite")}}
	if d := os.Getenv("TEST_POSTGRES_DSN"); d != "" {
		cases = append(cases, struct{ driver, dsn string }{"postgres", d})
	}
	if d := os.Getenv("TEST_MYSQL_DSN"); d != "" {
		cases = append(cases, struct{ driver, dsn string }{"mysql", d})
	}
	for _, c := range cases {
		t.Run(c.driver, func(t *testing.T) {
			db, e := Open(c.driver, c.dsn)
			if e != nil {
				t.Fatal(e)
			}
			raw, _ := db.DB()
			defer raw.Close()
			for range 2 {
				if e = Migrate(context.Background(), db, c.driver); e != nil {
					t.Fatal(e)
				}
			}
			for _, table := range []string{"users", "refresh_tokens", "wechat_identities", "categories", "tags", "articles", "article_tags", "article_view_dedup", "comments", "attachments", "favorites", "view_history", "likes", "notifications", "site_settings"} {
				if !db.Migrator().HasTable(table) {
					t.Error("missing", table)
				}
			}
			var setting model.SiteSetting
			if e = db.First(&setting, 1).Error; e != nil {
				t.Fatal(e)
			}
		})
	}
}

func TestVersionOneUpgradePreservesData(t *testing.T) {
	driver, dsn := os.Getenv("TEST_UPGRADE_DRIVER"), os.Getenv("TEST_UPGRADE_DSN")
	if driver == "" {
		driver = "sqlite"
		dsn = filepath.Join(t.TempDir(), "upgrade.db")
	}
	db, e := Open(driver, dsn)
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := db.DB()
	defer raw.Close()
	fsys, e := migrationsSub(driver)
	if e != nil {
		t.Fatal(e)
	}
	dialect := goose.DialectSQLite3
	if driver == "postgres" {
		dialect = goose.DialectPostgres
	} else if driver == "mysql" {
		dialect = goose.DialectMySQL
	}
	provider, e := goose.NewProvider(dialect, raw, fsys)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = provider.UpTo(context.Background(), 1); e != nil {
		t.Fatal(e)
	}
	u := model.User{Username: "upgrade-preserve", PasswordHash: "historical-hash", CredentialsConfigured: true, Role: "member", Status: "active", Level: 1, CreatedAt: 1234, UpdatedAt: 1234}
	if e = db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	if e = Migrate(context.Background(), db, driver); e != nil {
		t.Fatal(e)
	}
	var after model.User
	if e = db.First(&after, u.ID).Error; e != nil || after.PasswordHash != u.PasswordHash || after.CreatedAt != 1234 {
		t.Fatal("upgrade changed account", e)
	}
	if !db.Migrator().HasIndex(&model.Article{}, "idx_articles_status") {
		t.Fatal("upgrade index missing")
	}
}

func TestSQLiteReadOnlySourceAndForeignKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source.db")
	db, e := Open("sqlite", path+"?_foreign_keys=off")
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := db.DB()
	if e = Migrate(context.Background(), db, "sqlite"); e != nil {
		t.Fatal(e)
	}
	var enabled int
	if e = db.Raw("PRAGMA foreign_keys").Scan(&enabled).Error; e != nil || enabled != 1 {
		t.Fatal("foreign keys disabled")
	}
	raw.Close()
	dsn, e := ReadOnlyDSN("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	source, e := Open("sqlite", dsn)
	if e != nil {
		t.Fatal(e)
	}
	r, _ := source.DB()
	defer r.Close()
	if e = source.Exec("UPDATE site_settings SET site_name = ? WHERE id = 1", "must fail").Error; e == nil {
		t.Fatal("read-only source accepted writes")
	}
	missing, e := ReadOnlyDSN("sqlite", filepath.Join(t.TempDir(), "missing.db"))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = Open("sqlite", missing); e == nil {
		t.Fatal("export created missing source")
	}
}
