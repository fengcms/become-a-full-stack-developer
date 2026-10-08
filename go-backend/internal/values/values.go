// Package values 提供经过校验的部分输入及共享传输值。
package values

import (
	"encoding/json"
	"net/url"
	"strconv"
	"time"
)

// Fields 保留请求字段存在性，避免把未提交、NULL 和零值混为一谈。
type Fields map[string]any

// Has 检查字段是否提交；值为 NULL 仍视为已提交。
func (f Fields) Has(k string) bool { _, ok := f[k]; return ok }

// String 读取已校验的字符串字段，缺失时返回空字符串。
func (f Fields) String(k string) string { s, _ := f[k].(string); return s }

// Int 统一读取 JSON 数值和领域调用的整数表示。
func (f Fields) Int(k string) int64 {
	switch n := f[k].(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}

// Bool 读取已校验的布尔值，缺失时返回 false。
func (f Fields) Bool(k string) bool { b, _ := f[k].(bool); return b }

// Text 读取已校验的字符串字段；字段缺失或值为 NULL 时返回 nil。
func (f Fields) Text(k string) *string {
	if f[k] == nil {
		return nil
	}
	s := f.String(k)
	return &s
}

// Number 将数值转换为可空整数指针。
func (f Fields) Number(k string) *int64 {
	if f[k] == nil {
		return nil
	}
	n := f.Int(k)
	return &n
}

// Strings 读取字符串数组，空结果仍保持数组语义。
func (f Fields) Strings(k string) []string {
	r := []string{}
	if a, ok := f[k].([]string); ok {
		return append(r, a...)
	}
	if a, ok := f[k].([]any); ok {
		for _, v := range a {
			if s, ok := v.(string); ok {
				r = append(r, s)
			}
		}
	}
	return r
}

// Text 返回字符串的非 nil 指针；空字符串也保留为指向空串的指针。
func Text(s string) *string { return &s }

// ISO 把数据库毫秒时间转换为契约要求的 UTC 毫秒时间字符串。
func ISO(ms int64) string { return time.UnixMilli(ms).UTC().Format("2006-01-02T15:04:05.000Z") }

// Date 转换可空时间，nil 保持 JSON NULL。
func Date(ms *int64) any {
	if ms == nil {
		return nil
	}
	return ISO(*ms)
}

// Name 优先使用显示名，缺失时使用用户名。
func Name(n *string, fallback string) string {
	if n != nil {
		return *n
	}
	return fallback
}

// Actor 表示认证主体的 ID 与角色，不包含密码和会话数据。
type Actor struct {
	ID   int64
	Role string
}

var roleRanks = map[string]int{"member": 1, "editor": 2, "admin": 3}

// Rank 返回固定角色等级，未知角色没有权限等级。
func (a Actor) Rank() int { return roleRanks[a.Role] }

// Allows 判断最低角色或本人例外，只用于允许所有者访问的领域动作。
func (a Actor) Allows(role string, owner int64) bool {
	return a.Rank() >= roleRanks[role] || (a.ID > 0 && a.ID == owner)
}

// Page 保存通用分页结果，空集合的总页数仍为 1。
type Page struct {
	Page  int   `json:"page"`
	Size  int   `json:"pageSize"`
	Total int64 `json:"total"`
	Pages int64 `json:"totalPages"`
}

// Paging 使用通用默认20和上限100解析分页；专用端点调用 PagingWith。
func Paging(q url.Values) Page { return PagingWith(q, 20, 100) }

// PagingWith 使用端点指定的默认分页大小和上限，保留冻结契约的差异。
func PagingWith(q url.Values, defaultSize, maxSize int) Page {
	p, _ := strconv.Atoi(q.Get("page"))
	s, _ := strconv.Atoi(q.Get("pageSize"))
	if p < 1 {
		p = 1
	}
	if s == 0 {
		s = defaultSize
	}
	if s < 1 {
		s = 1
	}
	if s > maxSize {
		s = maxSize
	}
	return Page{Page: p, Size: s}
}

// Offset 计算已规范化页码对应的行偏移。
func (p Page) Offset() int { return (p.Page - 1) * p.Size }

// Result 组合列表与分页元数据，统一处理空集合。
func (p Page) Result(list any, total int64) map[string]any {
	p.Total = total
	p.Pages = (total + int64(p.Size) - 1) / int64(p.Size)
	if p.Pages < 1 {
		p.Pages = 1
	}
	return map[string]any{"list": list, "pagination": p}
}
