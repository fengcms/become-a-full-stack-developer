// Package transfer implements an offline, versioned data format. It never
// changes the source database and does not copy active sessions or view dedup.
package transfer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/model"
	"gorm.io/gorm"
)

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

func Export(ctx context.Context, db *gorm.DB, source string) (*Snapshot, error) {
	out := &Snapshot{Version: 1, Source: source, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Tables: map[string][]map[string]any{}}
	e := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range tables {
			var rows []map[string]any
			if e := tx.Table(table.name).Order("id ASC").Find(&rows).Error; e != nil {
				return fmt.Errorf("export %s: %w", table.name, e)
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
	return out, e
}

// Normalize enforces the fixed table/column allowlist and scalar types. IDs and
// timestamps are integer JSON numbers rather than lossy float64 conversions.
func (s *Snapshot) Normalize() error {
	if s.Version != 1 {
		return fmt.Errorf("unsupported snapshot version")
	}
	allowed := map[string]bool{}
	for _, table := range tables {
		allowed[table.name] = true
		rows, ok := s.Tables[table.name]
		if !ok {
			return fmt.Errorf("missing table %s", table.name)
		}
		columns := map[string]reflect.Type{}
		typ := reflect.TypeOf(table.row)
		for i := 0; i < typ.NumField(); i++ {
			f := typ.Field(i)
			col := strings.Split(strings.TrimPrefix(f.Tag.Get("gorm"), "column:"), ";")[0]
			columns[col] = f.Type
		}
		ids := map[int64]bool{}
		for _, row := range rows {
			for key, value := range row {
				typ, ok := columns[key]
				if !ok {
					return fmt.Errorf("unknown column %s.%s", table.name, key)
				}
				nullable := typ.Kind() == reflect.Pointer
				if nullable {
					typ = typ.Elem()
				}
				if value == nil {
					if !nullable {
						return fmt.Errorf("null %s.%s", table.name, key)
					}
					continue
				}
				switch typ.Kind() {
				case reflect.Int64:
					n, e := integer(value)
					if e != nil {
						return fmt.Errorf("invalid integer %s.%s", table.name, key)
					}
					row[key] = n
				case reflect.Bool:
					if _, ok := value.(bool); !ok {
						n, e := integer(value)
						if e != nil || (n != 0 && n != 1) {
							return fmt.Errorf("invalid boolean %s.%s", table.name, key)
						}
						row[key] = n == 1
					}
				case reflect.String:
					if _, ok := value.(string); !ok {
						return fmt.Errorf("invalid text %s.%s", table.name, key)
					}
				default:
					return fmt.Errorf("unsupported column type")
				}
			}
			// Pre-WeChat Node backups may not have this additive column.
			if table.name == "users" {
				if _, ok := row["credentials_configured"]; !ok {
					row["credentials_configured"] = true
				}
			}
			id, e := integer(row["id"])
			if e != nil || id < 1 || ids[id] {
				return fmt.Errorf("invalid/duplicate id in %s", table.name)
			}
			ids[id] = true
			if e := productValues(table.name, row); e != nil {
				return e
			}
		}
		if table.name == "categories" || table.name == "comments" {
			ordered, e := parentsFirst(rows)
			if e != nil {
				return fmt.Errorf("%s: %w", table.name, e)
			}
			s.Tables[table.name] = ordered
			if table.name == "categories" {
				depth := map[int64]int{}
				for _, row := range ordered {
					id, _ := integer(row["id"])
					parent, _ := integer(row["parent_id"])
					depth[id] = depth[parent] + 1
					if depth[id] > 4 {
						return fmt.Errorf("category depth exceeds 4")
					}
				}
			}
		}
	}
	for name := range s.Tables {
		if !allowed[name] {
			return fmt.Errorf("unexpected table %s; session/dedup import is prohibited", name)
		}
	}
	return nil
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

var dryRun = errors.New("validated dry run rollback")

func Import(ctx context.Context, db *gorm.DB, driver string, s *Snapshot, preview bool) error {
	if e := s.Normalize(); e != nil {
		return e
	}
	e := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// This command is only for an isolated, migrated empty target. It cannot
		// silently merge IDs, overwrite accounts or duplicate existing content.
		for _, name := range append(tableNames(), "refresh_tokens", "article_view_dedup") {
			if name == "site_settings" {
				continue
			}
			var count int64
			if e := tx.Table(name).Count(&count).Error; e != nil {
				return e
			}
			if count != 0 {
				return fmt.Errorf("target %s is not empty", name)
			}
		}
		for _, table := range tables {
			rows := s.Tables[table.name]
			if table.name == "site_settings" {
				if len(rows) != 1 || rows[0]["id"] != int64(1) {
					return fmt.Errorf("site settings must contain singleton id 1")
				}
				if e := tx.Table(table.name).Where("id = ?", 1).Updates(rows[0]).Error; e != nil {
					return e
				}
				continue
			}
			for _, row := range rows {
				copyRow := make(map[string]any, len(row))
				for key, value := range row {
					copyRow[key] = value
				}
				if e := tx.Table(table.name).Create(copyRow).Error; e != nil {
					return fmt.Errorf("import %s failed: %w", table.name, e)
				}
			}
		}
		if e := audit(tx); e != nil {
			return e
		}
		if preview {
			return dryRun
		}
		if driver == "postgres" {
			// Identifiers come solely from the compiled allowlist, never JSON input.
			for _, table := range tables {
				query := fmt.Sprintf("SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s),1), EXISTS(SELECT 1 FROM %s))", table.name, table.name, table.name)
				if e := tx.Exec(query).Error; e != nil {
					return e
				}
			}
		}
		return nil
	})
	if errors.Is(e, dryRun) {
		return nil
	}
	return e
}
func audit(tx *gorm.DB) error {
	for _, query := range []string{
		"SELECT COUNT(*) FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE u.id IS NULL",
		"SELECT COUNT(*) FROM articles a LEFT JOIN categories c ON a.category_id=c.id WHERE a.deleted_at IS NULL AND a.category_id IS NOT NULL AND c.id IS NULL",
		"SELECT COUNT(*) FROM comments c JOIN comments p ON c.parent_id=p.id WHERE c.article_id <> p.article_id",
		"SELECT COUNT(*) FROM attachments f LEFT JOIN articles a ON f.article_id=a.id WHERE f.article_id IS NOT NULL AND a.id IS NULL",
		"SELECT COUNT(*) FROM articles a WHERE a.like_count <> (SELECT COUNT(*) FROM likes l WHERE l.article_id=a.id)",
	} {
		var count int64
		if e := tx.Raw(query).Scan(&count).Error; e != nil {
			return e
		}
		if count > 0 {
			return fmt.Errorf("relationship/counter audit failed (%d rows); source must be reviewed before import", count)
		}
	}
	return nil
}
func tableNames() []string {
	out := []string{}
	for _, table := range tables {
		out = append(out, table.name)
	}
	return out
}
func (s *Snapshot) Counts() map[string]int {
	out := map[string]int{}
	for k, v := range s.Tables {
		out[k] = len(v)
	}
	return out
}

// CanonicalJSON enables exact source/target checks without metadata timestamps.
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
		if e := allowed("role", "member", "editor", "admin"); e != nil {
			return e
		}
		return allowed("status", "active", "disabled")
	case "articles":
		if e := allowed("status", "draft", "pending", "published"); e != nil {
			return e
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
