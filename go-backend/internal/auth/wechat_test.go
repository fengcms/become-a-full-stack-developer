package auth

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

type fakeWechat struct{}

func (fakeWechat) Exchange(context.Context, string) (string, error) { return "identity", nil }
func TestConcurrentWechatAndCredentials(t *testing.T) {
	db := testutil.DB(t)
	s := New(db, strings.Repeat("s", 32))
	stamp := time.Now().Format("150405.000000")
	s.AppID = "auth-" + stamp
	s.Wechat = fakeWechat{}
	var wg sync.WaitGroup
	results := make(chan map[string]any, 2)
	errs := make(chan error, 2)
	for range 2 {
		wg.Go(func() { r, e := s.WechatLogin(context.Background(), "code"); results <- r; errs <- e })
	}
	wg.Wait()
	close(errs)
	close(results)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var uid int64
	for r := range results {
		id := r["user"].(map[string]any)["id"].(int64)
		if uid != 0 && uid != id {
			t.Fatal("created duplicate users")
		}
		uid = id
	}
	var count int64
	if e := db.Model(&model.WechatIdentity{}).Where("app_id = ?", s.AppID).Count(&count).Error; e != nil || count != 1 {
		t.Fatal(count, e)
	}
	setupErrors := make(chan error, 2)
	for range 2 {
		wg.Go(func() {
			_, e := s.Setup(context.Background(), uid, values.Fields{"username": "wx-local-" + stamp, "password": "password123"})
			setupErrors <- e
		})
	}
	wg.Wait()
	close(setupErrors)
	wins := 0
	for e := range setupErrors {
		if e == nil {
			wins++
		} else if fault.Resolve(e).Code != fault.Conflict {
			t.Fatal(e)
		}
	}
	if wins != 1 {
		t.Fatal("setup winners", wins)
	}
	if _, e := s.Login(context.Background(), values.Fields{"username": "wx-local-" + stamp, "password": "password123"}); e != nil {
		t.Fatal(e)
	}
}
