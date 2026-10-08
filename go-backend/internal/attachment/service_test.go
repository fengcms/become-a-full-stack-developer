package attachment

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/storage"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestSharedKeyAndDatabaseFailureCompensation(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{
		Username:              "upload-" + time.Now().Format("150405.000000"),
		PasswordHash:          "!",
		CredentialsConfigured: true,
		Role:                  "member",
		Status:                "active",
		CreatedAt:             1,
		UpdatedAt:             1,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	local := storage.Local{Root: t.TempDir()}
	s := New(db, "local", map[string]storage.Provider{"local": local})
	first, err := s.Create(ctx, u.ID, nil, []byte("shared"), ".png", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Create(ctx, u.ID, nil, []byte("shared"), ".png", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	f := first.(map[string]any)
	v := second.(map[string]any)
	if f["url"] != v["url"] {
		t.Fatal("content key differs")
	}
	actor := values.Actor{ID: u.ID, Role: "member"}
	if err = s.Delete(ctx, f["id"].(int64), actor); err != nil {
		t.Fatal(err)
	}
	key := fmt.Sprint(f["url"])[len("/files/"):]
	if b, err := s.Read(ctx, key); err != nil || string(b) != "shared" {
		t.Fatal("shared reference removed", err)
	}
	if _, err = s.Create(ctx, 999999999, nil, []byte("shared"), ".png", "image/png"); err == nil {
		t.Fatal("missing FK accepted")
	}
	if b, err := s.Read(ctx, key); err != nil || string(b) != "shared" {
		t.Fatal("compensation deleted existing reference", err)
	}
	if err = s.Delete(ctx, v["id"].(int64), actor); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Read(ctx, key); err == nil {
		t.Fatal("last reference didn't remove object")
	}
}

type failingStorage struct {
	storage.Local
	failPut, failDelete bool
}

func (s failingStorage) Put(ctx context.Context, key string, b []byte, mime string) error {
	if s.failPut {
		return errors.New("injected object put failure")
	}
	return s.Local.Put(ctx, key, b, mime)
}
func (s failingStorage) Delete(ctx context.Context, key string) error {
	if s.failDelete {
		return errors.New("injected object delete failure")
	}
	return s.Local.Delete(ctx, key)
}
func TestObjectFailuresAndConcurrentSharedReference(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{
		Username:              "upload-fault-" + time.Now().Format("150405.000000"),
		PasswordHash:          "!",
		CredentialsConfigured: true,
		Role:                  "member",
		Status:                "active",
		CreatedAt:             1,
		UpdatedAt:             1,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	local := storage.Local{Root: t.TempDir()}
	s := New(db, "local", map[string]storage.Provider{"local": failingStorage{Local: local, failPut: true}})
	if _, err := s.Create(ctx, u.ID, nil, []byte("fault"), ".png", "image/png"); err == nil {
		t.Fatal("put failure hidden")
	}
	var count int64
	db.Model(&model.Attachment{}).Where("user_id = ?", u.ID).Count(&count)
	if count != 0 {
		t.Fatal("put failure committed metadata")
	}
	s.Providers["local"] = failingStorage{Local: local, failDelete: true}
	v, err := s.Create(ctx, u.ID, nil, []byte("fault"), ".png", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	item := v.(map[string]any)
	if err = s.Delete(ctx, item["id"].(int64), values.Actor{ID: u.ID, Role: "member"}); err != nil {
		t.Fatal("best effort delete changed protocol", err)
	}
	db.Model(&model.Attachment{}).Where("id = ?", item["id"]).Count(&count)
	if count != 0 {
		t.Fatal("metadata retained")
	}
	key := strings.TrimPrefix(item["url"].(string), "/files/")
	if bytes, err := local.Get(ctx, key); err != nil || string(bytes) != "fault" {
		t.Fatal("expected retained object for reconciliation")
	}
	s.Providers["local"] = local
	original, err := s.Create(ctx, u.ID, nil, []byte("concurrent"), ".png", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	wg.Go(func() {
		errs <- s.Delete(ctx, original.(map[string]any)["id"].(int64), values.Actor{ID: u.ID, Role: "member"})
	})
	var replacement any
	wg.Go(func() {
		var err error
		replacement, err = s.Create(ctx, u.ID, nil, []byte("concurrent"), ".png", "image/png")
		errs <- err
	})
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	key = strings.TrimPrefix(replacement.(map[string]any)["url"].(string), "/files/")
	if bytes, err := s.Read(ctx, key); err != nil || string(bytes) != "concurrent" {
		t.Fatal("racing deletion removed new reference", err)
	}
}
