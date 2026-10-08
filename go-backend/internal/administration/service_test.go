package administration

import (
	"context"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestSelfGuardAndSiteNull(t *testing.T) {
	db := testutil.DB(t)
	u := model.User{
		Username:              "admin-" + time.Now().Format("150405.000000"),
		PasswordHash:          "!",
		CredentialsConfigured: true,
		Role:                  "admin",
		Status:                "active",
		CreatedAt:             1,
		UpdatedAt:             1,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	s := New(db, nil)
	if _, err := s.UpdateUser(context.Background(), u.ID, u.ID, values.Fields{"status": "disabled"}); fault.Resolve(err).Code != fault.Forbidden {
		t.Fatal(err)
	}
	r, err := s.Site(context.Background(), values.Fields{"siteTitle": nil, "siteName": "测试"})
	if err != nil || r.(map[string]any)["siteTitle"].(*string) != nil {
		t.Fatal(r, err)
	}
}
