package database

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Lock 在支持的数据库中申请行锁，保护读后写的业务不变量。
// SQLite 依赖每实例单写连接；该机制不保证跨进程 SQLite 写入协调。
func Lock(db *gorm.DB) *gorm.DB {
	if db.Dialector.Name() == "sqlite" {
		return db
	}
	return db.Clauses(clause.Locking{Strength: "UPDATE"})
}
