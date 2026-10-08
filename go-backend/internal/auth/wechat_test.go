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
		wg.Go(func() { r, err := s.WechatLogin(context.Background(), "code"); results <- r; errs <- err })
	}
	wg.Wait()
	close(errs)
	close(results)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
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
	if err := db.Model(&model.WechatIdentity{}).Where("app_id = ?", s.AppID).Count(&count).Error; err != nil || count != 1 {
		t.Fatal(count, err)
	}
	setupErrors := make(chan error, 2)
	for range 2 {
		wg.Go(func() {
			_, err := s.Setup(context.Background(), uid, values.Fields{"username": "wx-local-" + stamp, "password": "password123"})
			setupErrors <- err
		})
	}
	wg.Wait()
	close(setupErrors)
	wins := 0
	for err := range setupErrors {
		if err == nil {
			wins++
		} else if fault.Resolve(err).Code != fault.Conflict {
			t.Fatal(err)
		}
	}
	if wins != 1 {
		t.Fatal("setup winners", wins)
	}
	if _, err := s.Login(context.Background(), values.Fields{"username": "wx-local-" + stamp, "password": "password123"}); err != nil {
		t.Fatal(err)
	}
}
