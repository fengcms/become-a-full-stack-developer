package transfer

import (
	"fmt"
	"reflect"
	"strings"
)

// Normalize 校验版本、表列白名单与数据类型，并按父子关系排列导入顺序。
// 它只修正规范化表示，不建立数据库连接，也不接受未声明的业务表。
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
		if err := normalizeRows(table, rows); err != nil {
			return err
		}
		if table.name != "categories" && table.name != "comments" {
			continue
		}
		ordered, err := parentsFirst(rows)
		if err != nil {
			return fmt.Errorf("%s: %w", table.name, err)
		}
		s.Tables[table.name] = ordered
		if table.name == "categories" {
			if err := validateCategoryDepth(ordered); err != nil {
				return err
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

func columnName(field reflect.StructField) string {
	return strings.Split(strings.TrimPrefix(field.Tag.Get("gorm"), "column:"), ";")[0]
}

func columnTypes(row any) map[string]reflect.Type {
	columns := map[string]reflect.Type{}
	typ := reflect.TypeOf(row)
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		columns[columnName(field)] = field.Type
	}
	return columns
}

func normalizeRows(table table, rows []map[string]any) error {
	columns := columnTypes(table.row)
	ids := map[int64]bool{}
	for _, row := range rows {
		for key, value := range row {
			typ, ok := columns[key]
			if !ok {
				return fmt.Errorf("unknown column %s.%s", table.name, key)
			}
			normalized, err := normalizeValue(value, typ)
			if err != nil {
				return fmt.Errorf("%s.%s: %w", table.name, key, err)
			}
			row[key] = normalized
		}
		// 微信扩展前的备份没有该字段；已有密码账号默认允许密码登录。
		if table.name == "users" {
			if _, ok := row["credentials_configured"]; !ok {
				row["credentials_configured"] = true
			}
		}
		id, err := integer(row["id"])
		if err != nil || id < 1 || ids[id] {
			return fmt.Errorf("invalid/duplicate id in %s", table.name)
		}
		ids[id] = true
		if err := productValues(table.name, row); err != nil {
			return err
		}
	}
	return nil
}

// normalizeValue 保留 NULL 与零值的区别；MySQL/SQLite 的 0/1 布尔统一为 bool。
func normalizeValue(value any, typ reflect.Type) (any, error) {
	nullable := typ.Kind() == reflect.Pointer
	if nullable {
		typ = typ.Elem()
	}
	if value == nil {
		if !nullable {
			return nil, fmt.Errorf("null in non-nullable column")
		}
		return nil, nil
	}
	switch typ.Kind() {
	case reflect.Int64:
		n, err := integer(value)
		if err != nil {
			return nil, fmt.Errorf("invalid integer")
		}
		return n, nil
	case reflect.Bool:
		if boolean, ok := value.(bool); ok {
			return boolean, nil
		}
		n, err := integer(value)
		if err != nil || (n != 0 && n != 1) {
			return nil, fmt.Errorf("invalid boolean")
		}
		return n == 1, nil
	case reflect.String:
		if text, ok := value.(string); ok {
			return text, nil
		}
		return nil, fmt.Errorf("invalid text")
	default:
		return nil, fmt.Errorf("unsupported column type")
	}
}

func validateCategoryDepth(rows []map[string]any) error {
	depth := map[int64]int{}
	for _, row := range rows {
		id, _ := integer(row["id"])
		parent, _ := integer(row["parent_id"])
		depth[id] = depth[parent] + 1
		if depth[id] > 4 {
			return fmt.Errorf("category depth exceeds 4")
		}
	}
	return nil
}
