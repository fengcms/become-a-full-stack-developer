package httpapi

import (
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/attachment"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
)

// fileContentTypes 与 acceptedUploadTypes 是包内只读的直出和上传白名单。
var fileContentTypes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
	".pdf":  "application/pdf",
}

var acceptedUploadTypes = map[string]bool{
	"image/png":       true,
	"image/jpeg":      true,
	"image/gif":       true,
	"image/webp":      true,
	"image/svg+xml":   true,
	"application/pdf": true,
}

// BindAttachments 注册附件上传、本人附件查询和文件直出。
func (a *App) BindAttachments(s *attachment.Service) {
	a.Register("uploadFile", func(r Request) (any, error) {
		return uploadFile(r, s)
	})
	a.Register("listMyAttachments", func(r Request) (any, error) {
		return s.Page(r.Context(), r.Actor.ID, r.HTTP.URL.Query())
	})
	a.registerID("deleteAttachment", "id", func(r Request, id int64) (any, error) {
		return map[string]any{}, s.Delete(r.Context(), id, r.Actor)
	})
	a.Mux.HandleFunc("GET /files/{key}", func(w http.ResponseWriter, r *http.Request) {
		key := r.PathValue("key")
		b, err := s.Read(r.Context(), key)
		if err != nil {
			a.failure(w, err)
			return
		}
		mime := fileContentTypes[strings.ToLower(filepath.Ext(key))]
		if mime == "" {
			mime = "application/octet-stream"
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		disposition := "inline"
		if mime == "image/svg+xml" {
			disposition = "attachment"
		}
		w.Header().Set("Content-Disposition", disposition)
		w.WriteHeader(200)
		_, _ = w.Write(b)
	})
}

// uploadFile 只处理 multipart 的传输约束；对象引用与补偿属于附件领域。
func uploadFile(r Request, s *attachment.Service) (any, error) {
	r.HTTP.Body = http.MaxBytesReader(r.Writer, r.HTTP.Body, 11*1024*1024)
	if err := r.HTTP.ParseMultipartForm(1024 * 1024); err != nil {
		return nil, fault.Field("file", "上传格式或大小不合法")
	}
	defer r.HTTP.MultipartForm.RemoveAll()
	files := r.HTTP.MultipartForm.File["file"]
	if len(files) != 1 || len(r.HTTP.MultipartForm.Value["file"]) > 0 {
		return nil, fault.Field("file", "须提供一个文件")
	}
	f := files[0]
	mime := f.Header.Get("Content-Type")

	if !acceptedUploadTypes[mime] {
		return nil, fault.Field("file", "文件类型不合法（须为图片或 PDF）")
	}
	if f.Size > 10*1024*1024 {
		return nil, fault.Field("file", "文件大小超过 10MB")
	}
	stream, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	data, err := io.ReadAll(io.LimitReader(stream, 10*1024*1024+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 10*1024*1024 {
		return nil, fault.Field("file", "文件大小超过 10MB")
	}
	var articleID *int64
	v := r.HTTP.MultipartForm.Value["articleId"]
	if len(v) > 1 {
		return nil, fault.Field("articleId", "重复字段")
	}
	if len(v) == 1 && v[0] != "" {
		id, err := strconv.ParseInt(v[0], 10, 64)
		if err != nil {
			return nil, fault.Field("articleId", "articleId须为整数")
		}
		articleID = &id
	}
	ext := filepath.Ext(f.Filename)
	if ext == "" {
		ext = ".bin"
	}
	return s.Create(r.Context(), r.Actor.ID, articleID, data, ext, mime)
}
