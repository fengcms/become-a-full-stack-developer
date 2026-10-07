package main

import (
	"context"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"log"
)

func main() {
	c, e := config.Load()
	if e != nil {
		log.Fatal(e)
	}
	db, e := database.Open(c.Driver, c.DSN)
	if e != nil {
		log.Fatal(e)
	}
	sql, _ := db.DB()
	defer sql.Close()
	if e = database.Migrate(context.Background(), db, c.Driver); e != nil {
		log.Fatal(e)
	}
	log.Print("migrations complete")
}
