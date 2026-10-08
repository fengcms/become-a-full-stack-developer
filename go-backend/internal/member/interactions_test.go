package member

import (
	"context"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestConcurrentLikesAndHistoryPresence(t *testing.T) {
	db := testutil.DB(t)
	ctx := context.Background()
	u := model.User{
		Username:              "likes-" + time.Now().Format("150405.000000"),
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
	content := article.New(db)
	a, err := content.Create(ctx, values.Actor{ID: u.ID, Role: "admin"}, values.Fields{
		"title":   "互动",
		"content": "正文",
		"status":  "published",
	})
	if err != nil {
		t.Fatal(err)
	}
	id := a["id"].(int64)
	s := New(db)
	var wg sync.WaitGroup
	errs := make(chan error, 16)
	for range 8 {
		wg.Go(func() { _, err := s.Like(ctx, u.ID, id, true); errs <- err })
	}
	wg.Wait()
	status, err := s.LikeStatus(ctx, u.ID, id)
	if err != nil || status.(map[string]any)["likeCount"].(int64) != 1 {
		t.Fatal(status, err)
	}
	for range 8 {
		wg.Go(func() { _, err := s.Like(ctx, u.ID, id, false); errs <- err })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	status, err = s.LikeStatus(ctx, u.ID, id)
	if err != nil || status.(map[string]any)["likeCount"].(int64) != 0 {
		t.Fatal(status, err)
	}
	if _, err = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id), "progress": float64(0)}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id)}); err != nil {
		t.Fatal(err)
	}
	r, err := s.History(ctx, u.ID, url.Values{})
	if err != nil {
		t.Fatal(err)
	}
	items := r.(map[string]any)["list"].([]map[string]any)
	if len(items) != 1 || items[0]["progress"].(int64) != 0 {
		t.Fatal(items)
	}
	if _, err = s.Report(ctx, u.ID, values.Fields{"articleId": float64(id), "progress": nil}); err != nil {
		t.Fatal(err)
	}
}
