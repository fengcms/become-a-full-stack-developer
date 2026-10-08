package testutil

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"gorm.io/gorm"
)

// DB 为测试建立隔离数据库并迁移，通过测试清理生命周期关闭连接。
func DB(t testing.TB) *gorm.DB {
	t.Helper()
	driver := os.Getenv("TEST_DRIVER")
	dsn := os.Getenv("TEST_DSN")
	if driver == "" {
		driver = "sqlite"
		dsn = filepath.Join(t.TempDir(), "test.db")
	}
	db, err := database.Open(driver, dsn)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	t.Cleanup(func() { raw.Close() })
	if err = database.Migrate(context.Background(), db, driver); err != nil {
		t.Fatal(err)
	}
	return db
}
