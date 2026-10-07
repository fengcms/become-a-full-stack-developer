package article

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestTocFenceUnicodeAndDuplicate(t *testing.T) {
	r := ParseToc("# 你好 Go\n```go\n# skip\n```\n# 你好 Go\n## 😀")
	if len(r) != 3 || r[0]["anchor"] != "你好-go" || r[1]["anchor"] != "你好-go-1" || r[2]["anchor"] != "heading" {
		t.Fatal(r)
	}
}
func TestRollingViewWindowAndConcurrentRequests(t *testing.T) {
	db := testutil.DB(t)
	u := model.User{Username: "views-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	s := New(db)
	now := time.Date(2026, 10, 7, 23, 59, 0, 0, time.UTC)
	s.Now = func() time.Time { return now }
	ctx := context.Background()
	a, e := s.Create(ctx, values.Actor{ID: u.ID, Role: "admin"}, values.Fields{"title": "阅读", "content": "内容", "status": "published"})
	if e != nil {
		t.Fatal(e)
	}
	id := a["id"].(int64)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for range 8 {
		wg.Go(func() { _, e := s.Views(ctx, id, values.Actor{}, "192.0.2.1", "browser"); errs <- e })
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	now = now.Add(2 * time.Minute)
	r, e := s.Views(ctx, id, values.Actor{}, "192.0.2.1", "browser")
	if e != nil || r.(map[string]any)["viewCount"].(int64) != 1 {
		t.Fatal("midnight must not reset rolling window", r, e)
	}
	now = now.Add(24 * time.Hour)
	r, e = s.Views(ctx, id, values.Actor{}, "192.0.2.1", "browser")
	if e != nil || r.(map[string]any)["viewCount"].(int64) != 2 {
		t.Fatal(r, e)
	}
}
