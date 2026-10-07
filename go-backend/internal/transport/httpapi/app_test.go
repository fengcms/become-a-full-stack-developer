package httpapi

import (
	"bytes"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/contract"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPublicLimitIsPerOperation(t *testing.T) {
	c, e := contract.Load()
	if e != nil {
		t.Fatal(e)
	}
	a := New(c, nil, "")
	a.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	a.Register("listArticles", func(Request) (any, error) { return nil, nil })
	a.Register("listCategories", func(Request) (any, error) { return nil, nil })
	for i := 0; i < 61; i++ {
		w := httptest.NewRecorder()
		a.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/articles", nil))
		want := 200
		if i == 60 {
			want = 429
			if w.Header().Get("Retry-After") == "" {
				t.Fatal("missing retry header")
			}
		}
		if w.Code != want {
			t.Fatal(i, w.Code)
		}
	}
	w := httptest.NewRecorder()
	a.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/categories", nil))
	if w.Code != 200 {
		t.Fatal("operations share a bucket")
	}
}
func TestAuthenticationAndInputBoundary(t *testing.T) {
	c, e := contract.Load()
	if e != nil {
		t.Fatal(e)
	}
	a := New(c, nil, "http://client.local")
	a.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	a.Register("updateMyProfile", func(Request) (any, error) { return nil, nil })
	w := httptest.NewRecorder()
	a.ServeHTTP(w, httptest.NewRequest("PATCH", "/api/v1/me/profile", bytes.NewBufferString("{}")))
	if w.Code != 401 || !strings.Contains(w.Body.String(), "1004") {
		t.Fatal(w.Body.String())
	}
	a.Register("registerUser", func(Request) (any, error) { t.Fatal("invalid input reached domain"); return nil, nil })
	w = httptest.NewRecorder()
	a.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewBufferString(`{"username":17}`)))
	if w.Code != 400 || !strings.Contains(w.Body.String(), "errors") {
		t.Fatal(w.Body.String())
	}
}
func TestLimiterExpiresAndIPTrust(t *testing.T) {
	l := NewLimiter()
	now := time.Now()
	for range 60 {
		_, _ = l.Allow("x", now)
	}
	if _, ok := l.Allow("x", now.Add(time.Minute)); !ok {
		t.Fatal("window didn't expire")
	}
	a := &App{}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "spoofed, 192.0.2.1")
	if a.clientIP(r) != "127.0.0.1" {
		t.Fatal("untrusted forwarded header")
	}
	a.TrustedProxies = []string{"127.0.0.1/32"}
	if a.clientIP(r) != "192.0.2.1" {
		t.Fatal("trusted edge parsing")
	}
}
