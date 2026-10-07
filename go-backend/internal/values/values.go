// Package values holds validated partial input and shared wire primitives.
package values

import (
	"encoding/json"
	"net/url"
	"strconv"
	"time"
)

type Fields map[string]any

func (f Fields) Has(k string) bool      { _, ok := f[k]; return ok }
func (f Fields) String(k string) string { s, _ := f[k].(string); return s }
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
func (f Fields) Bool(k string) bool { b, _ := f[k].(bool); return b }
func (f Fields) Text(k string) *string {
	if f[k] == nil {
		return nil
	}
	s := f.String(k)
	return &s
}
func (f Fields) Number(k string) *int64 {
	if f[k] == nil {
		return nil
	}
	n := f.Int(k)
	return &n
}
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
func Text(s string) *string { return &s }
func ISO(ms int64) string   { return time.UnixMilli(ms).UTC().Format("2006-01-02T15:04:05.000Z") }
func Date(ms *int64) any {
	if ms == nil {
		return nil
	}
	return ISO(*ms)
}
func Name(n *string, fallback string) string {
	if n != nil {
		return *n
	}
	return fallback
}

type Actor struct {
	ID   int64
	Role string
}

func (a Actor) Rank() int { return map[string]int{"member": 1, "editor": 2, "admin": 3}[a.Role] }
func (a Actor) Allows(role string, owner int64) bool {
	return a.Rank() >= map[string]int{"member": 1, "editor": 2, "admin": 3}[role] || (a.ID > 0 && a.ID == owner)
}

type Page struct {
	Page  int   `json:"page"`
	Size  int   `json:"pageSize"`
	Total int64 `json:"total"`
	Pages int64 `json:"totalPages"`
}

func Paging(q url.Values) Page {
	p, _ := strconv.Atoi(q.Get("page"))
	s, _ := strconv.Atoi(q.Get("pageSize"))
	if p < 1 {
		p = 1
	}
	if s == 0 {
		s = 20
	}
	if s < 1 {
		s = 1
	}
	if s > 100 {
		s = 100
	}
	return Page{Page: p, Size: s}
}
func (p Page) Offset() int { return (p.Page - 1) * p.Size }
func (p Page) Result(list any, total int64) map[string]any {
	p.Total = total
	p.Pages = (total + int64(p.Size) - 1) / int64(p.Size)
	if p.Pages < 1 {
		p.Pages = 1
	}
	return map[string]any{"list": list, "pagination": p}
}
