// Package storage contains byte-object adapters, independent of attachments.
package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

// Provider 定义对象的写、读、删能力，不感知用户和文章关系。
type Provider interface {
	Put(context.Context, string, []byte, string) error
	Get(context.Context, string) ([]byte, error)
	Delete(context.Context, string) error
}

// SafeKey 只允许安全对象键，阻止目录穿越和任意文件路径。
var SafeKey = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// Local 使用受限 key 和原子重命名保存本地对象。
type Local struct{ Root string }

func (l Local) path(key string) (string, error) {
	if !SafeKey.MatchString(key) || key == "." || key == ".." {
		return "", fmt.Errorf("invalid storage key")
	}
	return filepath.Join(l.Root, key), nil
}

// Put 写入指定 key 的对象，尊重请求取消和提供者超时。
func (l Local) Put(ctx context.Context, key string, data []byte, mime string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(l.Root, 0750); err != nil {
		return err
	}
	f, err := os.CreateTemp(l.Root, ".upload-")
	if err != nil {
		return err
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(temp, p)
}

// Get 读取指定 key 的对象，读完后关闭响应流。
func (l Local) Get(ctx context.Context, key string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p, err := l.path(key)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return b, err
}

// Delete 删除指定 key 的对象；共享引用判断由附件服务负责。
func (l Local) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := l.path(key)
	if err != nil {
		return err
	}
	err = os.Remove(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
