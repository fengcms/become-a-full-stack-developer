# 上传去重优化 · 复审批复（Re-verification）

> 审阅方：BackendArchitect（后端架构师）｜被审交付：`docs/node-backend/08-上传去重-交付文档.md`（2026-08-26 更新版）
> 上游指令稿：`docs/node-backend/review/B-上传去重-后端代码审阅报告.md`（含 P2-A / P3-1 / P3-2 三任务修正指令）
> 关联契约：`docs/api/openapi.v1.yaml`（已冻结，本次字节级零变更）

---

## 〇、裁定结论

**复批通过（Re-verification Approved），无 P2 阻塞项。**

开发 AI 已按 `B-上传去重-后端代码审阅报告.md` 的三项修正指令逐一落实，且全部经独立代码核查 + 测试比对 + 五门门禁复跑 + 契约双门字节级核验予以证实。owner 此前裁决（P2→方案 A / P3-1→接受 / P3-2→修复）全部兑现。

前置条件已满足，可进入 **owner 视觉确认 → 冻结 M1 后端主线** 流程。

复批仅残留 **2 项 P3 非阻塞建议**（见 §三），不阻断放行。

---

## 一、独立复验证据（不采信自陈）

### 1.1 五门门禁（架构师独立复跑，非交付自陈）

| 门 | 命令 | 结果 |
|---|---|---|
| typecheck | `pnpm typecheck`（`tsc --noEmit`） | **0 error** |
| lint | `pnpm lint`（`biome check .`） | **0 problem**（113 文件） |
| 单元/集成 | `pnpm test`（`vitest run`） | **133 passed**（18 文件；126 既有 + 6 去重用例 + 1 guard 404 用例） |
| 契约结构门 | `openapi-spec-validator docs/api/openapi.v1.yaml` | **OK** |
| 契约语义门 | `python check_contract.py` | **33 OK（语义自查全部通过）** |

### 1.2 越界核验（硬性，全部满足）

| 禁止触碰文件 | `git diff 5252c3d~1 HEAD` 行数 |
|---|---|
| `docs/api/openapi.v1.yaml` | **0**（契约字节级零变更 ✅） |
| `src/db/schema.ts` | **0**（零 DB 迁移，决策 #2 ✅） |
| `src/db/migrate.ts` | **0** |
| `src/routes/files.ts` | **0**（`hash+ext` 兼容 `SAFE_KEY` + 反解 ext，无需改） |
| `src/routes/upload.ts` | **0** |

- `Attachment` 响应接口（契约）**未新增 `contentHash`**（grep `contentHash|content_hash` 在 `attachment.ts`/`storage.ts` 零命中）✅ 决策 #2 守住。
- `randomUUID` 已从 `storage.ts` 彻底移除（grep 零命中）✅。

---

## 二、三项修正逐条核验（对照指令稿）

### 2.1 P2-A · 缺失 id 恢复 404（守冻结契约）✅ 落实

**指令**：`attachment.ts` 事务内缺失即 `throw AppError(NOT_FOUND, 404)`；删掉已恒为 `true` 的 `found` 字段；测试 `:133-135` 由「断言 resolves」改为「断言 `rejects` 且 code=404」。

**代码实证**（`src/services/attachment.ts`）：
- `:130` `if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);` —— 事务内缺失即抛 404 ✅
- `:121` 事务返回类型现为 `{ storageKey: string; remaining: number }`，**`found` 字段已彻底移除**（类型更干净）✅
- `:131` 二次保险：`res.changes === 0 → throw 404`（覆盖并发删尽竞态）

**测试实证**（`test/services/attachment.test.ts`）：
- `:134-139` `await expect(deleteAttachment(9_999_999)).rejects.toMatchObject({ code: ErrCode.NOT_FOUND, httpStatus: 404 })` ✅

**根因链闭环**：原问题（editor 经 `guard('editor',…)` 的 `roleOk` 分支越过服务 → 旧 `deleteAttachment` 静默 resolve → 200，违反冻结契约 `:2297-2303`）已消除。

### 2.2 P3-1 · 孤儿竞态文档化接受（非阻塞）✅ 落实

**指令**：文档化接受，并在 `deleteAttachment` 物理删处补注释说明窗口 + 未来 `ref_count` 缓解方向。

**代码实证**（`src/services/attachment.ts` `:146-149`）：已补注释，精确说明「文件删除置于事务外（better-sqlite3 事务回调须同步）→ 极窄孤儿竞态窗口（并发上传相同字节恰逢删除间隙）→ 新行孤儿（重传即恢复）→ 未来 `ref_count` 列可根治」。与 owner「接受」裁决一致 ✅。

### 2.3 P3-2 · 守卫缺失 id 返回 404（全局纠偏）✅ 落实

**指令**：`guard()` 工厂区分 `null`（资源不存在→404）与"非归属者"（→403）；新增"resolveOwner 返回 null→404"用例。

**代码实证**（`src/middleware/auth.ts`）：
- `:58` `if (ownerId === null) throw new AppError(ErrCode.NOT_FOUND, 404);` —— 资源不存在→404 ✅
- `:59` `if (ownerId === user.id) return next();` —— 归属者放行（ownerOverride）✅
- `:61` `throw new AppError(ErrCode.FORBIDDEN, 403);` —— 存在但非归属者→403 ✅

**全局零回归判断**（复批额外核实）：`guard()` 被 `attachments`/`comments`/`articles` 三类带 `resolveOwner` 的资源共用，三者 `resolveOwner` 返回 `null` 语义**恒为"资源不存在"**，且契约既有约定"不存在→404"（comment/article 测试已断言 404）。本次改动是全局契约纠偏，非越界改契约 ✅。

**测试实证**（`test/middleware/guard.test.ts`）：
- `:60-63` 新增 `④(b) 资源不存在（resolveOwner 返回 null）→ 404` 用例 ✅
- `:50-53` 原有"非属主→403"用例保留无误伤 ✅（确认 `④(b)` 仅当 null 才转 404）

---

## 三、非阻塞 P3 建议（不阻断放行）

### P3-A（建议）· 路由级 e2e 测试缺「editor 经完整路由删缺失 id → 404」锁

`test/routes/users.test.ts:267-278` 的集成用例仅覆盖「删他人附件→403」「删自己→200」，**未覆盖「editor 角色经完整 HTTP 路由 `DELETE /attachments/{不存在}` → 404」**这一 P2-A 端到端路径。

当前该路径由两条单测间接锁死：`attachment.test.ts:135`（service 层 `deleteAttachment(9_999_999) rejects 404`）+ `guard.test.ts:60`（守卫 null→404）。editor 路径仅是透传 service 的 404，逻辑链无分支，故**回归风险已被 service 层单测吸收**，不构成缺陷。

**建议**（成本极低，约 10 行）：在 `test/routes/users.test.ts` 补一条「editor token + `DELETE /attachments/9999999` → 404」集成用例，使 P2-A 修复在集成层也有直接护栏。

### P3-B（极低优先级 PR 清理）· `storage.ts` 历史遗留注释

`src/shared/storage.ts:2` 注释仍为 `src/lib/storage.ts`（lib→shared 重构时未同步），与本次去重无关，建议顺手改为 `src/shared/storage.ts`。不属于本次责任，仅记录。

---

## 四、复批结论与前置条件

| 项 | 状态 |
|---|---|
| P1 内容寻址去重（storage.ts） | ✅ 落实，randomUUID 移除，get 复用 |
| P2-A 缺失 id→404（attachment.ts） | ✅ 落实，found 字段移除，测试断言 404 |
| P3 删除引用计数护栏（attachment.ts） | ✅ 落实，同步事务 + remaining 计数 |
| P3-1 孤儿竞态 | ✅ 文档化接受，注释到位 |
| P3-2 守卫 null→404（auth.ts） | ✅ 落实，全局零回归，新增守卫单测 |
| 越界（契约/schema/路由/响应） | ✅ 零触碰 |
| 五门门禁 | ✅ 全绿（tsc0 / biome0 / vitest 133 / 契约双门 33 OK） |
| 契约字节级 | ✅ 0 行 diff |

**裁定**：复批通过。三处修正全部兑现，门禁独立复跑全绿，契约字节级零变更。

**后续流程**：owner 对目录风格 + 去重行为做最终视觉确认 → 冻结 M1 后端主线 → 转「写 M1 后端文章」（M1-01~M1-30）。

P3-A / P3-B 为建议项，可在冻结后顺带处理，不阻塞当前放行。

---

*本复审批复与 `B-上传去重-后端代码审阅报告.md`（修正指令稿）、`08-上传去重-交付文档.md`（交付物）、`06-上传去重优化方案.md`、`07-上传去重-批次任务包.md` 互为表里。建议对照阅读。*
