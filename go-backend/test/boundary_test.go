package test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
)

func TestEveryOperationTrustBoundary(t *testing.T) {
	db := testutil.DB(t)
	secret := strings.Repeat("b", 32)
	app, e := bootstrap.New(db, config.Config{JWTSecret: secret, Storage: "local", UploadDir: t.TempDir(), Origins: "http://client.local"}, bootstrap.Options{})
	if e != nil {
		t.Fatal(e)
	}
	app.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	tokens := map[string]string{}
	seeded := []model.User{}
	records := []trace{}
	service := auth.New(db, secret)
	for _, role := range []string{"member", "admin"} {
		u := model.User{Username: role + "-boundary-" + time.Now().Format("150405.000000"), PasswordHash: "!", CredentialsConfigured: true, Role: role, Status: "active", Level: 1, CreatedAt: 1000, UpdatedAt: 1000}
		if e = db.Create(&u).Error; e != nil {
			t.Fatal(e)
		}
		seeded = append(seeded, u)
		result, err := service.Result(db, u)
		if err != nil {
			t.Fatal(err)
		}
		tokens[role] = result["accessToken"].(string)
	}
	checked := 0
	for id, op := range app.Catalog.Operations {
		path := op.Path
		for _, param := range []string{"id", "idOrSlug", "articleId"} {
			path = strings.ReplaceAll(path, "{"+param+"}", "999999999")
		}
		path = strings.ReplaceAll(path, "{provider}", "wechat")
		call := func(token, body string, status, code int) {
			t.Helper()
			req := httptest.NewRequest(strings.ToUpper(op.Method), path, bytes.NewBufferString(body))
			if token != "" {
				req.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			app.ServeHTTP(w, req)
			var out map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
				t.Fatalf("%s: %s", id, w.Body.String())
			}
			if err := app.Catalog.CheckResponse(id, w.Code, out); err != nil {
				t.Fatalf("%s error schema: %v", id, err)
			}
			if w.Code != status || out["code"] != float64(code) {
				t.Fatalf("%s expected %d/%d got %d %s", id, status, code, w.Code, w.Body.String())
			}
			if out["requestId"] == "" || out["timestamp"] == "" || out["message"] == nil {
				t.Fatal("missing error envelope")
			}
			if code == 4001 {
				if _, ok := out["data"].(map[string]any)["errors"].([]any); !ok {
					t.Fatal("missing field errors")
				}
			}
			if status == 401 || status == 403 {
				actor := ""
				if token == "invalid-token" {
					actor = "invalid"
				} else if token == tokens["member"] {
					actor = "member"
				}
				var input any
				_ = json.Unmarshal([]byte(body), &input)
				records = append(records, trace{id, strings.ToUpper(op.Method), path, actor, input, w.Code, out})
			}
			checked++
		}
		if op.MinRole != "" {
			call("", "{}", 401, 1004)
			call("invalid-token", "{}", 401, 1002)
			if !op.Owner && op.MinRole != "member" {
				call(tokens["member"], "{}", 403, 2001)
			}
		}
		if op.Request != nil {
			call(tokens["admin"], "{", 400, 4001)
			if op.Request.Validate(map[string]any{}) != nil {
				call(tokens["admin"], "{}", 400, 4001)
			}
		}
	}
	// CORS, cookies and missing routes are observable compatibility boundaries.
	req := httptest.NewRequest("OPTIONS", "/api/v1/articles", nil)
	req.Header.Set("Origin", "http://client.local")
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "http://client.local" || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("CORS mismatch")
	}
	w = httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/missing", nil))
	if w.Code != 404 {
		t.Fatal("missing route")
	}
	t.Logf("operation trust-boundary assertions: %d", checked)
	if path := os.Getenv("BOUNDARY_TRACE_OUTPUT"); path != "" {
		b, _ := json.MarshalIndent(map[string]any{"seed": map[string]any{"users": seeded}, "requests": records}, "", "  ")
		if e := os.WriteFile(path, b, 0600); e != nil {
			t.Fatal(e)
		}
	}
}

func TestSessionCookieAndReplayBoundary(t *testing.T) {
	db := testutil.DB(t)
	app, e := bootstrap.New(db, config.Config{JWTSecret: strings.Repeat("s", 32), Storage: "local", UploadDir: t.TempDir()}, bootstrap.Options{})
	if e != nil {
		t.Fatal(e)
	}
	app.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	request := func(path, body, token, cookie string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", path, bytes.NewBufferString(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)
		return w
	}
	stamp := time.Now().Format("150405.000000")
	w := request("/api/v1/auth/register", `{"username":"cookie-`+stamp+`","password":"password123","email":"cookie-`+stamp+`@test.invalid"}`, "", "")
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("cookie missing")
	}
	c := cookies[0]
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteNoneMode || c.Path != "/" || c.MaxAge != 604800 {
		t.Fatal("cookie attributes", c)
	}
	w = request("/api/v1/auth/refresh", `{"refreshToken":"wrong-body-token"}`, "", c.Name+"="+c.Value)
	if w.Code != 200 {
		t.Fatal("cookie must take precedence", w.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	access := out["data"].(map[string]any)["accessToken"].(string)
	w = request("/api/v1/auth/refresh", `{}`, "", c.Name+"="+c.Value)
	if w.Code != 401 || !strings.Contains(w.Body.String(), "1003") {
		t.Fatal("replay", w.Body.String())
	}
	w = request("/api/v1/auth/logout", `{}`, access, "")
	if w.Code != 200 || w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout cookie", w.Body.String())
	}
	for _, provider := range []string{"weibo", "github"} {
		w = request("/api/v1/auth/"+provider+"/callback", `{"code":"fake"}`, "", "")
		if w.Code != 500 || !strings.Contains(w.Body.String(), "5000") {
			t.Fatal("provider boundary", w.Body.String())
		}
	}
}
