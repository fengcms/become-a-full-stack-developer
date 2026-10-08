package transfer

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

var dryRun = errors.New("validated dry run rollback")

// Import 仅向已迁移的空目标导入，预演执行完整校验后回滚。
func Import(ctx context.Context, db *gorm.DB, driver string, s *Snapshot, preview bool) error {
	if err := s.Normalize(); err != nil {
		return err
	}
	txErr := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := ensureEmptyTarget(tx); err != nil {
			return err
		}
		if err := importRows(tx, s); err != nil {
			return err
		}

		if err := audit(tx); err != nil {
			return err
		}
		if preview {
			return dryRun
		}
		if driver == "postgres" {
			// 表名只来自编译内白名单；快照输入不能拼接进标识符。
			for _, table := range tables {
				query := fmt.Sprintf("SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s),1), EXISTS(SELECT 1 FROM %s))", table.name, table.name, table.name)
				if err := tx.Exec(query).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if errors.Is(txErr, dryRun) {
		return nil
	}
	return txErr
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
		if err := tx.Raw(query).Scan(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("relationship/counter audit failed (%d rows); source must be reviewed before import", count)
		}
	}
	return nil
}

// ensureEmptyTarget 拒绝覆盖或合并旧账号，站点初始化单例是唯一例外。
func ensureEmptyTarget(tx *gorm.DB) error {
	// 目标必须为空；不自动合并 ID，不覆盖账号，不重复插入历史内容。
	for _, name := range append(tableNames(), "refresh_tokens", "article_view_dedup") {
		if name == "site_settings" {
			continue
		}
		var count int64
		if err := tx.Table(name).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("target %s is not empty", name)
		}
	}
	return nil
}

// importRows 依次导入规范化表；每行复制，防止驱动回填 ID 修改快照。
func importRows(tx *gorm.DB, s *Snapshot) error {

	for _, table := range tables {
		rows := s.Tables[table.name]
		if table.name == "site_settings" {
			if len(rows) != 1 || rows[0]["id"] != int64(1) {
				return fmt.Errorf("site settings must contain singleton id 1")
			}
			if err := tx.Table(table.name).Where("id = ?", 1).Updates(rows[0]).Error; err != nil {
				return err
			}
			continue
		}
		for _, row := range rows {
			copyRow := make(map[string]any, len(row))
			for key, value := range row {
				copyRow[key] = value
			}
			if err := tx.Table(table.name).Create(copyRow).Error; err != nil {
				return fmt.Errorf("import %s failed: %w", table.name, err)
			}
		}
	}
	return nil
}
