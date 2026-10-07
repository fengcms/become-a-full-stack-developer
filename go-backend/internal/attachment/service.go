// Package attachment owns upload metadata and shared object lifecycles.
package attachment

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/article"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/storage"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"gorm.io/gorm"
)

type Service struct {
	DB        *gorm.DB
	Providers map[string]storage.Provider
	Driver    string
	Now       func() time.Time
	locks     [64]sync.Mutex
}

func New(db *gorm.DB, driver string, p map[string]storage.Provider) *Service {
	return &Service{DB: db, Driver: driver, Providers: p, Now: time.Now}
}
func (s *Service) lock(key string) *sync.Mutex {
	h := sha256.Sum256([]byte(key))
	return &s.locks[int(h[0])%len(s.locks)]
}
func View(a model.Attachment) map[string]any {
	return map[string]any{"id": a.ID, "userId": a.UserID, "articleId": a.ArticleID, "url": a.URL, "storage": a.Storage, "mimeType": a.MimeType, "size": a.Size, "createdAt": values.ISO(a.CreatedAt)}
}
func (s *Service) Create(ctx context.Context, user int64, articleID *int64, data []byte, ext, mime string) (any, error) {
	if articleID != nil {
		if _, e := article.Get(s.DB.WithContext(ctx), fmt.Sprint(*articleID)); e != nil {
			return nil, e
		}
	}
	hash := sha256.Sum256(data)
	key := fmt.Sprintf("%x%s", hash, ext)
	if !storage.SafeKey.MatchString(key) {
		return nil, fault.Field("file", "文件扩展名不合法")
	}
	lock := s.lock(key)
	lock.Lock()
	defer lock.Unlock()
	provider := s.Providers[s.Driver]
	if provider == nil {
		return nil, fault.New(fault.Internal)
	}
	if e := provider.Put(ctx, key, data, mime); e != nil {
		return nil, e
	}
	a := model.Attachment{UserID: user, ArticleID: articleID, StorageKey: key, URL: "/files/" + key, Storage: s.Driver, MimeType: mime, Size: int64(len(data)), CreatedAt: s.Now().UnixMilli()}
	if e := s.DB.WithContext(ctx).Create(&a).Error; e != nil { // Conservative compensation: never remove an object referenced by another row.
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		var n int64
		if countErr := s.DB.WithContext(cleanupCtx).Model(&model.Attachment{}).Where("storage_key = ? AND storage = ?", key, s.Driver).Count(&n).Error; countErr == nil && n == 0 {
			if cleanupErr := provider.Delete(cleanupCtx, key); cleanupErr != nil {
				slog.Warn("orphan upload cleanup required", "key", key, "storage", s.Driver)
			}
		} else if countErr != nil {
			slog.Warn("upload compensation inspection failed", "key", key, "storage", s.Driver)
		}
		return nil, e
	}
	return View(a), nil
}
func (s *Service) Page(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx).Model(&model.Attachment{}).Where("user_id = ?", user)
	var n int64
	if e := db.Session(&gorm.Session{}).Count(&n).Error; e != nil {
		return nil, e
	}
	var rows []model.Attachment
	if e := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; e != nil {
		return nil, e
	}
	out := []map[string]any{}
	for _, a := range rows {
		out = append(out, View(a))
	}
	return p.Result(out, n), nil
}
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	db := s.DB.WithContext(ctx)
	var a model.Attachment
	if e := db.First(&a, id).Error; e != nil {
		return e
	}
	if !actor.Allows("editor", a.UserID) {
		return fault.New(fault.Forbidden)
	}
	lock := s.lock(a.StorageKey)
	lock.Lock()
	defer lock.Unlock()
	var refs int64
	e := db.Transaction(func(tx *gorm.DB) error {
		if e := tx.First(&a, id).Error; e != nil {
			return e
		}
		if e := tx.Delete(&a).Error; e != nil {
			return e
		}
		return tx.Model(&model.Attachment{}).Where("storage_key = ? AND storage = ?", a.StorageKey, a.Storage).Count(&refs).Error
	})
	if e != nil {
		return e
	}
	if refs == 0 {
		if p := s.Providers[a.Storage]; p != nil {
			if e := p.Delete(ctx, a.StorageKey); e != nil {
				slog.Warn("object cleanup required", "key", a.StorageKey, "storage", a.Storage)
			}
		}
	}
	return nil
}
func (s *Service) Read(ctx context.Context, key string) ([]byte, error) {
	if !storage.SafeKey.MatchString(key) || key == "." || key == ".." {
		return nil, fault.New(fault.NotFound)
	}
	driver := s.Driver
	var a model.Attachment
	r := s.DB.WithContext(ctx).Where("storage_key = ?", key).Order("id ASC").Limit(1).Find(&a)
	if r.Error != nil {
		return nil, r.Error
	}
	if a.ID > 0 {
		driver = a.Storage
	}
	p := s.Providers[driver]
	if p == nil {
		return nil, fault.New(fault.Internal)
	}
	b, e := p.Get(ctx, key)
	if e != nil {
		return nil, e
	}
	if b == nil {
		return nil, fault.New(fault.NotFound)
	}
	return b, nil
}
