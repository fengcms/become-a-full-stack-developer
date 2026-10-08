// check_go_ast.go —— 代码工艺审阅用的 Go AST 量化探针（仅标准库，不侵入被审工程）。
//
// 用法（在任意目录执行）：
//   go run /abs/path/check_go_ast.go /abs/path/to/go-backend [--with-tests]
//
// 它用 go/parser + go/ast 真语法树统计：
//   - 每个函数/方法/闭包的声明行数与控制流嵌套深度
//   - >80 行函数、最大函数、Top N
//   - 形参个数 > 5 的函数（可读性）
//   - 中文注释行数、英文注释行数、分文件注释覆盖
//   - 导出符号缺文档注释的数量
//   - 标识符 e / err 的使用次数（命名是否遵循 Go 惯例）
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

type Func struct {
	File   string
	Name   string
	Recv   string
	Start  int
	End    int
	Lines  int
	Depth  int
	Params int
}

var (
	funcs      []Func
	fileStats  = map[string][3]int{} // 文件 -> [总行, 中文注释行, 英文/其他注释行]
	docMissing []string
	docMissingMethods int
	identE     int
	identErr   int
	closLong   []Func
)

func isCJK(r rune) bool { return unicode.Is(unicode.Han, r) }

func hasCJK(s string) bool {
	for _, r := range s {
		if isCJK(r) {
			return true
		}
	}
	return false
}

func maxOf(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// depthOf 只数「控制流分支块」的嵌套，不数花括号/字面量深度。
func depthOf(body *ast.BlockStmt) int {
	var walkStmt func(s ast.Stmt, d int) int
	var walkList func(list []ast.Stmt, d int) int
	walkList = func(list []ast.Stmt, d int) int {
		m := d
		for _, s := range list {
			m = maxOf(m, walkStmt(s, d))
		}
		return m
	}
	walkStmt = func(s ast.Stmt, d int) int {
		switch n := s.(type) {
		case *ast.IfStmt:
			m := walkList(n.Body.List, d+1)
			if n.Else != nil {
				m = maxOf(m, walkStmt(n.Else, d+1))
			}
			return m
		case *ast.ForStmt:
			return walkList(n.Body.List, d+1)
		case *ast.RangeStmt:
			return walkList(n.Body.List, d+1)
		case *ast.SwitchStmt:
			return walkList(n.Body.List, d+1)
		case *ast.TypeSwitchStmt:
			return walkList(n.Body.List, d+1)
		case *ast.SelectStmt:
			return walkList(n.Body.List, d+1)
		case *ast.BlockStmt:
			return walkList(n.List, d)
		case *ast.LabeledStmt:
			return walkStmt(n.Stmt, d)
		case *ast.GoStmt:
			if f, ok := n.Call.Fun.(*ast.FuncLit); ok {
				return walkList(f.Body.List, d+1)
			}
		}
		return d
	}
	if body == nil {
		return 0
	}
	return walkList(body.List, 0)
}

func params(n *ast.FieldList) int {
	if n == nil {
		return 0
	}
	c := 0
	for _, f := range n.List {
		if len(f.Names) == 0 {
			c++
		} else {
			c += len(f.Names)
		}
	}
	return c
}

func recvName(n *ast.FuncDecl) string {
	if n.Recv == nil || len(n.Recv.List) == 0 {
		return ""
	}
	switch t := n.Recv.List[0].Type.(type) {
	case *ast.StarExpr:
		if id, ok := t.X.(*ast.Ident); ok {
			return "*" + id.Name
		}
	case *ast.Ident:
		return t.Name
	}
	return "?"
}

func inspectFile(fset *token.FileSet, path string, rel string) {
	src, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read:", err)
		return
	}
	total := strings.Count(string(src), "\n") + 1
	zh, en := 0, 0
	// 注释行统计（按注释组）
	for _, g := range regexComments(string(src)) {
		if hasCJK(g) {
			zh++
		} else {
			en++
		}
	}
	fileStats[rel] = [3]int{total, zh, en}

	f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
	if err != nil {
		fmt.Fprintln(os.Stderr, "parse:", rel, err)
		return
	}

	// 导出符号缺文档（顶层函数/类型与方法分开统计：方法如 TableName 自解释，不应等同看待）
	for _, d := range f.Decls {
		switch n := d.(type) {
		case *ast.FuncDecl:
			if n.Doc == nil && ast.IsExported(n.Name.Name) {
				if n.Recv == nil {
					docMissing = append(docMissing, rel+":"+n.Name.Name)
				} else {
					docMissingMethods++
				}
			}
		case *ast.GenDecl:
			if n.Doc == nil {
				for _, s := range n.Specs {
					switch sp := s.(type) {
					case *ast.TypeSpec:
						if ast.IsExported(sp.Name.Name) {
							docMissing = append(docMissing, rel+":"+sp.Name.Name+"(type)")
						}
					}
				}
			}
		}
	}

	// 标识符 e / err
	ast.Inspect(f, func(n ast.Node) bool {
		if id, ok := n.(*ast.Ident); ok {
			switch id.Name {
			case "e":
				identE++
			case "err":
				identErr++
			}
		}
		return true
	})

	for _, d := range f.Decls {
		fn, ok := d.(*ast.FuncDecl)
		if !ok {
			continue
		}
		start := fset.Position(fn.Pos()).Line
		end := fset.Position(fn.End()).Line
		funcs = append(funcs, Func{
			File: rel, Name: fn.Name.Name, Recv: recvName(fn),
			Start: start, End: end, Lines: end - start + 1,
			Depth: depthOf(fn.Body), Params: params(fn.Type.Params),
		})
		// 函数体内的匿名闭包（长闭包是面条来源）
		if fn.Body != nil {
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				fl, ok := n.(*ast.FuncLit)
				if !ok || fl.Body == nil {
					return true
				}
				s := fset.Position(fl.Pos()).Line
				en2 := fset.Position(fl.End()).Line
				if en2-s+1 > 40 {
					closLong = append(closLong, Func{File: rel, Name: "(闭包 in " + fn.Name.Name + ")",
						Start: s, End: en2, Lines: en2 - s + 1, Depth: depthOf(fl.Body)})
				}
				return true
			})
		}
	}
}

// regexComments 粗切注释文本（仅用于中英文注释行统计，不参与函数长度计算）。
func regexComments(src string) []string {
	var out []string
	lines := strings.Split(src, "\n")
	inBlock := false
	var buf strings.Builder
	for _, ln := range lines {
		t := strings.TrimSpace(ln)
		if inBlock {
			buf.WriteString(t)
			if strings.Contains(t, "*/") {
				inBlock = false
				out = append(out, buf.String())
				buf.Reset()
			}
			continue
		}
		if strings.HasPrefix(t, "//") {
			out = append(out, t)
			continue
		}
		if i := strings.Index(t, "/*"); i >= 0 {
			j := strings.Index(t[i:], "*/")
			if j >= 0 {
				out = append(out, t[i:i+j+2])
			} else {
				inBlock = true
				buf.WriteString(t[i:])
			}
		}
	}
	return out
}

func (f Func) label() string {
	if f.Recv != "" {
		return fmt.Sprintf("%s.%s", f.Recv, f.Name)
	}
	return f.Name
}

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	withTests := false
	for _, a := range os.Args[2:] {
		if a == "--with-tests" {
			withTests = true
		}
	}
	fset := token.NewFileSet()
	var files []string
	filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if strings.HasSuffix(p, "/bin") || strings.Contains(p, "/.git") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(p, ".go") {
			return nil
		}
		if !withTests && strings.HasSuffix(p, "_test.go") {
			return nil
		}
		files = append(files, p)
		return nil
	})
	sort.Strings(files)
	for _, p := range files {
		rel, _ := filepath.Rel(root, p)
		inspectFile(fset, p, rel)
	}

	totalLines, totalZh, totalEn := 0, 0, 0
	for _, v := range fileStats {
		totalLines += v[0]
		totalZh += v[1]
		totalEn += v[2]
	}
	sort.Slice(funcs, func(i, j int) bool { return funcs[i].Lines > funcs[j].Lines })

	over80, over120 := 0, 0
	maxDepth, maxParams := 0, 0
	for _, f := range funcs {
		if f.Lines > 80 {
			over80++
		}
		if f.Lines > 120 {
			over120++
		}
		maxDepth = maxOf(maxDepth, f.Depth)
		maxParams = maxOf(maxParams, f.Params)
	}

	fmt.Println("======================================================================")
	fmt.Printf("Go 代码工艺 AST 量化　根目录=%s　含测试=%v\n", root, withTests)
	fmt.Println("======================================================================")
	fmt.Printf("文件 %d 个／物理行 %d／函数与方法 %d 个\n", len(fileStats), totalLines, len(funcs))
	fmt.Printf("注释组：中文 %d ／ 非中文 %d\n", totalZh, totalEn)
	fmt.Printf(">80 行 %d 个／>120 行 %d 个／最大函数 %d 行／最大控制流嵌套 %d 层\n",
		over80, over120, funcs[0].Lines, maxDepth)
	fmt.Println()
	fmt.Println("--- Top 25 最长函数（含方法）---")
	n := 25
	if len(funcs) < n {
		n = len(funcs)
	}
	for _, f := range funcs[:n] {
		fmt.Printf("  %4d 行  深度%-2d 形参%-2d  %s:%d  %s\n",
			f.Lines, f.Depth, f.Params, f.File, f.Start, f.label())
	}
	fmt.Println()
	fmt.Println("--- >80 行函数清单 ---")
	if over80 == 0 {
		fmt.Println("  （无）")
	}
	for _, f := range funcs {
		if f.Lines > 80 {
			fmt.Printf("  %4d 行  深度%-2d  %s:%d  %s\n", f.Lines, f.Depth, f.File, f.Start, f.label())
		}
	}
	fmt.Println()
	fmt.Println("--- 形参 >5 个的函数（可读性）---")
	any := false
	for _, f := range funcs {
		if f.Params > 5 {
			any = true
			fmt.Printf("  形参%-2d  %s:%d  %s\n", f.Params, f.File, f.Start, f.label())
		}
	}
	if !any {
		fmt.Println("  （无）")
	}
	fmt.Println()
	fmt.Println("--- 长匿名闭包（>40 行）---")
	if len(closLong) == 0 {
		fmt.Println("  （无）")
	}
	sort.Slice(closLong, func(i, j int) bool { return closLong[i].Lines > closLong[j].Lines })
	for _, f := range closLong {
		fmt.Printf("  %4d 行  深度%-2d  %s:%d  %s\n", f.Lines, f.Depth, f.File, f.Start, f.Name)
	}
	fmt.Println()
	fmt.Printf("--- 标识符命名：`e` 出现 %d 次 ／ `err` 出现 %d 次 ---\n", identE, identErr)
	fmt.Println()
	fmt.Printf("--- 导出符号缺文档注释：顶层 %d 个 ／ 方法 %d 个 ---\n", len(docMissing), docMissingMethods)
	if len(docMissing) == 0 {
		fmt.Println("  （顶层导出均已有文档注释）")
	}
	for _, d := range docMissing {
		fmt.Println("  " + d)
	}
	fmt.Println()
	fmt.Println("--- 分文件注释覆盖（行数／中文注释／非中文注释）---")
	type kv struct {
		k string
		v [3]int
	}
	var arr []kv
	for k, v := range fileStats {
		arr = append(arr, kv{k, v})
	}
	sort.Slice(arr, func(i, j int) bool { return arr[i].v[0] > arr[j].v[0] })
	for _, e := range arr {
		fmt.Printf("  %4d 行  中%2d 非中%2d  %s\n", e.v[0], e.v[1], e.v[2], e.k)
	}
}
