package database

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"os"
	"path/filepath"
	"testing"
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
