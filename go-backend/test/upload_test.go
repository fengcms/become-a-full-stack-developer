package test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/auth"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/bootstrap"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
)

func TestMultipartSizeAndShapeBoundary(t *testing.T) {
	db := testutil.DB(t)
	secret := strings.Repeat("s", 32)
	u := model.User{
		Username:     "multipart-" + time.Now().Format("150405.000000"),
		PasswordHash: "!",
		Role:         "member",
		Status:       "active",
		Level:        1,
		CreatedAt:    1,
		UpdatedAt:    1,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
	result, err := auth.New(db, secret).Result(db, u)
	if err != nil {
		t.Fatal(err)
	}
	app, err := bootstrap.New(db, config.Config{
		JWTSecret: secret,
		Storage:   "local",
		UploadDir: t.TempDir(),
	}, bootstrap.Options{})
	if err != nil {
		t.Fatal(err)
	}
	app.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	for _, tc := range []struct {
		name, mime        string
		count, size, want int
	}{
		{
			"missing",
			"image/png",
			0,
			0,
			400,
		}, {
			"duplicate",
			"image/png",
			2,
			1,
			400,
		}, {
			"bad-mime",
			"application/javascript",
			1,
			1,
			400,
		}, {
			"exact-10MiB",
			"image/png",
			1,
			10 * 1024 * 1024,
			200,
		}, {
			"over-10MiB",
			"image/png",
			1,
			10*1024*1024 + 1,
			400,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var b bytes.Buffer
			writer := multipart.NewWriter(&b)
			for range tc.count {
				part, err := writer.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="edge.png"`}, "Content-Type": {tc.mime}})
				if err != nil {
					t.Fatal(err)
				}
				_, _ = part.Write(make([]byte, tc.size))
			}
			_ = writer.Close()
			req := httptest.NewRequest("POST", "/api/v1/upload", &b)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			req.Header.Set("Authorization", "Bearer "+result["accessToken"].(string))
			w := httptest.NewRecorder()
			app.ServeHTTP(w, req)
			var body map[string]any
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if w.Code != tc.want {
				t.Fatal(w.Code, w.Body.String())
			}
			if err := app.Catalog.CheckResponse("uploadFile", w.Code, body); err != nil {
				t.Fatal(err)
			}
		})
	}
}
