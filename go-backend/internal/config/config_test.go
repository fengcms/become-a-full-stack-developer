package config

import "testing"

func TestStartupBoundary(t *testing.T) {
	t.Setenv("JWT_SECRET", "configuration-test-secret-32-bytes")
	t.Setenv("DATABASE_URL", ":memory:")
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("STORAGE_DRIVER", "local")
	t.Setenv("TRUSTED_PROXIES", "")
	t.Setenv("CORS_ORIGINS", "*")
	t.Setenv("APP_ENV", "production")
	if _, e := Load(); e == nil {
		t.Fatal("production wildcard allowed")
	}
	t.Setenv("APP_ENV", "development")
	for _, ratio := range []string{"NaN", "+Inf", "-0.1", "1.1"} {
		t.Setenv("COMMENT_REJECT_RATIO", ratio)
		if _, e := Load(); e == nil {
			t.Fatal("invalid threshold", ratio)
		}
	}
	t.Setenv("COMMENT_REJECT_RATIO", "0")
	c, e := Load()
	if e != nil || *c.CommentRejectRatio != 0 {
		t.Fatal("zero threshold rejected", e)
	}
	t.Setenv("TRUSTED_PROXIES", "127.0.0.1")
	if _, e = Load(); e == nil {
		t.Fatal("invalid proxy prefix allowed")
	}
}
