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
			db, err := Open(c.driver, c.dsn)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := db.DB()
			defer raw.Close()
			for range 2 {
				if err = Migrate(context.Background(), db, c.driver); err != nil {
					t.Fatal(err)
				}
			}
			for _, table := range []string{
				"users",
				"refresh_tokens",
				"wechat_identities",
				"categories",
				"tags",
				"articles",
				"article_tags",
				"article_view_dedup",
				"comments",
				"attachments",
				"favorites",
				"view_history",
				"likes",
				"notifications",
				"site_settings",
			} {
				if !db.Migrator().HasTable(table) {
					t.Error("missing", table)
				}
			}
			var setting model.SiteSetting
			if err = db.First(&setting, 1).Error; err != nil {
				t.Fatal(err)
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
	db, err := Open(driver, dsn)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	defer raw.Close()
	fsys, err := migrationsSub(driver)
	if err != nil {
		t.Fatal(err)
	}
	dialect := goose.DialectSQLite3
	if driver == "postgres" {
		dialect = goose.DialectPostgres
	} else if driver == "mysql" {
		dialect = goose.DialectMySQL
	}
	provider, err := goose.NewProvider(dialect, raw, fsys)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = provider.UpTo(context.Background(), 1); err != nil {
		t.Fatal(err)
	}
	u := model.User{
		Username:              "upgrade-preserve",
		PasswordHash:          "historical-hash",
		CredentialsConfigured: true,
		Role:                  "member",
		Status:                "active",
		Level:                 1,
		CreatedAt:             1234,
		UpdatedAt:             1234,
	}
	if err = db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	if err = Migrate(context.Background(), db, driver); err != nil {
		t.Fatal(err)
	}
	var after model.User
	if err = db.First(&after, u.ID).Error; err != nil || after.PasswordHash != u.PasswordHash || after.CreatedAt != 1234 {
		t.Fatal("upgrade changed account", err)
	}
	if !db.Migrator().HasIndex(&model.Article{}, "idx_articles_status") {
		t.Fatal("upgrade index missing")
	}
}

func TestSQLiteReadOnlySourceAndForeignKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source.db")
	db, err := Open("sqlite", path+"?_foreign_keys=off")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	if err = Migrate(context.Background(), db, "sqlite"); err != nil {
		t.Fatal(err)
	}
	var enabled int
	if err = db.Raw("PRAGMA foreign_keys").Scan(&enabled).Error; err != nil || enabled != 1 {
		t.Fatal("foreign keys disabled")
	}
	raw.Close()
	dsn, err := ReadOnlyDSN("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	source, err := Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	r, _ := source.DB()
	defer r.Close()
	if err = source.Exec("UPDATE site_settings SET site_name = ? WHERE id = 1", "must fail").Error; err == nil {
		t.Fatal("read-only source accepted writes")
	}
	missing, err := ReadOnlyDSN("sqlite", filepath.Join(t.TempDir(), "missing.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Open("sqlite", missing); err == nil {
		t.Fatal("export created missing source")
	}
}
