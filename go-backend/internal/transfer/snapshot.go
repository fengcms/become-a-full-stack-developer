// Package transfer 提供离线版本化数据格式，不修改源数据库。
// 快照不复制有效刷新会话和阅读去重记录。
package transfer

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"gorm.io/gorm"
)

// Snapshot 离线版本化业务快照，不包含有效会话和对象内容。
type Snapshot struct {
	Version   int                         `json:"version"`
	Source    string                      `json:"source"`
	CreatedAt string                      `json:"createdAt"`
	Tables    map[string][]map[string]any `json:"tables"`
}
type table struct {
	name string
	row  any
}

var tables = []table{
	{"users", model.User{}}, {"categories", model.Category{}}, {"tags", model.Tag{}},
	{"wechat_identities", model.WechatIdentity{}}, {"articles", model.Article{}},
	{"article_tags", model.ArticleTag{}}, {"comments", model.Comment{}},
	{"attachments", model.Attachment{}}, {"favorites", model.Favorite{}},
	{"view_history", model.History{}}, {"likes", model.Like{}},
	{"notifications", model.Notification{}}, {"site_settings", model.SiteSetting{}},
}

// Export 在只读一致性事务内导出白名单业务表，源数据库不被修改。
func Export(ctx context.Context, db *gorm.DB, source string) (*Snapshot, error) {
	out := &Snapshot{
		Version:   1,
		Source:    source,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Tables:    map[string][]map[string]any{},
	}
	txErr := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range tables {
			var rows []map[string]any
			if err := tx.Table(table.name).Order("id ASC").Find(&rows).Error; err != nil {
				return fmt.Errorf("export %s: %w", table.name, err)
			}
			if rows == nil {
				rows = []map[string]any{}
			}
			for _, row := range rows {
				for k, v := range row {
					if b, ok := v.([]byte); ok {
						row[k] = string(b)
					}
				}
			}
			out.Tables[table.name] = rows
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return out, txErr
}

func integer(v any) (int64, error) {
	switch n := v.(type) {
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case json.Number:
		return strconv.ParseInt(string(n), 10, 64)
	case float64:
		if n == float64(int64(n)) {
			return int64(n), nil
		}
	}
	rv := reflect.ValueOf(v)
	if rv.IsValid() {
		switch rv.Kind() {
		case reflect.Int8, reflect.Int16, reflect.Int32:
			return rv.Int(), nil
		case reflect.Uint8, reflect.Uint16, reflect.Uint32:
			return int64(rv.Uint()), nil
		}
	}
	return 0, fmt.Errorf("not integer")
}
func parentsFirst(rows []map[string]any) ([]map[string]any, error) {
	pending := append([]map[string]any(nil), rows...)
	out := []map[string]any{}
	done := map[int64]bool{}
	for len(pending) > 0 {
		next := []map[string]any{}
		for _, row := range pending {
			parent := row["parent_id"]
			pid, _ := integer(parent)
			if parent == nil || done[pid] {
				id, _ := integer(row["id"])
				done[id] = true
				out = append(out, row)
			} else {
				next = append(next, row)
			}
		}
		if len(next) == len(pending) {
			return nil, fmt.Errorf("missing parent or cyclic relationship")
		}
		pending = next
	}
	return out, nil
}

func tableNames() []string {
	out := []string{}
	for _, table := range tables {
		out = append(out, table.name)
	}
	return out
}

// Counts 返回每个保留业务表的行数，输出核查证据而不打印敏感字段。
func (s *Snapshot) Counts() map[string]int {
	out := map[string]int{}
	for k, v := range s.Tables {
		out[k] = len(v)
	}
	return out
}

// CanonicalJSON 按 ID 排序业务行，便于逐表核对源和目标，不包含快照元数据。
func (s *Snapshot) CanonicalJSON() ([]byte, error) {
	for _, rows := range s.Tables {
		sort.Slice(rows, func(i, j int) bool { a, _ := integer(rows[i]["id"]); b, _ := integer(rows[j]["id"]); return a < b })
	}
	return json.Marshal(s.Tables)
}

func productValues(table string, row map[string]any) error {
	allowed := func(key string, values ...string) error {
		if row[key] == nil {
			return nil
		}
		for _, value := range values {
			if row[key] == value {
				return nil
			}
		}
		return fmt.Errorf("invalid enum %s.%s", table, key)
	}
	switch table {
	case "users":
		if err := allowed("role", "member", "editor", "admin"); err != nil {
			return err
		}
		return allowed("status", "active", "disabled")
	case "articles":
		if err := allowed("status", "draft", "pending", "published"); err != nil {
			return err
		}
		for _, key := range []string{"view_count", "like_count"} {
			if row[key] != nil {
				n, _ := integer(row[key])
				if n < 0 {
					return fmt.Errorf("negative counter articles.%s", key)
				}
			}
		}
	case "comments":
		return allowed("status", "approved", "rejected", "reviewing")
	case "attachments":
		return allowed("storage", "local", "r2")
	case "notifications":
		return allowed("type", "article_published", "comment_approved", "system")
	}
	return nil
}
