package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentationDefects(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		want  int
	}{
		{"中文说明及实现重复不误报", map[string]string{
			"doc.go":            "// Package example 提供存储接口。\npackage example\n",
			"implementation.go": "package example\n// Provider 定义存储。\ntype Provider interface {\n// Put 写入对象。\nPut()\n}\ntype Local struct{}\n// Put 写入对象。\nfunc (Local) Put() {}\n",
			"external_test.go":  "// English test documentation.\npackage example_test\n",
		}, 0},
		{"重复包说明", map[string]string{
			"doc.go":   "// Package example 中文。\npackage example\n",
			"other.go": "// Package example 中文。\npackage example\n",
		}, 1},
		{"英文包说明", map[string]string{"doc.go": "// Package example stores bytes.\npackage example\n"}, 1},
		{"缺少包说明", map[string]string{"main.go": "package example\n"}, 1},
		{"同名不同目录独立计数", map[string]string{
			"one/doc.go": "// Package example 中文。\npackage example\n",
			"two/doc.go": "// Package example 中文。\npackage example\n",
		}, 0},
		{"非包注释不计数", map[string]string{"main.go": "// 中文版权。\n\npackage example\n"}, 1},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			for name, source := range item.files {
				path := filepath.Join(root, name)
				if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
			}
			problems, err := check(root)
			if err != nil {
				t.Fatal(err)
			}
			if len(problems) != item.want {
				t.Fatalf("problems=%v, want count=%d", problems, item.want)
			}
		})
	}
}
