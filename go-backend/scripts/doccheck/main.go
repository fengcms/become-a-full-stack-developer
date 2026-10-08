// Package main 检查包说明的唯一性和中文口径，不判断注释的业务语义。
package main

import (
	"fmt"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

type packageDocs struct {
	files []string
}

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	problems, err := check(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	for _, problem := range problems {
		fmt.Fprintf(os.Stderr, "%s\n", problem)
	}
	if len(problems) > 0 {
		os.Exit(1)
	}
	fmt.Printf("包说明检查通过：每包一份说明，说明包含中文。\n")
}

// check 按目录和包名分组，忽略测试文件、隐藏目录及 vendor，保留命令夹具。
func check(root string) ([]string, error) {
	packages := make(map[string]*packageDocs)
	var problems []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != root && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "vendor") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ParseComments)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		key := filepath.ToSlash(filepath.Dir(relative)) + ":" + file.Name.Name
		if packages[key] == nil {
			packages[key] = &packageDocs{}
		}
		if file.Doc == nil {
			return nil
		}
		packages[key].files = append(packages[key].files, filepath.ToSlash(relative))
		if !strings.ContainsFunc(file.Doc.Text(), func(r rune) bool { return unicode.Is(unicode.Han, r) }) {
			problems = append(problems, relative+": 包说明缺少中文")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for key, docs := range packages {
		if len(docs.files) != 1 {
			problems = append(problems, fmt.Sprintf("%s: 包说明应为一份，实际 %d 份 %v", key, len(docs.files), docs.files))
		}
	}
	sort.Strings(problems)
	return problems, nil
}
