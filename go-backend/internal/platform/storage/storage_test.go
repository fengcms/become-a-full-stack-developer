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
	if e := s.Put(ctx, "abc.svg", []byte("image"), "image/svg+xml"); e != nil {
		t.Fatal(e)
	}
	b, e := s.Get(ctx, "abc.svg")
	if e != nil || string(b) != "image" {
		t.Fatal(e)
	}
	for _, key := range []string{"../secret", "..", "/etc/passwd"} {
		if _, e = s.Get(ctx, key); e == nil {
			t.Fatal("unsafe key accepted", key)
		}
	}
	if e = s.Delete(ctx, "abc.svg"); e != nil {
		t.Fatal(e)
	}
	b, e = s.Get(ctx, "abc.svg")
	if e != nil || b != nil {
		t.Fatal("delete failed", e)
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
	s, e := NewR2(server.URL, "bucket", "fake-key", "fake-secret")
	if e != nil {
		t.Fatal(e)
	}
	ctx := context.Background()
	if e = s.Put(ctx, "x.png", []byte("r2 bytes"), "image/png"); e != nil {
		t.Fatal(e)
	}
	b, e := s.Get(ctx, "x.png")
	if e != nil || string(b) != "r2 bytes" {
		t.Fatal(string(b), e)
	}
	if e = s.Delete(ctx, "x.png"); e != nil {
		t.Fatal(e)
	}
	b, e = s.Get(ctx, "x.png")
	if e != nil || b != nil {
		t.Fatal(e)
	}
}
