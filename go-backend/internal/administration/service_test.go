package administration

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"testing"
	"time"
)

func TestSelfGuardAndSiteNull(t *testing.T) {
	db := testutil.DB(t)
	u := model.User{Username: "admin-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: "admin", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	s := New(db, nil)
	if _, e := s.UpdateUser(context.Background(), u.ID, u.ID, values.Fields{"status": "disabled"}); fault.Resolve(e).Code != fault.Forbidden {
		t.Fatal(e)
	}
	r, e := s.Site(context.Background(), values.Fields{"siteTitle": nil, "siteName": "测试"})
	if e != nil || r.(map[string]any)["siteTitle"].(*string) != nil {
		t.Fatal(r, e)
	}
}
