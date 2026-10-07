#!/usr/bin/env bash
# Local experiment only: same 500-article fixture, separate SQLite copies.
set -euo pipefail
cd "$(dirname "$0")/.."
workspace="$(cd .. && pwd)"
scratch="$(mktemp -d /tmp/befull-m6-bench.XXXXXX)"
cleanup(){
 if [[ -n "${go_pid:-}" ]];then kill -TERM "$go_pid" 2>/dev/null || true;wait "$go_pid" 2>/dev/null || true;fi
 if [[ -n "${node_pid:-}" ]];then kill -TERM "$node_pid" 2>/dev/null || true;wait "$node_pid" 2>/dev/null || true;fi
}
trap cleanup EXIT
export DB_DRIVER=sqlite DATABASE_URL="$scratch/source.db" JWT_SECRET=benchmark-shared-secret-32-characters
export SEED_USERNAME=bench-admin SEED_PASSWORD=bench-password STORAGE_DRIVER=local
CGO_ENABLED=1 go build -trimpath -o "$scratch/server" ./cmd/server
go run ./cmd/migrate
go run ./cmd/seed -articles 500
# Seed command has closed SQLite before these copies, so no WAL is omitted.
cp "$scratch/source.db" "$scratch/go.db"
cp "$scratch/source.db" "$scratch/node.db"
DATABASE_URL="$scratch/go.db" HTTP_ADDR=127.0.0.1:18081 DB_METRICS_FILE="$scratch/db-go.json" "$scratch/server" > "$scratch/go.log" 2>&1 &
go_pid=$!
# Run the tsx loader directly so this PID is the server, not its launcher parent.
(
 cd "$workspace/node-backend"
 export DB_FILE="$scratch/node.db" PORT=18082 DB_METRICS_FILE="$scratch/db-node.json"
 exec node --import tsx "$workspace/go-backend/scripts/node-benchmark-server.mts"
) > "$scratch/node.log" 2>&1 &
node_pid=$!
for port in 18081 18082;do
 ready=0
 for attempt in $(seq 1 40);do if curl -fsS "http://127.0.0.1:$port/api/v1/health" >/dev/null;then ready=1;break;fi;sleep 0.5;done
 if [[ "$ready" != 1 ]];then printf '%s\n' "benchmark server failed: $scratch";exit 1;fi
done
(
 cd "$workspace/node-backend"
 GO_BENCH_PID="$go_pid" NODE_BENCH_PID="$node_pid" node --import tsx "$workspace/go-backend/scripts/benchmark.mts" "$scratch/performance.json"
)
cleanup
go_pid="";node_pid=""
printf '%s\n' "benchmark report and diagnostic logs: $scratch"
