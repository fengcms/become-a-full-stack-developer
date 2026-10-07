package testutil

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"testing"
)

func DB(t testing.TB) *gorm.DB {
	t.Helper()
	driver := os.Getenv("TEST_DRIVER")
	dsn := os.Getenv("TEST_DSN")
	if driver == "" {
		driver = "sqlite"
		dsn = filepath.Join(t.TempDir(), "test.db")
	}
	db, e := database.Open(driver, dsn)
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := db.DB()
	t.Cleanup(func() { raw.Close() })
	if e = database.Migrate(context.Background(), db, driver); e != nil {
		t.Fatal(e)
	}
	return db
}
