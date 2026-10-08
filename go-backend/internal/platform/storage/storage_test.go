package storage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestLocalSafety(t *testing.T) {
	s := Local{Root: t.TempDir()}
	ctx := context.Background()
	if err := s.Put(ctx, "abc.svg", []byte("image"), "image/svg+xml"); err != nil {
		t.Fatal(err)
	}
	b, err := s.Get(ctx, "abc.svg")
	if err != nil || string(b) != "image" {
		t.Fatal(err)
	}
	for _, key := range []string{
		"../secret",
		"..",
		"/etc/passwd",
	} {
		if _, err = s.Get(ctx, key); err == nil {
			t.Fatal("unsafe key accepted", key)
		}
	}
	if err = s.Delete(ctx, "abc.svg"); err != nil {
		t.Fatal(err)
	}
	b, err = s.Get(ctx, "abc.svg")
	if err != nil || b != nil {
		t.Fatal("delete failed", err)
	}
}
func TestR2SignedObjectLifecycle(t *testing.T) {
	var mu sync.Mutex
	objects := map[string][]byte{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256") {
			t.Error("unsigned S3 request")
		}
		mu.Lock()
		defer mu.Unlock()
		switch r.Method {
		case "PUT":
			b, _ := io.ReadAll(r.Body)
			objects[r.URL.Path] = b
			w.WriteHeader(200)
		case "GET":
			b, ok := objects[r.URL.Path]
			if !ok {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(404)
				_, _ = w.Write([]byte("<Error><Code>NoSuchKey</Code></Error>"))
				return
			}
			_, _ = w.Write(b)
		case "DELETE":
			delete(objects, r.URL.Path)
			w.WriteHeader(204)
		}
	}))
	defer server.Close()
	s, err := NewR2(server.URL, "bucket", "fake-key", "fake-secret")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = s.Put(ctx, "x.png", []byte("r2 bytes"), "image/png"); err != nil {
		t.Fatal(err)
	}
	b, err := s.Get(ctx, "x.png")
	if err != nil || string(b) != "r2 bytes" {
		t.Fatal(string(b), err)
	}
	if err = s.Delete(ctx, "x.png"); err != nil {
		t.Fatal(err)
	}
	b, err = s.Get(ctx, "x.png")
	if err != nil || b != nil {
		t.Fatal(err)
	}
}
