package auth

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

func TestRefreshReplayCommitsRevocation(t *testing.T) {
	db := testutil.DB(t)
	s := New(db, strings.Repeat("s", 32))
	in := values.Fields{
		"username": "rotate-" + time.Now().Format("150405.000000"),
		"email":    time.Now().Format("150405.000000") + "@test.invalid",
		"password": "password123",
	}
	result, err := s.Register(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	old := result["refreshToken"].(string)
	fresh, err := s.Rotate(context.Background(), old)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Rotate(context.Background(), old); fault.Resolve(err).Code != fault.Refresh {
		t.Fatal(err)
	}
	if _, err = s.Rotate(context.Background(), fresh["refreshToken"].(string)); fault.Resolve(err).Code != fault.Refresh {
		t.Fatal("family revocation rolled back", err)
	}
}
func TestConcurrentRefresh(t *testing.T) {
	db := testutil.DB(t)
	s := New(db, strings.Repeat("s", 32))
	stamp := time.Now().Format("150405.000000")
	r, err := s.Register(context.Background(), values.Fields{
		"username": "concurrent-" + stamp,
		"email":    stamp + "@test.invalid",
		"password": "password123",
	})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := s.Rotate(context.Background(), r["refreshToken"].(string)); results <- err })
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if fault.Resolve(err).Code != fault.Refresh {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatal("successful consumers", success)
	}
	var n int64
	if err = db.Model(&model.RefreshToken{}).Where("user_id = ? AND revoked_at IS NULL", r["user"].(map[string]any)["id"]).Count(&n).Error; err != nil || n != 0 {
		t.Fatal("replay must revoke family", n, err)
	}
}
func TestBcryptCompatibility(t *testing.T) {
	for _, pw := range []string{
		"password123",
		strings.Repeat("a", 80),
		strings.Repeat("你好😀", 12),
	} {
		hash, err := Hash(pw)
		if err != nil || !Verify(pw, hash) {
			t.Fatal(err)
		}
		if Verify("wrong-password", hash) {
			t.Fatal("wrong password accepted")
		}
	}
}

func TestNodeBcryptVectors(t *testing.T) {
	b, err := os.ReadFile("testdata/node-bcrypt.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []struct{ Password, Hash string }
	if err = json.Unmarshal(b, &vectors); err != nil {
		t.Fatal(err)
	}
	for _, v := range vectors {
		if !Verify(v.Password, v.Hash) {
			t.Fatal("Node bcrypt hash incompatible")
		}
	}
}

func TestNodeJWTAndExpirationBoundary(t *testing.T) {
	b, err := os.ReadFile("testdata/node-jwt.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Secret, Token string
		IssuedAt      int64
	}
	if err = json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	s := New(nil, fixture.Secret)
	s.Now = func() time.Time { return time.Unix(fixture.IssuedAt, 0) }
	actor, err := s.Parse(fixture.Token)
	if err != nil || actor.ID != 42 || actor.Role != "editor" {
		t.Fatal("Node JWT incompatible", err)
	}
	s.Now = func() time.Time { return time.Unix(fixture.IssuedAt+3600, 0) }
	if _, err = s.Parse(fixture.Token); fault.Resolve(err).Code != fault.Token {
		t.Fatal("expiry boundary accepted")
	}
}
