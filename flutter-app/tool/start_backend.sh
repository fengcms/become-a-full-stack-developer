#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$APP_ROOT/.." && pwd)"
mkdir -p "$APP_ROOT/.local"
export PORT=11002 DB_FILE="$APP_ROOT/.local/backend.db" JWT_SECRET=flutter-local-development-only STORAGE_DRIVER=local NODE_ENV=development
cd "$REPO_ROOT/node-backend"
pnpm seed
# Run from the isolated directory so local uploads also stay inside .local.
cd "$APP_ROOT/.local"
exec "$REPO_ROOT/node-backend/node_modules/.bin/tsx" --tsconfig "$REPO_ROOT/node-backend/tsconfig.json" "$REPO_ROOT/node-backend/src/index.ts"
