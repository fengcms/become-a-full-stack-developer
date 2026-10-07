package test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/transport/httpapi"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
)

type fakeWechat struct{}

func (fakeWechat) Exchange(context.Context, string) (string, error) { return "test-openid", nil }

type trace struct {
	Operation string `json:"operation"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Actor     string `json:"actor"`
	Body      any    `json:"body"`
	Status    int    `json:"status"`
	Response  any    `json:"response"`
}
type runner struct {
	t      *testing.T
	app    *httpapi.App
	seen   map[string]bool
	trace  []trace
	actors map[string]string
}

func (r *runner) call(id, actor string, params map[string]int64, body any) map[string]any {
	r.t.Helper()
	op := r.app.Catalog.Operations[id]
	path := op.Path
	for k, v := range params {
		path = strings.ReplaceAll(path, "{"+k+"}", fmt.Sprint(v))
	}
	path = strings.ReplaceAll(path, "{provider}", "wechat")
	var b bytes.Buffer
	if body != nil {
		if e := json.NewEncoder(&b).Encode(body); e != nil {
			r.t.Fatal(e)
		}
	}
	req := httptest.NewRequest(strings.ToUpper(op.Method), path, &b)
	req.Header.Set("Content-Type", "application/json")
	if token := r.actors[actor]; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.app.ServeHTTP(w, req)
	var envelope map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &envelope); e != nil {
		r.t.Fatalf("%s: %s", id, w.Body.String())
	}
	r.trace = append(r.trace, trace{id, strings.ToUpper(op.Method), path, actor, body, w.Code, envelope})
	if w.Code != 200 {
		r.t.Fatalf("%s HTTP%d: %s", id, w.Code, w.Body.String())
	}
	if e := r.app.Catalog.CheckResponse(id, 200, envelope); e != nil {
		r.t.Fatalf("%s schema: %v\n%s", id, e, w.Body.String())
	}
	r.seen[id] = true
	return envelope
}
func data(e map[string]any) map[string]any { return e["data"].(map[string]any) }
func idOf(e map[string]any) int64          { return int64(data(e)["id"].(float64)) }
func token(e map[string]any) string        { return data(e)["accessToken"].(string) }
func TestAllOperations(t *testing.T) {
	db := testutil.DB(t)
	hash, e := auth.Hash("password123")
	if e != nil {
		t.Fatal(e)
	}
	stamp := time.Now().Format("150405.000000")
	admin := model.User{Username: "admin-" + stamp, PasswordHash: hash, CredentialsConfigured: true, Role: "admin", Status: "active", Level: 1, CreatedAt: 1000, UpdatedAt: 1000}
	if e = db.Create(&admin).Error; e != nil {
		t.Fatal(e)
	}
	app, e := bootstrap.New(db, config.Config{JWTSecret: strings.Repeat("s", 32), Storage: "local", UploadDir: t.TempDir(), WechatAppID: "workflow-" + stamp}, bootstrap.Options{Wechat: fakeWechat{}})
	if e != nil {
		t.Fatal(e)
	}
	app.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	r := runner{t: t, app: app, seen: map[string]bool{}, actors: map[string]string{}}
	login := r.call("login", "", nil, values.Fields{"username": admin.Username, "password": "password123"})
	r.actors["admin"] = token(login)
	member := r.call("registerUser", "", nil, values.Fields{"username": "member-" + stamp, "email": stamp + "@test.invalid", "password": "password123", "nickname": "读者"})
	r.actors["member"] = token(member)
	uid := int64(data(member)["user"].(map[string]any)["id"].(float64))
	for _, id := range []string{"getCurrentUser", "getMyProfile"} {
		r.call(id, "member", nil, nil)
	}
	r.call("updateMyProfile", "member", nil, values.Fields{"nickname": "测试会员", "avatar": nil})
	r.call("listUsers", "admin", nil, nil)
	r.call("getUser", "admin", map[string]int64{"id": uid}, nil)
	r.call("updateUser", "admin", map[string]int64{"id": uid}, values.Fields{"level": 3})
	cat := r.call("createCategory", "admin", nil, values.Fields{"name": "工程", "slug": "engineering-" + strings.ReplaceAll(stamp, ".", "-")})
	cid := idOf(cat)
	r.call("updateCategory", "admin", map[string]int64{"id": cid}, values.Fields{"name": "工程实践", "slug": data(cat)["slug"], "sortOrder": 0})
	for _, id := range []string{"listCategories", "getCategoryTree", "getCategoryStats"} {
		r.call(id, "", nil, nil)
	}
	r.call("getCategoryBreadcrumb", "", map[string]int64{"id": cid}, nil)
	tag := r.call("createTag", "admin", nil, values.Fields{"name": "Go", "slug": "go-" + strings.ReplaceAll(stamp, ".", "-")})
	tid := idOf(tag)
	r.call("updateTag", "admin", map[string]int64{"id": tid}, values.Fields{"name": "Go语言", "slug": data(tag)["slug"]})
	r.call("listTags", "", nil, nil)
	published := r.call("createArticle", "admin", nil, values.Fields{"title": "Go 工程", "content": "# 介绍\n```go\n# 不是标题\n```\n## 细节\n## 细节", "summary": "兼容实践", "categoryId": cid, "tags": []string{"Go语言"}, "status": "published"})
	aid := idOf(published)
	params := map[string]int64{"id": aid, "idOrSlug": aid, "articleId": aid}
	r.call("getArticle", "", params, nil)
	r.call("updateArticle", "admin", params, values.Fields{"title": "Go 工程更新", "content": "# 介绍\n## 实践", "summary": nil})
	r.call("listArticles", "", nil, nil)
	r.call("listMyArticles", "admin", nil, nil)
	r.call("listAdminArticles", "admin", nil, nil)
	r.call("getMemberProfile", "", map[string]int64{"id": admin.ID}, nil)
	draft := r.call("createArticle", "member", nil, values.Fields{"title": "会员投稿", "content": "这是投稿"})
	did := idOf(draft)
	r.call("submitArticle", "member", map[string]int64{"id": did}, nil)
	r.call("approveArticle", "admin", map[string]int64{"id": did}, nil)
	r.call("setArticleStatus", "admin", map[string]int64{"id": did}, values.Fields{"status": "published"})
	for _, id := range []string{"getArticleAdjacent", "getArticleRelated", "getArticleToc", "viewArticle"} {
		r.call(id, "", params, nil)
	}
	// Search has a required query parameter, not a request body.
	op := app.Catalog.Operations["search"]
	original := op
	op.Path += "?q=Go"
	app.Catalog.Operations["search"] = op
	r.call("search", "", nil, nil)
	app.Catalog.Operations["search"] = original
	comment := r.call("createComment", "member", params, values.Fields{"content": "这是一条有价值的评论"})
	commentID := idOf(comment)
	r.call("createComment", "member", params, values.Fields{"content": "楼中楼回复", "parentId": commentID})
	r.call("listArticleComments", "", params, nil)
	r.call("listAdminComments", "admin", nil, nil)
	r.call("moderateComment", "admin", map[string]int64{"id": commentID}, values.Fields{"status": "approved"})
	r.call("deleteComment", "member", map[string]int64{"id": commentID}, nil)
	r.call("likeArticle", "member", params, nil)
	again := r.call("likeArticle", "member", params, nil)
	if data(again)["likeCount"] != float64(1) {
		t.Fatal("duplicate like changed count")
	}
	r.call("getArticleLikeStatus", "member", params, nil)
	r.call("listMyLikes", "member", nil, nil)
	r.call("unlikeArticle", "member", params, nil)
	r.call("addFavorite", "member", nil, values.Fields{"articleId": aid})
	r.call("listMyFavorites", "member", nil, nil)
	r.call("removeFavorite", "member", params, nil)
	r.call("reportReadingProgress", "member", nil, values.Fields{"articleId": aid, "progress": 0})
	r.call("reportReadingProgress", "member", nil, values.Fields{"articleId": aid})
	r.call("listMyHistory", "member", nil, nil)
	r.call("removeHistoryItem", "member", params, nil)
	r.call("clearMyHistory", "member", nil, nil)
	n := model.Notification{UserID: uid, Type: "system", Title: "系统消息", CreatedAt: 1000}
	if e = db.Create(&n).Error; e != nil {
		t.Fatal(e)
	}
	r.call("listMyNotifications", "member", nil, nil)
	r.call("getUnreadNotificationCount", "member", nil, nil)
	r.call("updateNotification", "member", map[string]int64{"id": n.ID}, values.Fields{"isRead": false})
	r.call("readAllNotifications", "member", nil, nil)
	for _, id := range []string{"getSiteSettings", "adminGetSiteSettings"} {
		r.call(id, "admin", nil, nil)
	}
	r.call("adminUpdateSiteSettings", "admin", nil, values.Fields{"siteTitle": nil, "copyright": "测试版权"})
	r.call("getSiteStats", "", nil, nil)
	// Multipart is validated by its own trust-boundary parser.
	var form bytes.Buffer
	writer := multipart.NewWriter(&form)
	part, e := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="image.svg"`}, "Content-Type": {"image/svg+xml"}})
	if e != nil {
		t.Fatal(e)
	}
	_, _ = part.Write([]byte("<svg/>"))
	_ = writer.Close()
	req := httptest.NewRequest("POST", "/api/v1/upload", &form)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+r.actors["member"])
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)
	var upload map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &upload)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if e = app.Catalog.CheckResponse("uploadFile", 200, upload); e != nil {
		t.Fatal(e)
	}
	r.seen["uploadFile"] = true
	r.trace = append(r.trace, trace{"uploadFile", "POST", "/api/v1/upload", "member", map[string]any{"_multipart": true, "name": "image.svg", "mime": "image/svg+xml", "content": "<svg/>"}, 200, upload})
	r.call("listMyAttachments", "member", nil, nil)
	fileReq := httptest.NewRequest("GET", data(upload)["url"].(string), nil)
	fileRes := httptest.NewRecorder()
	app.ServeHTTP(fileRes, fileReq)
	if fileRes.Code != 200 || fileRes.Header().Get("Content-Disposition") != "attachment" || fileRes.Body.String() != "<svg/>" {
		t.Fatal("file response", fileRes)
	}
	r.call("deleteAttachment", "member", map[string]int64{"id": idOf(upload)}, nil)
	wx := r.call("oauthCallback", "", nil, values.Fields{"code": "test-code"})
	r.actors["wechat"] = token(wx)
	setup := r.call("setupAccount", "wechat", nil, values.Fields{"username": "wx-local-" + stamp, "password": "password123"})
	r.actors["wechat"] = token(setup)
	r.call("login", "", nil, values.Fields{"username": "wx-local-" + stamp, "password": "password123"})
	refreshed := r.call("refreshToken", "", nil, values.Fields{"refreshToken": data(member)["refreshToken"]})
	r.actors["member"] = token(refreshed)
	r.call("changePassword", "member", nil, values.Fields{"oldPassword": "password123", "newPassword": "new-password123"})
	r.call("adminResetPassword", "admin", map[string]int64{"id": uid}, values.Fields{"newPassword": "password123"})
	r.call("logout", "member", nil, nil)
	r.call("deleteArticle", "member", map[string]int64{"id": did}, nil)
	r.call("deleteArticle", "admin", params, nil)
	r.call("deleteTag", "admin", map[string]int64{"id": tid}, nil)
	r.call("deleteCategory", "admin", map[string]int64{"id": cid}, nil)
	for id := range app.Catalog.Operations {
		if !r.seen[id] {
			t.Error("untested operation", id)
		}
	}
	t.Logf("schema-validated operations: %d/68", len(r.seen))
	if path := os.Getenv("TRACE_OUTPUT"); path != "" {
		b, _ := json.MarshalIndent(map[string]any{"seed": map[string]any{"admin": admin}, "requests": r.trace}, "", "  ")
		if e = os.WriteFile(path, b, 0600); e != nil {
			t.Fatal(e)
		}
	}
}
