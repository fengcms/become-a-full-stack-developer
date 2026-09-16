#!/usr/bin/env bash
# 从 docs/api/openapi.v1.yaml 生成 types/api.gen.ts。
# openapi-typescript 7.x 依赖 TypeScript 5 内部 API，与项目使用的 TS 7 不兼容，
# 因此在独立目录中安装 TS 5 + openapi-typescript 来执行生成。
set -e

GEN_DIR="/tmp/openapi-gen-web-frontend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$GEN_DIR/node_modules/openapi-typescript" ]; then
  echo "→ 初始化 openapi-typescript（TS 5）独立环境..."
  mkdir -p "$GEN_DIR"
  cd "$GEN_DIR"
  pnpm init -y >/dev/null 2>&1
  pnpm add typescript@5.9.3 openapi-typescript@7.13.0 >/dev/null 2>&1
fi

cd "$PROJECT_ROOT"
"$GEN_DIR/node_modules/.bin/openapi-typescript" \
  "$PROJECT_ROOT/../docs/api/openapi.v1.yaml" \
  -o "$PROJECT_ROOT/types/api.gen.ts"

echo "✓ types/api.gen.ts 已生成"
