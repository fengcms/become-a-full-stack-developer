package attachment

import (
	"context"
	"fmt"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/storage"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"testing"
	"time"
)

func TestSharedKeyAndDatabaseFailureCompensation(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{Username: "upload-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	local := storage.Local{Root: t.TempDir()}
	s := New(db, "local", map[string]storage.Provider{"local": local})
	first, e := s.Create(ctx, u.ID, nil, []byte("shared"), ".png", "image/png")
	if e != nil {
		t.Fatal(e)
	}
	second, e := s.Create(ctx, u.ID, nil, []byte("shared"), ".png", "image/png")
	if e != nil {
		t.Fatal(e)
	}
	f := first.(map[string]any)
	v := second.(map[string]any)
	if f["url"] != v["url"] {
		t.Fatal("content key differs")
	}
	actor := values.Actor{ID: u.ID, Role: "member"}
	if e = s.Delete(ctx, f["id"].(int64), actor); e != nil {
		t.Fatal(e)
	}
	key := fmt.Sprint(f["url"])[len("/files/"):]
	if b, e := s.Read(ctx, key); e != nil || string(b) != "shared" {
		t.Fatal("shared reference removed", e)
	}
	if _, e = s.Create(ctx, 999999999, nil, []byte("shared"), ".png", "image/png"); e == nil {
		t.Fatal("missing FK accepted")
	}
	if b, e := s.Read(ctx, key); e != nil || string(b) != "shared" {
		t.Fatal("compensation deleted existing reference", e)
	}
	if e = s.Delete(ctx, v["id"].(int64), actor); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Read(ctx, key); e == nil {
		t.Fatal("last reference didn't remove object")
	}
}
