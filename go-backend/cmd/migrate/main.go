package main

import (
	"context"
	"log"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/config"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
)

func main() {
	c, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := database.Open(c.Driver, c.DSN)
	if err != nil {
		log.Fatal(err)
	}
	sql, _ := db.DB()
	defer sql.Close()
	if err = database.Migrate(context.Background(), db, c.Driver); err != nil {
		log.Fatal(err)
	}
	log.Print("migrations complete")
}
