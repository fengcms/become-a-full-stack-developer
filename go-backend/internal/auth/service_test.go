package auth

import (
	"context"
	"encoding/json"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRefreshReplayCommitsRevocation(t *testing.T) {
	db := testutil.DB(t)
	s := New(db, strings.Repeat("s", 32))
	in := values.Fields{"username": "rotate-" + time.Now().Format("150405.000000"), "email": time.Now().Format("150405.000000") + "@test.invalid", "password": "password123"}
	result, e := s.Register(context.Background(), in)
	if e != nil {
		t.Fatal(e)
	}
	old := result["refreshToken"].(string)
	fresh, e := s.Rotate(context.Background(), old)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Rotate(context.Background(), old); fault.Resolve(e).Code != fault.Refresh {
		t.Fatal(e)
	}
	if _, e = s.Rotate(context.Background(), fresh["refreshToken"].(string)); fault.Resolve(e).Code != fault.Refresh {
		t.Fatal("family revocation rolled back", e)
	}
}
func TestConcurrentRefresh(t *testing.T) {
	db := testutil.DB(t)
	s := New(db, strings.Repeat("s", 32))
	stamp := time.Now().Format("150405.000000")
	r, e := s.Register(context.Background(), values.Fields{"username": "concurrent-" + stamp, "email": stamp + "@test.invalid", "password": "password123"})
	if e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, e := s.Rotate(context.Background(), r["refreshToken"].(string)); results <- e })
	}
	wg.Wait()
	close(results)
	success := 0
	for e := range results {
		if e == nil {
			success++
		} else if fault.Resolve(e).Code != fault.Refresh {
			t.Fatal(e)
		}
	}
	if success != 1 {
		t.Fatal("successful consumers", success)
	}
	var n int64
	if e = db.Model(&model.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", r["user"].(map[string]any)["id"]).Count(&n).Error; e != nil || n != 0 {
		t.Fatal("replay must revoke family", n, e)
	}
}
func TestBcryptCompatibility(t *testing.T) {
	for _, pw := range []string{"password123", strings.Repeat("a", 80), strings.Repeat("你好😀", 12)} {
		hash, e := Hash(pw)
		if e != nil || !Verify(pw, hash) {
			t.Fatal(e)
		}
		if Verify("wrong-password", hash) {
			t.Fatal("wrong password accepted")
		}
	}
}

func TestNodeBcryptVectors(t *testing.T) {
	b, e := os.ReadFile("testdata/node-bcrypt.json")
	if e != nil {
		t.Fatal(e)
	}
	var vectors []struct{ Password, Hash string }
	if e = json.Unmarshal(b, &vectors); e != nil {
		t.Fatal(e)
	}
	for _, v := range vectors {
		if !Verify(v.Password, v.Hash) {
			t.Fatal("Node bcrypt hash incompatible")
		}
	}
}
