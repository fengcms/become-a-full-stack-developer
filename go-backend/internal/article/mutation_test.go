package article

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestOwnershipStateAndSlugRelease(t *testing.T) {
	db := testutil.DB(t)
	stamp := time.Now().Format("150405.000000")
	u := model.User{
		Username:              "article-" + stamp,
		PasswordHash:          "!",
		CredentialsConfigured: true,
		Role:                  "member",
		Status:                "active",
		Level:                 1,
		CreatedAt:             1,
		UpdatedAt:             1,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	s := New(db)
	actor := values.Actor{ID: u.ID, Role: "member"}
	ctx := context.Background()
	r, err := s.Create(ctx, actor, values.Fields{
		"title":   "文章",
		"content": "内容",
		"slug":    "ignored",
		"status":  "published",
	})
	if err != nil {
		t.Fatal(err)
	}
	id := r["id"].(int64)
	if r["status"] != "pending" || r["slug"].(*string) != nil {
		t.Fatal(r)
	}
	if _, err = s.Get(ctx, fmt.Sprint(id), values.Actor{}); fault.Resolve(err).Code != fault.NotFound {
		t.Fatal(err)
	}
	if _, err = s.Update(ctx, id, values.Actor{ID: u.ID + 1, Role: "member"}, values.Fields{"title": "越权"}); fault.Resolve(err).Code != fault.Forbidden {
		t.Fatal(err)
	}
	if _, err = s.Transition(ctx, id, actor, "submit", ""); fault.Resolve(err).Code != fault.State {
		t.Fatal(err)
	}
	admin := values.Actor{ID: u.ID, Role: "admin"}
	slug := "release-" + stamp[:6]
	if _, err = s.Update(ctx, id, admin, values.Fields{"slug": slug}); err != nil {
		t.Fatal(err)
	}
	if err = s.Delete(ctx, id, actor); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Create(ctx, admin, values.Fields{
		"title":   "复用",
		"content": "内容",
		"slug":    slug,
	}); err != nil {
		t.Fatal("slug not released", err)
	}
}
