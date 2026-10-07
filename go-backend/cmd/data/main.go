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
	var e error
	if *mode == "export" {
		dsn, e = database.ReadOnlyDSN(*driver, dsn)
		if e != nil {
			log.Fatal(e)
		}
	}
	db, e := database.Open(*driver, dsn)
	if e != nil {
		log.Fatal("database unavailable")
	}
	raw, _ := db.DB()
	defer raw.Close()
	switch *mode {
	case "export":
		snap, e := transfer.Export(context.Background(), db, *driver)
		if e != nil {
			log.Fatal(e)
		}
		if e = snap.Normalize(); e != nil {
			log.Fatal(e)
		}
		data, e := json.MarshalIndent(snap, "", "  ")
		if e != nil {
			log.Fatal(e)
		}
		// Snapshots contain password hashes and identities; never overwrite silently.
		out, e := os.OpenFile(*file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			log.Fatal(e)
		}
		if _, e = out.Write(data); e != nil {
			out.Close()
			log.Fatal(e)
		}
		if e = out.Close(); e != nil {
			log.Fatal(e)
		}
		counts, _ := json.Marshal(snap.Counts())
		fmt.Println("exported", string(counts))
	case "import":
		in, e := os.Open(*file)
		if e != nil {
			log.Fatal(e)
		}
		defer in.Close()
		decoder := json.NewDecoder(in)
		decoder.UseNumber()
		decoder.DisallowUnknownFields()
		var snap transfer.Snapshot
		if e = decoder.Decode(&snap); e != nil {
			log.Fatal(e)
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			log.Fatal("snapshot must contain exactly one JSON document")
		}
		if e = transfer.Import(context.Background(), db, *driver, &snap, *preview); e != nil {
			log.Fatal(e)
		}
		counts, _ := json.Marshal(snap.Counts())
		fmt.Printf("import validated (dry-run=%v): %s\n", *preview, counts)
	default:
		log.Fatal("unsupported mode")
	}
}
