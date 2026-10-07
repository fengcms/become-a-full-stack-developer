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

type Provider interface {
	Put(context.Context, string, []byte, string) error
	Get(context.Context, string) ([]byte, error)
	Delete(context.Context, string) error
}

var SafeKey = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type Local struct{ Root string }

func (l Local) path(key string) (string, error) {
	if !SafeKey.MatchString(key) || key == "." || key == ".." {
		return "", fmt.Errorf("invalid storage key")
	}
	return filepath.Join(l.Root, key), nil
}
func (l Local) Put(ctx context.Context, key string, data []byte, mime string) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	p, e := l.path(key)
	if e != nil {
		return e
	}
	if e = os.MkdirAll(l.Root, 0750); e != nil {
		return e
	}
	f, e := os.CreateTemp(l.Root, ".upload-")
	if e != nil {
		return e
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, e = f.Write(data); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(temp, p)
}
func (l Local) Get(ctx context.Context, key string) ([]byte, error) {
	if e := ctx.Err(); e != nil {
		return nil, e
	}
	p, e := l.path(key)
	if e != nil {
		return nil, e
	}
	b, e := os.ReadFile(p)
	if errors.Is(e, os.ErrNotExist) {
		return nil, nil
	}
	return b, e
}
func (l Local) Delete(ctx context.Context, key string) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	p, e := l.path(key)
	if e != nil {
		return e
	}
	e = os.Remove(p)
	if errors.Is(e, os.ErrNotExist) {
		return nil
	}
	return e
}
