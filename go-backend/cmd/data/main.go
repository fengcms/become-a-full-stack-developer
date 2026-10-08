package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/platform/database"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/transfer"
)

func main() {
	mode := flag.String("mode", "export", "export or import")
	driver := flag.String("driver", "sqlite", "sqlite, postgres or mysql")
	file := flag.String("file", "", "snapshot JSON path")
	preview := flag.Bool("dry-run", false, "validate full import then rollback")
	flag.Parse()
	if *file == "" {
		log.Fatal("-file required")
	}
	dsn := os.Getenv("TRANSFER_DATABASE_URL")
	if dsn == "" {
		log.Fatal("TRANSFER_DATABASE_URL required")
	}
	var err error
	if *mode == "export" {
		dsn, err = database.ReadOnlyDSN(*driver, dsn)
		if err != nil {
			log.Fatal(err)
		}
	}
	db, err := database.Open(*driver, dsn)
	if err != nil {
		log.Fatal("database unavailable")
	}
	raw, _ := db.DB()
	defer raw.Close()
	switch *mode {
	case "export":
		snap, err := transfer.Export(context.Background(), db, *driver)
		if err != nil {
			log.Fatal(err)
		}
		if err = snap.Normalize(); err != nil {
			log.Fatal(err)
		}
		data, err := json.MarshalIndent(snap, "", "  ")
		if err != nil {
			log.Fatal(err)
		}
		// Snapshots contain password hashes and identities; never overwrite silently.
		out, err := os.OpenFile(*file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			log.Fatal(err)
		}
		if _, err = out.Write(data); err != nil {
			out.Close()
			log.Fatal(err)
		}
		if err = out.Close(); err != nil {
			log.Fatal(err)
		}
		counts, _ := json.Marshal(snap.Counts())
		fmt.Println("exported", string(counts))
	case "import":
		in, err := os.Open(*file)
		if err != nil {
			log.Fatal(err)
		}
		defer in.Close()
		decoder := json.NewDecoder(in)
		decoder.UseNumber()
		decoder.DisallowUnknownFields()
		var snap transfer.Snapshot
		if err = decoder.Decode(&snap); err != nil {
			log.Fatal(err)
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			log.Fatal("snapshot must contain exactly one JSON document")
		}
		if err = transfer.Import(context.Background(), db, *driver, &snap, *preview); err != nil {
			log.Fatal(err)
		}
		counts, _ := json.Marshal(snap.Counts())
		fmt.Printf("import validated (dry-run=%v): %s\n", *preview, counts)
	default:
		log.Fatal("unsupported mode")
	}
}
