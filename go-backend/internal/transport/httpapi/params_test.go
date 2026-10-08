package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/contract"
)

func TestRegisterIDPreservesValidationAndAuthorization(t *testing.T) {
	catalog, err := contract.Load()
	if err != nil {
		t.Fatal(err)
	}
	app := New(catalog, nil, "")
	app.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	calls := 0
	app.registerID("getArticleRelated", "id", func(_ Request, id int64) (any, error) {
		calls++
		if id != 7 {
			t.Fatalf("wrong parsed ID: %d", id)
		}
		return []any{}, nil
	})
	app.registerID("deleteArticle", "id", func(Request, int64) (any, error) {
		t.Fatal("unauthenticated request reached the handler")
		return nil, nil
	})
	for _, tc := range []struct {
		method, path string
		status, code int
	}{
		{"GET", "/api/v1/articles/7/related", 200, 0},
		{"GET", "/api/v1/articles/0/related", 404, 3001},
		{"GET", "/api/v1/articles/-1/related", 404, 3001},
		{"GET", "/api/v1/articles/abc/related", 404, 3001},
		{"GET", "/api/v1/articles/9223372036854775808/related", 404, 3001},
		{"DELETE", "/api/v1/articles/7", 401, 1004},
	} {
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
		var body map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if response.Code != tc.status || body["code"] != float64(tc.code) {
			t.Fatalf("%s: %d %s", tc.path, response.Code, response.Body)
		}
	}
	if calls != 1 {
		t.Fatalf("handler calls: %d", calls)
	}
}
