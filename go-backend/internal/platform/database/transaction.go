package database

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Lock explicitly requests a row lock where supported. SQLite uses one writer
// connection per service instance; multi-process SQLite is outside this topology.
func Lock(db *gorm.DB) *gorm.DB {
	if db.Dialector.Name() == "sqlite" {
		return db
	}
	return db.Clauses(clause.Locking{Strength: "UPDATE"})
}
