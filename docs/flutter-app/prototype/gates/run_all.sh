#!/usr/bin/env bash
# M4 原型门禁 · 一键复跑
#
# 用法：bash run_all.sh
#   NODE_BIN / PY_BIN / CHROME_BIN 可覆盖默认探测结果。
#   M4_KEEP_SANDBOX=1 可保留 Chrome 沙箱（默认关闭，见 lib.mjs 注释）。
#
# 退出码：全部通过为 0；任一失败为非 0。
set -u
cd "$(dirname "$0")" || exit 2

# ---- 运行时探测（找不到就明确报错，不静默跳过）----
pick() {
  for c in "$@"; do
    [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }
    [ -x "$c" ] && { echo "$c"; return; }
  done
}
NODE_BIN="$(pick "${NODE_BIN:-}" node \
  "$HOME/.workbuddy/binaries/node/versions/22.22.2-3/bin/node")"
PY_BIN="$(pick "${PY_BIN:-}" python3 \
  "$HOME/.workbuddy/binaries/python/envs/default/bin/python")"

[ -n "${NODE_BIN:-}" ] || { echo "找不到 node，请设置 NODE_BIN"; exit 2; }
[ -n "${PY_BIN:-}" ]   || { echo "找不到 python3，请设置 PY_BIN"; exit 2; }

fail=0
run() {
  local name="$1"; shift
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo "  $name"
  echo "════════════════════════════════════════════════════════════════"
  "$@" || fail=1
}

run "门禁 1/4 · 路由覆盖"        "$NODE_BIN" check_routes.mjs
run "门禁 2/4 · API 标注 vs 契约" "$PY_BIN"  check_api_vs_contract.py
run "门禁 3/4 · Dart 令牌"        "$PY_BIN"  check_dart_tokens.py
run "门禁 4/4 · 交互回归"        "$NODE_BIN" probe.mjs

echo
echo "════════════════════════════════════════════════════════════════"
if [ "$fail" -eq 0 ]; then
  echo "  全部门禁通过 ✅"
else
  echo "  存在未通过的门禁 ❌（逐条看上面的 FAIL 明细）"
fi
echo "════════════════════════════════════════════════════════════════"
exit "$fail"
