package member

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"net/url"
	"sync"
	"testing"
	"time"
)

func TestConcurrentLikesAndHistoryPresence(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{Username: "likes-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	content := article.New(db)
	a, e := content.Create(ctx, values.Actor{ID: u.ID, Role: "admin"}, values.Fields{"title": "互动", "content": "正文", "status": "published"})
	if e != nil {
		t.Fatal(e)
	}
	id := a["id"].(int64)
	s := New(db)
	var wg sync.WaitGroup
	errs := make(chan error, 16)
	for range 8 {
		wg.Go(func() { _, e := s.Like(ctx, u.ID, id, true); errs <- e })
	}
	wg.Wait()
	status, e := s.LikeStatus(ctx, u.ID, id)
	if e != nil || status.(map[string]any)["likeCount"].(int64) != 1 {
		t.Fatal(status, e)
	}
	for range 8 {
		wg.Go(func() { _, e := s.Like(ctx, u.ID, id, false); errs <- e })
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	status, e = s.LikeStatus(ctx, u.ID, id)
	if e != nil || status.(map[string]any)["likeCount"].(int64) != 0 {
		t.Fatal(status, e)
	}
	if _, e = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id), "progress": float64(0)}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id)}); e != nil {
		t.Fatal(e)
	}
	r, e := s.History(ctx, u.ID, url.Values{})
	if e != nil {
		t.Fatal(e)
	}
	items := r.(map[string]any)["list"].([]map[string]any)
	if len(items) != 1 || items[0]["progress"].(int64) != 0 {
		t.Fatal(items)
	}
	if _, e = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id), "progress": nil}); e != nil {
		t.Fatal(e)
	}
}
