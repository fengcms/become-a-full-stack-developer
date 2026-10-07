package transfer

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"gorm.io/gorm"
)

func fresh(t *testing.T, driver, dsn string) *gorm.DB {
	t.Helper()
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
func TestSnapshotRoundtripAndAtomicRollback(t *testing.T) {
	ctx := context.Background()
	source := fresh(t, "sqlite", filepath.Join(t.TempDir(), "source.db"))
	parent := int64(9)
	for _, v := range []any{
		&model.User{ID: 7, Username: "import-user", PasswordHash: "preserved-bcrypt", CredentialsConfigured: false, Role: "member", Status: "active", CreatedAt: 1000, UpdatedAt: 1000},
		&model.Category{ID: 9, Name: "父", Slug: "parent", CreatedAt: 1000, UpdatedAt: 1000},
		&model.Category{ID: 2, Name: "子", Slug: "child", ParentID: &parent, CreatedAt: 1000, UpdatedAt: 1000},
		&model.WechatIdentity{ID: 5, UserID: 7, AppID: "fake-app", OpenID: "preserved-openid", CreatedAt: 1000},
		&model.Article{ID: 11, Title: "导入文章", AuthorID: 7, Content: "# preserved", Status: "published", LikeCount: 1, CreatedAt: 1000, UpdatedAt: 1000},
		&model.Like{ID: 4, UserID: 7, ArticleID: 11, CreatedAt: 1000},
	} {
		if e := source.Create(v).Error; e != nil {
			t.Fatal(e)
		}
	}
	snap, e := Export(ctx, source, "sqlite")
	if e != nil {
		t.Fatal(e)
	}
	serialized, _ := json.Marshal(snap)
	var decoded Snapshot
	d := json.NewDecoder(bytes.NewReader(serialized))
	d.UseNumber()
	if e = d.Decode(&decoded); e != nil {
		t.Fatal(e)
	}
	driver, dsn := os.Getenv("TEST_IMPORT_DRIVER"), os.Getenv("TEST_IMPORT_DSN")
	if driver == "" {
		driver = "sqlite"
		dsn = filepath.Join(t.TempDir(), "target.db")
	}
	target := fresh(t, driver, dsn)
	if e = Import(ctx, target, driver, &decoded, true); e != nil {
		t.Fatal("dry run", e)
	}
	var count int64
	target.Model(&model.User{}).Count(&count)
	if count != 0 {
		t.Fatal("dry run wrote data")
	}
	// A later-table FK failure must roll back all preceding users and categories.
	decoded.Tables["likes"][0]["user_id"] = int64(999999)
	if e = Import(ctx, target, driver, &decoded, false); e == nil {
		t.Fatal("invalid relationship accepted")
	}
	target.Model(&model.User{}).Count(&count)
	if count != 0 {
		t.Fatal("partial import committed")
	}
	decoded.Tables["likes"][0]["user_id"] = int64(7)
	if e = Import(ctx, target, driver, &decoded, false); e != nil {
		t.Fatal(e)
	}
	after, e := Export(ctx, target, driver)
	if e != nil {
		t.Fatal(e)
	}
	if e = after.Normalize(); e != nil {
		t.Fatal(e)
	}
	if e = snap.Normalize(); e != nil {
		t.Fatal(e)
	}
	a, _ := snap.CanonicalJSON()
	b, _ := after.CanonicalJSON()
	if !bytes.Equal(a, b) {
		t.Fatalf("data drift\n%s\n%s", a, b)
	}
	if e = Import(ctx, target, driver, &decoded, false); e == nil || !strings.Contains(e.Error(), "not empty") {
		t.Fatal("nonempty target accepted", e)
	}
	if driver == "postgres" {
		u := model.User{Username: "sequence-check", PasswordHash: "!", Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
		if e = target.Create(&u).Error; e != nil || u.ID <= 7 {
			t.Fatal("sequence not repaired", u.ID, e)
		}
	}
}
