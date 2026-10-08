// Package attachment 管理附件元数据和共享对象生命周期。
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

// Service 协调元数据与对象存储，共享对象按内容 key 在本进程串行修改。
type Service struct {
	DB        *gorm.DB
	Providers map[string]storage.Provider
	Driver    string
	Now       func() time.Time
	locks     [64]sync.Mutex
}

// New 装配存储提供者和文件元数据服务。
func New(db *gorm.DB, driver string, p map[string]storage.Provider) *Service {
	return &Service{
		DB:        db,
		Driver:    driver,
		Providers: p,
		Now:       time.Now,
	}
}
func (s *Service) lock(key string) *sync.Mutex {
	h := sha256.Sum256([]byte(key))
	return &s.locks[int(h[0])%len(s.locks)]
}

// View 只输出契约中的附件字段，隐藏内部 provider 选择细节。
func View(a model.Attachment) map[string]any {
	return map[string]any{
		"id":        a.ID,
		"userId":    a.UserID,
		"articleId": a.ArticleID,
		"url":       a.URL,
		"storage":   a.Storage,
		"mimeType":  a.MimeType,
		"size":      a.Size,
		"createdAt": values.ISO(a.CreatedAt),
	}
}

// Create 保存内容对象和元数据；数据库失败时仅补偿没有其他引用的对象。
func (s *Service) Create(ctx context.Context, user int64, articleID *int64, data []byte, ext, mime string) (any, error) {
	if articleID != nil {
		if _, err := article.Get(s.DB.WithContext(ctx), fmt.Sprint(*articleID)); err != nil {
			return nil, err
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
	if err := provider.Put(ctx, key, data, mime); err != nil {
		return nil, err
	}
	a := model.Attachment{
		UserID:     user,
		ArticleID:  articleID,
		StorageKey: key,
		URL:        "/files/" + key,
		Storage:    s.Driver,
		MimeType:   mime,
		Size:       int64(len(data)),
		CreatedAt:  s.Now().UnixMilli(),
	}
	if err := s.DB.WithContext(ctx).
		Create(&a).Error; err != nil { // Conservative compensation: never remove an object referenced by another row.
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		var n int64
		if countErr := s.DB.WithContext(cleanupCtx).
			Model(&model.Attachment{}).
			Where("storage_key = ? AND storage = ?", key, s.Driver).
			Count(&n).Error; countErr == nil && n == 0 {
			if cleanupErr := provider.Delete(cleanupCtx, key); cleanupErr != nil {
				slog.Warn("orphan upload cleanup required", "key", key, "storage", s.Driver)
			}
		} else if countErr != nil {
			slog.Warn("upload compensation inspection failed", "key", key, "storage", s.Driver)
		}
		return nil, err
	}
	return View(a), nil
}

// Page 分页返回当前会员的附件元数据。
func (s *Service) Page(ctx context.Context, user int64, q url.Values) (any, error) {
	p := values.Paging(q)
	db := s.DB.WithContext(ctx).Model(&model.Attachment{}).Where("user_id = ?", user)
	var n int64
	if err := db.Session(&gorm.Session{}).Count(&n).Error; err != nil {
		return nil, err
	}
	var rows []model.Attachment
	if err := db.Order("created_at DESC, id DESC").Limit(p.Size).Offset(p.Offset()).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, a := range rows {
		out = append(out, View(a))
	}
	return p.Result(out, n), nil
}

// Delete 检查权限并移除元数据，最后一个引用消失后才删除对象。
func (s *Service) Delete(ctx context.Context, id int64, actor values.Actor) error {
	db := s.DB.WithContext(ctx)
	var a model.Attachment
	if err := db.First(&a, id).Error; err != nil {
		return err
	}
	if !actor.Allows("editor", a.UserID) {
		return fault.New(fault.Forbidden)
	}
	lock := s.lock(a.StorageKey)
	lock.Lock()
	defer lock.Unlock()
	var refs int64
	txErr := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&a, id).Error; err != nil {
			return err
		}
		if err := tx.Delete(&a).Error; err != nil {
			return err
		}
		return tx.Model(&model.Attachment{}).
			Where("storage_key = ? AND storage = ?", a.StorageKey, a.Storage).
			Count(&refs).Error
	})
	if txErr != nil {
		return txErr
	}
	if refs == 0 {
		if p := s.Providers[a.Storage]; p != nil {
			if err := p.Delete(ctx, a.StorageKey); err != nil {
				slog.Warn("object cleanup required", "key", a.StorageKey, "storage", a.Storage)
			}
		}
	}
	return nil
}

// Read 按元数据中的存储驱动读取文件，支持迁移期间多存储来源。
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
	b, err := p.Get(ctx, key)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, fault.New(fault.NotFound)
	}
	return b, nil
}
