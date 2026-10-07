package article

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestKeywordGuardUnicodeAndWildcards(t *testing.T) {
	db := testutil.DB(t)
	stamp := time.Now().Format("150405.000000")
	u := model.User{Username: "query-" + stamp, PasswordHash: "!", CredentialsConfigured: true, Role: "member", Status: "active", CreatedAt: 1, UpdatedAt: 1}
	if e := db.Create(&u).Error; e != nil {
		t.Fatal(e)
	}
	rows := make([]model.Article, 2001)
	for i := range rows {
		rows[i] = model.Article{Title: "Probe-" + stamp + " Go 中文 " + fmt.Sprint(i), AuthorID: u.ID, Content: "全文不参与keyword查询", Status: "published", CreatedAt: 1, UpdatedAt: 1}
	}
	if e := db.CreateInBatches(rows, 100).Error; e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Where("author_id = ?", u.ID).Delete(&model.Article{}); db.Delete(&u) })
	s := New(db)
	for _, kw := range []string{"Probe-" + stamp, strings.ToLower("Probe-") + stamp, "Probe-" + stamp + "%中文", "Probe-" + stamp + " Go 中_"} {
		out, e := s.Page(context.Background(), url.Values{"keyword": {kw}}, "published", u.ID)
		if e != nil {
			t.Fatal(e)
		}
		p := out["pagination"].(values.Page)
		if p.Total != 2000 {
			t.Fatalf("%q total=%d", kw, p.Total)
		}
		list := out["list"].([]map[string]any)
		if len(list) != 20 || list[0]["id"] != rows[len(rows)-1].ID {
			t.Fatal("unstable tie pagination")
		}
	}
}
