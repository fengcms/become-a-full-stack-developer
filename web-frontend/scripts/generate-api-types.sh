#!/usr/bin/env bash
# Generate from the shared contract without changing the application's TypeScript version.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GEN_DIR="$PROJECT_ROOT/.local/typegen"
if [ ! -x "$GEN_DIR/node_modules/.bin/openapi-typescript" ]; then
  mkdir -p "$GEN_DIR"
  cat > "$GEN_DIR/package.json" <<'JSON'
{"name":"codex-api-typegen","private":true,"dependencies":{"typescript":"5.9.3","openapi-typescript":"7.13.0"}}
JSON
  npm install --prefix "$GEN_DIR" --ignore-scripts --no-audit --no-fund
fi
"$GEN_DIR/node_modules/.bin/openapi-typescript" \
  "$PROJECT_ROOT/../docs/api/openapi.v1.yaml" -o "$PROJECT_ROOT/types/api.gen.ts"
