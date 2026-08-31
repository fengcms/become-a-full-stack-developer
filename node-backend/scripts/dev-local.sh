#!/usr/bin/env bash
#
# scripts/dev-local.sh
# 本地后端开发启动脚本（默认端口 11000）
# 不依赖 Cloudflare 绑定：使用本地 SQLite + 本地磁盘存储；首次启动自动种入管理员账号。
#
# 用法：
#   bash scripts/dev-local.sh
#   ./scripts/dev-local.sh                # 已 chmod +x 时
#   PORT=12000 bash scripts/dev-local.sh  # 临时换端口
#
# 说明：
#   - 启动前会跑一次 pnpm seed（幂等：管理员已存在则跳过），保证可立即用 admin / admin123456 登录。
#   - 监听 11000（可用 PORT 覆盖）；数据落在 ./data/app.db（可用 DB_FILE 覆盖），重启不丢。
#   - 默认 tsx watch 热重载；若想关掉热重载，把末尾的 run_pkg dev 改为 run_pkg start 即可。
#
set -euo pipefail

# 切到仓库根目录（node-backend/），保证相对路径 ./data 等正确解析
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── 运行环境（均可用同名环境变量覆盖，例如 PORT=12000 bash scripts/dev-local.sh）──
export PORT="${PORT:-11000}"
export JWT_SECRET="${JWT_SECRET:-dev-only-insecure-secret-please-change}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export DB_FILE="${DB_FILE:-./data/app.db}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"
export NODE_ENV="${NODE_ENV:-development}"

# 确保本地 SQLite 文件所在目录存在
mkdir -p "$(dirname "$DB_FILE")"

echo "[dev-local] 本地后端 → http://localhost:${PORT}"
echo "[dev-local] DB_FILE=${DB_FILE}  STORAGE_DRIVER=${STORAGE_DRIVER}"

# 包管理器适配：优先 pnpm，回退 npm
run_pkg() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$1"
  else
    npm run "$1"
  fi
}

# 首次 / 空库时种入管理员（幂等：已存在则跳过）。默认账号 admin / admin123456
echo "[dev-local] 检查 / 创建管理员账号…"
SEED_ADMIN_USERNAME="${SEED_ADMIN_USERNAME:-admin}" \
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@example.com}" \
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-admin123456}" \
SEED_ADMIN_NICKNAME="${SEED_ADMIN_NICKNAME:-站点管理员}" \
run_pkg seed

# 启动开发服务（tsx watch 热重载；如需关闭热重载改用 run_pkg start）
echo "[dev-local] 启动服务（tsx watch）…"
run_pkg dev
