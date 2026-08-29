# B-R2部署 · 复审批复（2026-08-29，BackendArchitect）

> 初审报告：`docs/node-backend/review/B-R2部署-后端代码审阅报告.md`
> 开发 AI 回复：`docs/node-backend/review/B-R2部署-后端代码-开发AI回复.md`
> 被复验提交：`c900ea3`「fix(node-backend): 补全CF部署兼容性配置并优化本地存储导入」（HEAD）

---

## 一、裁定

**复批通过（代码层面）。** P1（部署阻断）已清零并有 `wrangler.toml` 改写证据；P2 已落实，R2 生产 bundle 不再静态引入 `node:fs`；P3 四项为已接受的设计权衡，本期不动。**五门门禁独立复验全绿、契约零字节变更、冻结保持。**

唯一保留项：storage 层移除 `SAFE_KEY`/`resolveKey` 后的**防御纵深削弱**（P3，非阻断），建议后续补回或显式记录信任不变量。

> 权威终验仍需 owner 本机 `wrangler deploy`：自动化测试跑在 Node，无法替代真实 CF 运行时对 `nodejs_compat`/模块求值的验证（开发 AI 回复第七节亦明确此点）。

---

## 二、整改落实独立核验（不采信自证）

| 项 | 开发 AI 声明 | 架构师独立核验 | 结论 |
|---|---|---|---|
| P1 | wrangler.toml 加 `compatibility_flags = ["nodejs_compat"]` | 读 `wrangler.toml:7` 确为 `compatibility_flags = ["nodejs_compat"]`；注释把"即便 r2 模式顶层 node:fs 仍求值故不可省"盲区写清 | ✅ 落实 |
| P2 | `node:fs`/`node:path` 改 LocalStorage 内动态 import；`joinPath` 替代；移除 `SAFE_KEY` | 读 `storage.ts` 确认顶层已无 `node:fs`/`node:path` 静态 import；`loadFs()` 动态 `import('node:fs/promises')` 仅 LocalStorage 方法内 `await` 触发；R2 模式 `LocalStorage` 永不被实例化 → 动态 import 永不执行 | ✅ 落实 |
| P3-A/B/C/D | 接受，不动 | 与初审裁定一致，无新增风险 | ✅ 接受 |

**变更范围核验**（`git diff --stat 2ad49dd HEAD`）：仅 `node-backend/src/shared/storage.ts`(+38/-16 等效)、`node-backend/wrangler.toml`(+4)；契约 `openapi.v1.yaml` **0 行 diff**；测试文件**未改动**（既有 local/attachment 用例覆盖动态 import 路径）。范围与回复 §六 一致。

---

## 三、五门门禁独立复验（全绿）

| 门 | 手段 | 结果 |
|---|---|---|
| typecheck | `tsc --noEmit` | ✅ 0 error |
| lint | `biome check .` | ✅ 117 文件 0 问题 |
| 单测 | `vitest run` | ✅ **140 passed**（含 R2 批次 7，无回归） |
| 契约结构门 | `openapi-spec-validator` | ✅ STRUCTURE_OK |
| 契约语义门 | `check_contract.py` | ✅ 全部通过（33 OK）；`openapi.v1.yaml` 字节级 0 变更 |

---

## 四、P3（非阻断）· storage 层防御纵深削弱

**现象**：本次 P2 改造移除了 `storage.ts` 的 `SAFE_KEY` 常量与 `LocalStorage.resolveKey`（原 `if (!SAFE_KEY.test(key)) throw` 的**第二层**路径穿越防御），改由 `joinPath(root, key)` 直接拼接、无 key 校验。

**调用链穿透核验**（关键，决定是否为阻断）：
- `LocalStorage.get` 唯一调用方 `routes/files.ts:37`，其前 `files.ts:35` 已 `if (!SAFE_KEY.test(key)) throw 404` → **路由层兜住**；
- `LocalStorage.delete` 唯一调用方 `services/attachment.ts:151`，传入 `result.storageKey`（来自 DB 的内容寻址 key，**非用户可控**）→ 安全；
- `put` 内部生成 key。

**结论**：当前所有进入 `LocalStorage` 的 key 均已被上游校验或来自内容寻址，**实践中无路径穿越可利用**。但 storage 层自身不再自保，若未来新增调用方忘记校验即引入风险——属**防御纵深削弱**，非阻断。

**建议（非阻塞，可选跟进项）**：在 `LocalStorage.get/delete` 内补一句 `if (!/^[A-Za-z0-9._-]+$/.test(key)) return null / throw`，恢复存储层自保；或在 `storage.ts` 注释显式记录"key 由调用方保证已校验"的不变量。

---

## 五、复批门禁满足度

1. ✅ `wrangler.toml` 含 `compatibility_flags = ["nodejs_compat"]`（P1 落实）
2. ✅ `node:fs`/`node:path` 不再顶层静态 import，R2 bundle 不静态引 fs（P2 落实）
3. ✅ tsc 0 / biome 0 / vitest 140 / 结构门 OK / 语义门 33 OK / yaml 0 diff

**裁决：复批通过，无 P1/P2 阻塞。** 待 owner 本机 `wrangler login` → 填 D1/R2 id 与 CORS/域名 → `wrangler deploy` 真实 CF 运行时验证 Worker 启动成功 → R2 部署补充正式收口。（P3 防御纵深建议可冻结后顺带处理，不阻塞。）
