// check_go_quality.go —— Go 后端「代码工艺 + 教学可读性」门禁（仅标准库，不侵入被审工程）。
//
// 用法：
//   go run /abs/path/check_go_quality.go /abs/path/to/go-backend        # 验收
//   go run /abs/path/check_go_quality.go /abs/path/to/go-backend --selftest  # 注入缺陷验证断言会红
//
// 判据全部面向「初学者可读性」：注释语言与覆盖、导出符号文档、函数长度、控制流嵌套、
// 行长、重复字面量（软删除谓词 / 路径参数样板）、命名惯例（err vs e）、调试残留。
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type Metrics struct {
	Files, Lines, Functions int
	Over80                  int
	MaxFunc, MaxDepth       int
	MaxFuncName             string
	MaxDepthName            string
	ZhCommentLines          int
	CommentLines            int
	LinesOver120            int
	MaxLine                 int
	MaxLineWhere            string
	DeletedAtNull           int
	PathID                  int
	PkgsWithoutDoc          int
	TopLevelUndoc           int
	MethodUndoc             int
	ErrIdent                int
	EIdent                  int
	Residue                 int
	GofmtClean              bool
	MaxFileLines            int
	MaxFileName             string
}

var cjk = regexp.MustCompile(`[\p{Han}]`)

func hasCJK(s string) bool { return cjk.MatchString(s) }

// stripStrings 把字符串/字符字面量替换成空格，用于判「// 之后才是注释」。
func stripStrings(line string) string {
	out := []rune(line)
	inS, inD, inB := false, false, false
	for i := 0; i < len(out); i++ {
		c := out[i]
		switch {
		case inB:
			if c == '`' {
				inB = false
			}
			out[i] = ' '
		case inS:
			if c == '\\' {
				out[i] = ' '
				i++
				if i < len(out) {
					out[i] = ' '
				}
				continue
			}
			if c == '"' {
				inS = false
			}
			out[i] = ' '
		case inD:
			if c == '\\' {
				out[i] = ' '
				i++
				if i < len(out) {
					out[i] = ' '
				}
				continue
			}
			if c == '\'' {
				inD = false
			}
			out[i] = ' '
		default:
			switch c {
			case '"':
				inS = true
				out[i] = ' '
			case '\'':
				inD = true
				out[i] = ' '
			case '`':
				inB = true
				out[i] = ' '
			}
		}
	}
	return string(out)
}

func depth(body *ast.BlockStmt) int {
	var stmt func(ast.Stmt, int) int
	var list func([]ast.Stmt, int) int
	list = func(ls []ast.Stmt, d int) int {
		m := d
		for _, s := range ls {
			if r := stmt(s, d); r > m {
				m = r
			}
		}
		return m
	}
	stmt = func(s ast.Stmt, d int) int {
		switch n := s.(type) {
		case *ast.IfStmt:
			m := list(n.Body.List, d+1)
			if n.Else != nil {
				if r := stmt(n.Else, d+1); r > m {
					m = r
				}
			}
			return m
		case *ast.ForStmt:
			return list(n.Body.List, d+1)
		case *ast.RangeStmt:
			return list(n.Body.List, d+1)
		case *ast.SwitchStmt:
			return list(n.Body.List, d+1)
		case *ast.TypeSwitchStmt:
			return list(n.Body.List, d+1)
		case *ast.SelectStmt:
			return list(n.Body.List, d+1)
		case *ast.BlockStmt:
			return list(n.List, d)
		case *ast.LabeledStmt:
			return stmt(n.Stmt, d)
		}
		return d
	}
	if body == nil {
		return 0
	}
	return list(body.List, 0)
}

func analyze(root string, withTests bool) *Metrics {
	m := &Metrics{MaxLineWhere: "-", MaxFuncName: "-", MaxDepthName: "-", MaxFileName: "-"}
	fset := token.NewFileSet()
	pkgDoc := map[string]bool{}
	pkgSeen := map[string]bool{}
	var files []string
	filepath.Walk(root, func(p string, info os.FileInfo, e error) error {
		if e != nil {
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
	residue := 0
	for _, p := range files {
		rel, _ := filepath.Rel(root, p)
		src, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		text := string(src)
		m.Files++
		nl := strings.Count(text, "\n") + 1
		m.Lines += nl
		if nl > m.MaxFileLines {
			m.MaxFileLines, m.MaxFileName = nl, rel
		}
		// 行级扫描：注释语言、行长、重复字面量、调试残留
		for i, ln := range strings.Split(text, "\n") {
			L := len(strings.TrimRight(ln, "\r"))
			if L > m.MaxLine {
				m.MaxLine, m.MaxLineWhere = L, fmt.Sprintf("%s:%d", rel, i+1)
			}
			if L > 120 {
				m.LinesOver120++
			}
			stripped := stripStrings(ln)
			if idx := strings.Index(stripped, "//"); idx >= 0 {
				m.CommentLines++
				if hasCJK(stripped[idx:]) {
					m.ZhCommentLines++
				}
			}
			// 注意：软删除谓词与路径样板本身写在字符串/SQL 片段里，故按「原始行」计数。
			m.DeletedAtNull += strings.Count(ln, "deleted_at IS NULL")
			m.PathID += strings.Count(ln, "pathID(r,")
			for _, pat := range []string{"TODO", "FIXME", "HACK", "println("} {
				if strings.Contains(ln, pat) {
					residue++
				}
			}
		}
		// 包级文档
		dir := filepath.Dir(rel)
		pkgSeen[dir] = true
		lines := strings.Split(text, "\n")
		for _, ln := range lines {
			if strings.TrimSpace(ln) == "" {
				continue
			}
			if strings.HasPrefix(strings.TrimSpace(ln), "//") {
				pkgDoc[dir] = true
			}
			break
		}
		// 语法树
		f, err := parser.ParseFile(fset, p, src, parser.ParseComments)
		if err != nil {
			continue
		}
		ast.Inspect(f, func(n ast.Node) bool {
			if id, ok := n.(*ast.Ident); ok {
				switch id.Name {
				case "e":
					m.EIdent++
				case "err":
					m.ErrIdent++
				}
			}
			return true
		})
		for _, d := range f.Decls {
			fn, ok := d.(*ast.FuncDecl)
			if !ok {
				continue
			}
			m.Functions++
			s := fset.Position(fn.Pos()).Line
			e2 := fset.Position(fn.End()).Line
			ln := e2 - s + 1
			name := fn.Name.Name
			if fn.Recv != nil {
				name = "method " + name
			}
			if ln > 80 {
				m.Over80++
			}
			if ln > m.MaxFunc {
				m.MaxFunc, m.MaxFuncName = ln, fmt.Sprintf("%s:%s", rel, name)
			}
			if d := depth(fn.Body); d > m.MaxDepth {
				m.MaxDepth, m.MaxDepthName = d, fmt.Sprintf("%s:%s", rel, name)
			}
			if fn.Doc == nil && ast.IsExported(fn.Name.Name) {
				if fn.Recv == nil {
					m.TopLevelUndoc++
				} else {
					m.MethodUndoc++
				}
			}
		}
		for _, d := range f.Decls {
			if g, ok := d.(*ast.GenDecl); ok && g.Doc == nil {
				for _, sp := range g.Specs {
					if ts, ok := sp.(*ast.TypeSpec); ok && ast.IsExported(ts.Name.Name) {
						m.TopLevelUndoc++
					}
				}
			}
		}
	}
	for d := range pkgSeen {
		if !pkgDoc[d] {
			m.PkgsWithoutDoc++
		}
	}
	m.Residue = residue
	out, err := exec.Command("gofmt", "-l", filepath.Join(root, "cmd"), filepath.Join(root, "internal"), filepath.Join(root, "test")).Output()
	m.GofmtClean = err == nil && strings.TrimSpace(string(out)) == ""
	return m
}

type Result struct {
	Label, Actual string
	OK            bool
}

var results []Result

func check(label, actual string, ok bool) {
	results = append(results, Result{label, actual, ok})
}

func assertions(m *Metrics) []Result {
	results = nil
	check("中文注释行 ≥ 120（教学可读性）", fmt.Sprint(m.ZhCommentLines), m.ZhCommentLines >= 120)
	check("任意注释行 ≥ 200", fmt.Sprint(m.CommentLines), m.CommentLines >= 200)
	check("顶层导出符号缺文档注释 = 0", fmt.Sprint(m.TopLevelUndoc), m.TopLevelUndoc == 0)
	check("无包级文档注释的包 = 0", fmt.Sprint(m.PkgsWithoutDoc), m.PkgsWithoutDoc == 0)
	check(">80 行函数 = 0", fmt.Sprint(m.Over80), m.Over80 == 0)
	check("最大控制流嵌套 ≤ 4", fmt.Sprintf("%d (%s)", m.MaxDepth, m.MaxDepthName), m.MaxDepth <= 4)
	check(">120 字符的行 ≤ 20", fmt.Sprint(m.LinesOver120), m.LinesOver120 <= 20)
	check("单文件 ≤ 400 行", fmt.Sprintf("%d (%s)", m.MaxFileLines, m.MaxFileName), m.MaxFileLines <= 400)
	check("软删除谓词 `deleted_at IS NULL` 出现 ≤ 3（应收敛为 scope 助手）", fmt.Sprint(m.DeletedAtNull), m.DeletedAtNull <= 3)
	check("路径参数样板 `pathID(r,` 出现 ≤ 8（应抽辅助）", fmt.Sprint(m.PathID), m.PathID <= 8)
	check("错误变量命名以 `err` 为主（err ≥ 100 且 err ≥ e）", fmt.Sprintf("err=%d e=%d", m.ErrIdent, m.EIdent), m.ErrIdent >= 100 && m.ErrIdent >= m.EIdent)
	check("调试残留 (TODO/FIXME/HACK/println) = 0", fmt.Sprint(m.Residue), m.Residue == 0)
	check("gofmt -l 为空", fmt.Sprint(m.GofmtClean), m.GofmtClean)
	return results
}

func report(title string, m *Metrics, res []Result) int {
	fmt.Println(strings.Repeat("=", 86))
	fmt.Println(title)
	fmt.Println(strings.Repeat("=", 86))
	fmt.Printf("文件 %d／行 %d／函数 %d　　最大函数 %d (%s)　最大嵌套 %d (%s)\n",
		m.Files, m.Lines, m.Functions, m.MaxFunc, m.MaxFuncName, m.MaxDepth, m.MaxDepthName)
	fmt.Println(strings.Repeat("-", 86))
	fail := 0
	for _, r := range res {
		mark := "PASS"
		if !r.OK {
			mark = "FAIL"
			fail++
		}
		fmt.Printf("  %-4s %-52s 实际=%s\n", mark, r.Label, r.Actual)
	}
	fmt.Println(strings.Repeat("-", 86))
	fmt.Printf("结果：PASS=%d  FAIL=%d\n", len(res)-fail, fail)
	if fail > 0 {
		fmt.Println("门禁未通过。")
	}
	return fail
}

func write(dir, name, body string) string {
	p := filepath.Join(dir, name)
	os.MkdirAll(filepath.Dir(p), 0o755)
	os.WriteFile(p, []byte(body), 0o644)
	return p
}

// selftest 注入「越过阈值」的缺陷，验证每条断言真的会红。
func selftest() int {
	dir, err := os.MkdirTemp("", "goq-selftest-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)
	root := filepath.Join(dir, "root")
	os.MkdirAll(filepath.Join(root, "internal", "a"), 0o755)
	// ① >80 行函数 ② 5 层控制流嵌套 ③ 超长行 ④ 无中文注释 ⑤ 无包级文档 ⑥ 导出缺文档
	var body strings.Builder
	for i := 0; i < 5; i++ {
		body.WriteString(strings.Repeat("\t", i+1) + fmt.Sprintf("if x > %d {\n", i))
	}
	for i := 0; i < 5; i++ {
		body.WriteString(strings.Repeat("\t", 5-i) + "}\n")
	}
	write(root, "internal/a/a.go",
		"package a\n\n"+
			"func Exported(zz int) { \t_ = \""+strings.Repeat("x", 200)+"\"\n"+
			body.String()+
			strings.Repeat("\t_ = 0\n", 75)+
			"}\n"+
			"func b() {}\n")
	// ⑦ 重复字面量：软删除谓词与路径样板均越过阈值
	write(root, "internal/a/c.go",
		"package a\n\n"+
			"func g(db any) {\n"+
			strings.Repeat("\t_ = \"deleted_at IS NULL\"\n", 10)+
			strings.Repeat("\t_ = \"pathID(r, x)\"\n", 12)+
			"}\n")
	// ⑧ >120 字符的行超过 20 行
	var long strings.Builder
	long.WriteString("package a\n\n")
	for i := 0; i < 26; i++ {
		long.WriteString(fmt.Sprintf("var Long%d = \"%s\"\n", i, strings.Repeat("y", 130)))
	}
	write(root, "internal/a/long.go", long.String())
	// ⑨ 单文件 > 400 行
	var big strings.Builder
	big.WriteString("package a\n\n")
	for i := 0; i < 420; i++ {
		big.WriteString(fmt.Sprintf("var V%d = %d\n", i, i))
	}
	write(root, "internal/a/big.go", big.String())
	// ⑩ 调试残留 ⑪ 非 gofmt 格式
	write(root, "internal/a/residue.go", "package a\n\n// TODO fix\nfunc h() { println(1) }\n")
	write(root, "internal/a/bad.go", "package a\n\nfunc bad( ) {x:=1;_=x}\n")

	m := analyze(root, true)
	res := assertions(m)
	fmt.Println(strings.Repeat("=", 86))
	fmt.Println("自检：注入缺陷，逐条验证断言会红（夹具均越过阈值）")
	fmt.Println(strings.Repeat("=", 86))
	dead := 0
	for _, r := range res {
		if r.OK {
			dead++
			fmt.Printf("  %-4s %-52s 实际=%s\n", "未拦住", r.Label, r.Actual)
		} else {
			fmt.Printf("  %-4s %-52s 实际=%s\n", "拦住", r.Label, r.Actual)
		}
	}
	fmt.Println(strings.Repeat("-", 86))
	fmt.Printf("应红而未红：%d 条\n", dead)
	if dead > 0 {
		return 1
	}
	return 0
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--selftest" {
		os.Exit(selftest())
	}
	root := "."
	withTests := false
	for _, a := range os.Args[1:] {
		if a == "--with-tests" {
			withTests = true
		} else {
			root = a
		}
	}
	m := analyze(root, withTests)
	scope := "生产代码（不含 _test.go）"
	if withTests {
		scope = "含测试"
	}
	fail := report("Go 后端代码工艺门禁　根="+root+"　"+scope, m, assertions(m))
	if fail > 0 {
		os.Exit(1)
	}
}
