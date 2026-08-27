#!/usr/bin/env bash
# =============================================================================
# scripts/smoke-test.sh — 后端端到端冒烟脚本（看得见结果的 curl 全流程）
#
# 它做什么：
#   1. 用临时 SQLite 文件启动 node-backend（不污染你的真实库）
#   2. 直插一个 admin 账号（测试脚手架，规避「无首 admin」死锁，不碰 src/）
#   3. 用管理员登录 → 跑分类/标签/文章/评论/上传/站点等增删改查
#   4. 注册一个普通会员 → 跑会员视角接口 + 权限拒绝(403)验证
#   5. 演示 RBAC：把会员提升为 editor 后，原本 403 的分类创建变为成功
#   6. 收尾：杀服务、清临时文件
#
# 用法：
#   bash scripts/smoke-test.sh
#
# 依赖：node / npm 或 pnpm / curl / base64（均随 Node 开发环境自带）
# 不依赖 jq（用内置 node 提取器 scripts/_smoke_json.mjs）
# =============================================================================
set -o pipefail

# ── 路径与配置 ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

PORT="${SMOKE_PORT:-3199}"
HOST="http://localhost:${PORT}"
DB_FILE="${PROJECT_DIR}/.smoke/smoke.db"
JWT_SECRET="${SMOKE_JWT_SECRET:-smoke-test-secret-do-not-use-in-prod}"
ADMIN_USER="${SMOKE_ADMIN_USER:-smoke_admin}"
ADMIN_PASS="${SMOKE_ADMIN_PASS:-SmokeTest123!}"
ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:-smoke_admin@test.local}"
MEMBER_USER="smoke_member"
MEMBER_PASS="MemberTest123!"
MEMBER_EMAIL="smoke_member@test.local"

RESP_FILE="$(mktemp /tmp/smoke_resp.XXXXXX.json)"
SERVER_LOG="${PROJECT_DIR}/.smoke/server.log"
SMOKE_PNG="${PROJECT_DIR}/.smoke/dot.png"

# ── 颜色 ────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_YEL=$'\033[33m'; C_CYAN=$'\033[36m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_GREEN=''; C_RED=''; C_YEL=''; C_CYAN=''; C_BOLD=''; C_DIM=''
fi

PASS=0; FAIL=0
section() { echo; echo "${C_BOLD}${C_CYAN}══ $* ${C_RESET}"; }
info()    { echo "  ${C_DIM}$*${C_RESET}"; }
ok_line() { echo "  ${C_GREEN}✓ $*${C_RESET}"; PASS=$((PASS+1)); }
bad_line(){ echo "  ${C_RED}✗ $*${C_RESET}"; FAIL=$((FAIL+1)); }

# ── JSON 提取（不依赖 jq） ───────────────────────────────────────────────────
json_extract() { printf '%s' "$1" | node "$SCRIPT_DIR/_smoke_json.mjs" "$2"; }

# ── 通用请求 ────────────────────────────────────────────────────────────────
RESP=""; CODE=""
do_req() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local -a args=(-s -o "$RESP_FILE" -w '%{http_code}' -H "Accept: application/json")
  if [ "$method" != "GET" ] && [ "$method" != "DELETE" ]; then
    args+=(-H "Content-Type: application/json")
  fi
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")
  CODE=$(curl -s -X "$method" "$HOST$path" "${args[@]}")
  RESP=$(cat "$RESP_FILE")
}

# 期望成功（HTTP 200 且业务 code=0）
expect_ok() {
  local label="$1" rc
  rc=$(json_extract "$RESP" code)
  if [ "$CODE" = "200" ] && [ "$rc" = "0" ]; then
    ok_line "$label  → HTTP $CODE / code=$rc"
  else
    bad_line "$label  → HTTP $CODE / code=$rc  body=${RESP:0:200}"
  fi
}
# 期望特定 HTTP 状态码（权限/校验类）
expect_code() {
  local label="$1" want="$2"
  if [ "$CODE" = "$want" ]; then
    ok_line "$label  → HTTP $CODE (期望 $want)"
  else
    bad_line "$label  → HTTP $CODE (期望 $want)  body=${RESP:0:200}"
  fi
}

# ── 清理 ─────────────────────────────────────────────────────────────────────
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "${PROJECT_DIR}/.smoke"
  rm -f "$RESP_FILE"
}
trap cleanup EXIT INT TERM

# ── 0. 准备 ─────────────────────────────────────────────────────────────────
section "0. 准备环境"
mkdir -p "${PROJECT_DIR}/.smoke"
rm -f "$DB_FILE"
# 生成一张 1x1 合法 PNG（base64），用于上传测试
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$SMOKE_PNG" 2>/dev/null \
  || printf 'fake' > "$SMOKE_PNG"
info "临时库: $DB_FILE"
info "服务地址: $HOST"

# 选运行时启动命令（优先项目内 tsx，确保环境变量透传）
if [ -x "${PROJECT_DIR}/node_modules/.bin/tsx" ]; then
  TSX="${PROJECT_DIR}/node_modules/.bin/tsx"
else
  TSX="npx tsx"
fi

# ── 1. 启动服务 ──────────────────────────────────────────────────────────────
section "1. 启动后端 (PORT=$PORT)"
DB_FILE="$DB_FILE" JWT_SECRET="$JWT_SECRET" PORT="$PORT" STORAGE_DRIVER=local NODE_ENV=development \
  $TSX src/index.ts > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
info "等待 /health 就绪 ..."

ready=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null -w '%{http_code}' "$HOST/api/v1/health" 2>/dev/null | grep -q 200; then
    ready=1; break
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  bad_line "服务未在 20s 内就绪，最后日志："; tail -20 "$SERVER_LOG"
  exit 1
fi
ok_line "服务已就绪"

# ── 2. 引导 admin（直插 DB，测试脚手架） ──────────────────────────────────────
section "2. 引导测试管理员（直插 SQLite，不碰 src/）"
SMOKE_DB_FILE="$DB_FILE" SMOKE_ADMIN_USER="$ADMIN_USER" SMOKE_ADMIN_EMAIL="$ADMIN_EMAIL" SMOKE_ADMIN_PASS="$ADMIN_PASS" \
  node "$SCRIPT_DIR/bootstrap-admin.mjs"
ok_line "admin 账号就绪: $ADMIN_USER"

# ── 3. 管理员登录 ────────────────────────────────────────────────────────────
section "3. 管理员登录"
do_req POST "/api/v1/auth/login" "" "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}"
expect_ok "POST /auth/login (admin)"
ADMIN_TOKEN=$(json_extract "$RESP" data.accessToken)
ADMIN_REFRESH=$(json_extract "$RESP" data.refreshToken)
ADMIN_ID=$(json_extract "$RESP" data.user.id)
info "admin id=$ADMIN_ID, token 前 12 位=${ADMIN_TOKEN:0:12}..."

# ── 4. 管理员：分类 / 标签 / 文章 增删改查 ──────────────────────────────────
section "4. 管理员 · 分类 / 标签 / 文章 CRUD"
do_req POST "/api/v1/categories" "$ADMIN_TOKEN" "{\"name\":\"冒烟分类\",\"slug\":\"smoke-cat\",\"description\":\"冒烟测试分类\"}"
expect_ok "POST /categories (建分类)"
CAT_ID=$(json_extract "$RESP" data.id)
do_req GET "/api/v1/categories/tree" "$ADMIN_TOKEN"
expect_ok "GET /categories/tree"
do_req PUT "/api/v1/categories/$CAT_ID" "$ADMIN_TOKEN" "{\"name\":\"冒烟分类(改)\",\"slug\":\"smoke-cat\"}"
expect_ok "PUT /categories/$CAT_ID (改分类)"

do_req POST "/api/v1/tags" "$ADMIN_TOKEN" "{\"name\":\"冒烟标签\",\"slug\":\"smoke-tag\"}"
expect_ok "POST /tags (建标签)"
TAG_ID=$(json_extract "$RESP" data.id)
do_req GET "/api/v1/tags" "$ADMIN_TOKEN"
expect_ok "GET /tags (含 articleCount)"

do_req POST "/api/v1/articles" "$ADMIN_TOKEN" \
  "{\"title\":\"冒烟测试文章\",\"summary\":\"curl 冒烟脚本创建\",\"content\":\"这是正文，用于验证后端接口端到端可用。\",\"categoryId\":$CAT_ID,\"tags\":[\"smoke-tag\"],\"status\":\"draft\"}"
expect_ok "POST /articles (建草稿)"
ART_ID=$(json_extract "$RESP" data.id)
do_req GET "/api/v1/articles/$ART_ID" "$ADMIN_TOKEN"
expect_ok "GET /articles/$ART_ID (草稿详情)"
do_req POST "/api/v1/admin/articles/$ART_ID/status" "$ADMIN_TOKEN" "{\"status\":\"published\"}"
expect_ok "POST /admin/articles/$ART_ID/status → published (admin 置位)"
do_req GET "/api/v1/articles" "$ADMIN_TOKEN"
expect_ok "GET /articles (公开列表含新文章)"

# ── 5. 评论 / 点赞 / 收藏 / 历史 / 通知 ──────────────────────────────────────
section "5. 互动接口 · 评论 / 点赞 / 收藏 / 历史 / 通知"
do_req POST "/api/v1/articles/$ART_ID/comments" "$ADMIN_TOKEN" "{\"content\":\"这是一条冒烟测试评论\"}"
expect_ok "POST /articles/$ART_ID/comments (发评论)"
CMT_ID=$(json_extract "$RESP" data.id)
do_req GET "/api/v1/articles/$ART_ID/comments" "$ADMIN_TOKEN"
expect_ok "GET /articles/$ART_ID/comments"
do_req POST "/api/v1/articles/$ART_ID/like" "$ADMIN_TOKEN"
expect_ok "POST /articles/$ART_ID/like (点赞)"
do_req GET "/api/v1/articles/$ART_ID/like/status" "$ADMIN_TOKEN"
expect_ok "GET /articles/$ART_ID/like/status"
do_req POST "/api/v1/me/favorites" "$ADMIN_TOKEN" "{\"articleId\":$ART_ID}"
expect_ok "POST /me/favorites (收藏)"
do_req POST "/api/v1/me/history" "$ADMIN_TOKEN" "{\"articleId\":$ART_ID,\"progress\":60}"
expect_ok "POST /me/history (阅读进度)"
do_req GET "/api/v1/me/history" "$ADMIN_TOKEN"
expect_ok "GET /me/history"
do_req GET "/api/v1/me/notifications" "$ADMIN_TOKEN"
expect_ok "GET /me/notifications"

# ── 6. 文件上传 + 回读（验证去重改造后的内容寻址 key） ───────────────────────
section "6. 文件上传 + 回读 (验证内容寻址去重)"
UP_RESP=$(curl -s -X POST "$HOST/api/v1/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$SMOKE_PNG;type=image/png" -F "articleId=$ART_ID")
CODE_UP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST/api/v1/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$SMOKE_PNG;type=image/png" -F "articleId=$ART_ID")
RESP="$UP_RESP"; CODE="$CODE_UP"
expect_ok "POST /upload (上传附件)"
ATT_ID=$(json_extract "$RESP" data.id)
ATT_URL=$(json_extract "$RESP" data.url)   # 对外只暴露 url（如 /files/<sha256>.png），storageKey 属内部不外露
info "attachment id=$ATT_ID, url=$ATT_URL"
# 用同一张图再传一次，验证去重（url 应相同 → 磁盘只存一份）
UP_RESP2=$(curl -s -X POST "$HOST/api/v1/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$SMOKE_PNG;type=image/png")
ATT_URL2=$(printf '%s' "$UP_RESP2" | node "$SCRIPT_DIR/_smoke_json.mjs" data.url)
if [ "$ATT_URL" = "$ATT_URL2" ]; then
  ok_line "去重生效：两次上传得到相同 url ($ATT_URL)"
else
  bad_line "去重未生效：url1=$ATT_URL url2=$ATT_URL2"
fi
# 回读文件（url 即 /files/<key>，无需鉴权）——只取状态码，避免把二进制读入 RESP
FILE_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$HOST$ATT_URL")
if [ "$FILE_CODE" = "200" ]; then ok_line "GET $ATT_URL (文件可回读)"; else bad_line "GET $ATT_URL → HTTP $FILE_CODE"; fi

# ── 7. 站点配置 + 用户管理（admin） ──────────────────────────────────────────
section "7. 站点配置 + 用户管理 (admin)"
do_req GET "/api/v1/site/settings" "$ADMIN_TOKEN"
expect_ok "GET /site/settings (公开)"
do_req PATCH "/api/v1/admin/site/settings" "$ADMIN_TOKEN" "{\"siteName\":\"冒烟测试站\"}"
expect_ok "PATCH /admin/site/settings"
do_req GET "/api/v1/users" "$ADMIN_TOKEN"
expect_ok "GET /users (后台列表)"
do_req GET "/api/v1/users/$ADMIN_ID" "$ADMIN_TOKEN"
expect_ok "GET /users/$ADMIN_ID (详情)"

# ── 8. 刷新令牌 / 当前用户 ───────────────────────────────────────────────────
section "8. 令牌刷新 / 当前用户"
do_req POST "/api/v1/auth/refresh" "$ADMIN_TOKEN" "{\"refreshToken\":\"$ADMIN_REFRESH\"}"
expect_ok "POST /auth/refresh (换发 token)"
do_req GET "/api/v1/auth/me" "$ADMIN_TOKEN"
expect_ok "GET /auth/me"

# ── 9. 注册普通会员 ──────────────────────────────────────────────────────────
section "9. 注册普通会员"
do_req POST "/api/v1/auth/register" "" "{\"username\":\"$MEMBER_USER\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$MEMBER_PASS\",\"nickname\":\"冒烟会员\"}"
expect_ok "POST /auth/register (member)"
MEMBER_TOKEN=$(json_extract "$RESP" data.accessToken)
MEMBER_ID=$(json_extract "$RESP" data.user.id)
MEMBER_ROLE=$(json_extract "$RESP" data.user.role)
info "member id=$MEMBER_ID role=$MEMBER_ROLE (应为 member)"

# ── 10. 会员视角 + 权限拒绝验证 ──────────────────────────────────────────────
section "10. 会员视角 + 权限拒绝 (RBAC)"
do_req GET "/api/v1/articles" ""            # 匿名也可读公开列表
expect_ok "GET /articles (匿名公开列表)"
do_req GET "/api/v1/articles/$ART_ID" "$MEMBER_TOKEN"
expect_ok "GET /articles/$ART_ID (会员读详情)"
do_req POST "/api/v1/articles/$ART_ID/comments" "$MEMBER_TOKEN" "{\"content\":\"会员也来评论一句\"}"
expect_ok "POST /articles/$ART_ID/comments (会员评论)"
do_req POST "/api/v1/articles/$ART_ID/like" "$MEMBER_TOKEN"
expect_ok "POST /articles/$ART_ID/like (会员点赞)"
do_req POST "/api/v1/me/favorites" "$MEMBER_TOKEN" "{\"articleId\":$ART_ID}"
expect_ok "POST /me/favorites (会员收藏)"
do_req GET "/api/v1/members/$MEMBER_ID" "$MEMBER_TOKEN"
expect_ok "GET /members/$MEMBER_ID (会员主页)"

# 权限拒绝：member 调 editor/admin 接口应 403
do_req POST "/api/v1/categories" "$MEMBER_TOKEN" "{\"name\":\"x\",\"slug\":\"x\"}"
expect_code "POST /categories (member 应 403)" "403"
do_req GET "/api/v1/admin/articles" "$MEMBER_TOKEN"
expect_code "GET /admin/articles (member 应 403)" "403"
do_req POST "/api/v1/admin/articles/$ART_ID/status" "$MEMBER_TOKEN" "{\"status\":\"published\"}"
expect_code "POST /admin/articles/status (member 应 403)" "403"

# ── 11. RBAC 演示：把会员提升为 editor，原本 403 的分类创建变为成功 ───────────
section "11. RBAC 演示 · 会员 → editor 后权限升级"
do_req PATCH "/api/v1/users/$MEMBER_ID" "$ADMIN_TOKEN" "{\"role\":\"editor\"}"
expect_ok "PATCH /users/$MEMBER_ID → editor (admin 提权)"
# 用「新 editor 身份」重新登录拿新 token（role 已变）
do_req POST "/api/v1/auth/login" "" "{\"username\":\"$MEMBER_USER\",\"password\":\"$MEMBER_PASS\"}"
expect_ok "重新登录 (已为 editor)"
MEMBER_TOKEN=$(json_extract "$RESP" data.accessToken)
NEW_ROLE=$(json_extract "$RESP" data.user.role)
info "重新登录后 role=$NEW_ROLE (应为 editor)"
do_req POST "/api/v1/categories" "$MEMBER_TOKEN" "{\"name\":\"会员升级后建的分类\",\"slug\":\"member-promoted-cat\"}"
expect_ok "POST /categories (editor 升级后成功，前一步为 403)"

# ── 12. 收尾：清理 ────────────────────────────────────────────────────────────
section "12. 清理"
do_req POST "/api/v1/auth/logout" "$ADMIN_TOKEN"
expect_ok "POST /auth/logout (admin 登出)"
do_req DELETE "/api/v1/attachments/$ATT_ID" "$ADMIN_TOKEN"
expect_ok "DELETE /attachments/$ATT_ID (删附件，验证引用计数删除护栏)"
do_req DELETE "/api/v1/articles/$ART_ID" "$ADMIN_TOKEN"
expect_ok "DELETE /articles/$ART_ID (软删文章)"

# ── 总结 ──────────────────────────────────────────────────────────────────────
section "结果汇总"
echo "  ${C_BOLD}通过: ${C_GREEN}$PASS${C_RESET}   失败: ${C_BOLD}${C_RED}$FAIL${C_RESET}"
if [ "$FAIL" -gt 0 ]; then
  echo "  ${C_RED}存在失败项，请检查上方输出与服务日志 .smoke/server.log${C_RESET}"
  exit 1
fi
echo "  ${C_GREEN}全部通过 🎉 后端接口端到端可用。${C_RESET}"
