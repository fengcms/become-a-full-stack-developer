#!/usr/bin/env bash
# Creates and removes only uniquely named databases owned by this test run.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -p befull-m6 -f compose.yaml up -d --wait
stamp="$(date +%Y%m%d%H%M%S)_${RANDOM}"
pg="befull_pg_test_${stamp}"
my="befull_my_test_${stamp}"
cleanup(){
 docker exec befull-m6-postgres-1 dropdb -U befull --if-exists "$pg" >/dev/null 2>&1 || true
 docker exec befull-m6-postgres-1 dropdb -U befull --if-exists "${pg}_upgrade" >/dev/null 2>&1 || true
 docker exec befull-m6-postgres-1 dropdb -U befull --if-exists "${pg}_import" >/dev/null 2>&1 || true
 docker exec -e MYSQL_PWD=local-go-only befull-m6-mysql-1 mysql -uroot -e "DROP DATABASE IF EXISTS ${my}; DROP DATABASE IF EXISTS ${my}_upgrade; DROP DATABASE IF EXISTS ${my}_import;" >/dev/null 2>&1 || true
}
trap cleanup EXIT
for name in "$pg" "${pg}_upgrade" "${pg}_import"; do docker exec befull-m6-postgres-1 createdb -U befull "$name"; done
docker exec -e MYSQL_PWD=local-go-only befull-m6-mysql-1 mysql -uroot -e "CREATE DATABASE ${my} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; CREATE DATABASE ${my}_upgrade CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin; CREATE DATABASE ${my}_import CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;"
go test ./... -count=1 -p 1
pgdsn="postgres://befull:local-go-only@127.0.0.1:15432/${pg}?sslmode=disable"
mydsn="root:local-go-only@tcp(127.0.0.1:13306)/${my}?charset=utf8mb4&parseTime=true&loc=UTC"
TEST_DRIVER=postgres TEST_DSN="$pgdsn" TEST_POSTGRES_DSN="$pgdsn" go test ./... -count=1 -p 1
TEST_UPGRADE_DRIVER=postgres TEST_UPGRADE_DSN="postgres://befull:local-go-only@127.0.0.1:15432/${pg}_upgrade?sslmode=disable" go test ./internal/platform/database -run TestVersionOneUpgrade -count=1
TEST_IMPORT_DRIVER=postgres TEST_IMPORT_DSN="postgres://befull:local-go-only@127.0.0.1:15432/${pg}_import?sslmode=disable" go test ./internal/transfer -count=1
TEST_DRIVER=mysql TEST_DSN="$mydsn" TEST_MYSQL_DSN="$mydsn" go test ./... -count=1 -p 1
TEST_UPGRADE_DRIVER=mysql TEST_UPGRADE_DSN="root:local-go-only@tcp(127.0.0.1:13306)/${my}_upgrade?charset=utf8mb4&parseTime=true&loc=UTC" go test ./internal/platform/database -run TestVersionOneUpgrade -count=1
TEST_IMPORT_DRIVER=mysql TEST_IMPORT_DSN="root:local-go-only@tcp(127.0.0.1:13306)/${my}_import?charset=utf8mb4&parseTime=true&loc=UTC" go test ./internal/transfer -count=1
