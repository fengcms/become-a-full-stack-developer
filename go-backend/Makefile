# Configuration is loaded by cmd/server, cmd/migrate and cmd/seed.
.PHONY: run build migrate seed test verify matrix
run:
	go run ./cmd/server
build:
	CGO_ENABLED=1 go build -trimpath -o bin/server ./cmd/server
	CGO_ENABLED=1 go build -trimpath -o bin/migrate ./cmd/migrate
	CGO_ENABLED=1 go build -trimpath -o bin/data ./cmd/data
	CGO_ENABLED=1 go build -trimpath -o bin/seed ./cmd/seed
migrate:
	go run ./cmd/migrate
seed:
	go run ./cmd/seed
test:
	go test ./... -count=1
verify:
	test -z "$$(gofmt -l cmd internal test scripts/doccheck)"
	go run ./scripts/doccheck .
	go vet ./...
	node scripts/sync-contract.cjs --check
	go test ./... -count=1
matrix:
	bash scripts/verify-matrix.sh
