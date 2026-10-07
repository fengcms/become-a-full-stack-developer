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
	u := model.User{Username: "article-" + stamp, PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", Level: 1, CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	s := New(db)
	actor := values.Actor{ID: u.ID, Role: "member"}
	ctx := context.Background()
	r, e := s.Create(ctx, actor, values.Fields{"title": "文章", "content": "内容", "slug": "ignored", "status": "published"})
	if e != nil {
		t.Fatal(e)
	}
	id := r["id"].(int64)
	if r["status"] != "pending" || r["slug"].(*string) != nil {
		t.Fatal(r)
	}
	if _, e = s.Get(ctx, fmt.Sprint(id), values.Actor{}); fault.Resolve(e).Code != fault.NotFound {
		t.Fatal(e)
	}
	if _, e = s.Update(ctx, id, values.Actor{ID: u.ID + 1, Role: "member"}, values.Fields{"title": "越权"}); fault.Resolve(e).Code != fault.Forbidden {
		t.Fatal(e)
	}
	if _, e = s.Transition(ctx, id, actor, "submit", ""); fault.Resolve(e).Code != fault.State {
		t.Fatal(e)
	}
	admin := values.Actor{ID: u.ID, Role: "admin"}
	slug := "release-" + stamp[:6]
	if _, e = s.Update(ctx, id, admin, values.Fields{"slug": slug}); e != nil {
		t.Fatal(e)
	}
	if e = s.Delete(ctx, id, actor); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Create(ctx, admin, values.Fields{"title": "复用", "content": "内容", "slug": slug}); e != nil {
		t.Fatal("slug not released", e)
	}
}
