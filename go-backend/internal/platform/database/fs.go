package database

import "io/fs"

func migrationsSub(driver string) (fs.FS, error) { return fs.Sub(migrations, "migrations/"+driver) }
