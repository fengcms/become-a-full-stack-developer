# B-上传去重 · 后端代码审阅报告（含开发 AI 修正指令）

> 审阅人角色：BackendArchitect（仅审查、给结论、写报告；不实现代码）
> 被审交付物：`docs/node-backend/08-上传去重-交付文档.md`（开发 AI 交付）+ 实际代码（`5252c3d`）
> 设计基线：`06-上传去重优化方案.md` + `07-上传去重-批次任务包.md`（owner 2026-08-26 决策：全局 / 不做 content_hash 列 / 不做 backfill / 接受同字节异 ext）
> 关联契约：`docs/api/openapi.v1.yaml`（冻结 v1.11.0 / 文档 v1.14）
> 审阅日期：2026-08-26　|　修正指令裁定日期：2026-08-26（owner 已对 P2/P3 逐项裁决）

---

## 〇、裁定结论与 owner 裁决

**审查通过；核心去重达标、五门门禁独立复验全绿、契约字节级零变更。** 原报告提出 1 项 P2 + 2 项 P3，owner 已逐项裁决，本条即最终修正指令：

| 项 | 性质 | owner 裁决 | 是否阻塞冻结 |
|---|---|---|---|
| **P2** | 删「不存在 id」行为偏离冻结契约（404→200） | **方案 A**：恢复 404 | ✅ 冻结前置，必须修 |
| **P3-1** | 孤儿竞态（事务外删文件，固有局限） | **接受**，文档化 | ❌ 非阻塞 |
| **P3-2** | 守卫对「缺失 id」返回 403 而非契约 404 | **要求开发 AI 修复** | ✅ 冻结前置，必须修 |

开发 AI 据此文档「三、修正指令」执行，完成后申请架构师复批（见「四、复批门禁」）。

---

## 一、独立复验证据（五门门禁 + 契约双门，不采信自陈）

| 门 | 命令 / 工具 | 结果 |
|---|---|---|
| typecheck | `pnpm typecheck`（`tsc --noEmit`） | **0 error** |
| lint | `pnpm lint`（`biome check .`） | **0 problem**（**113 文件**） |
| 单元/集成 | `pnpm test`（`vitest run`） | **132 passed**（126 既有 + 6 新增全绿） |
| 契约结构门 | `openapi-spec-validator docs/api/openapi.v1.yaml` | **OK** |
| 契约语义门 | `python docs/api/check_contract.py` | **语义自查全部通过（33 OK）** |
| 契约字节级 | `git diff --stat HEAD~1 HEAD -- docs/api/openapi.v1.yaml` | **0 行**（空输出 ✅） |

> 门禁结果与交付自陈一致；契约双门独立复跑确认，yaml 字节级未改。

### 越界 / 铁律核验（磁盘证据）

| 核验项 | 证据 | 结论 |
|---|---|---|
| 改动文件收敛 | `git diff` 仅 `storage.ts`(+10) / `attachment.ts`(+52) / `attachment.test.ts`(+136) + 文档 | ✅ 仅 2 源文件 + 1 测试 |
| 契约零变更 | 上表 yaml 0 行 diff | ✅ |
| 无 DB 迁移 | `src/db/schema.ts` / `src/db/migrate.ts` diff = 0 行 | ✅ 决策 #2（不做列）守住 |
| 路由零改动 | `src/routes/files.ts` / `src/routes/upload.ts` diff = 0 行 | ✅ |
| 响应未泄漏 contentHash | `attachment.ts` / `storage.ts` grep `contentHash\|content_hash` → 无命中 | ✅ 决策 #2 守住 |
| P1：randomUUID 清除 | `grep randomUUID src/shared/storage.ts` → 无命中 | ✅ |
| P1：内容寻址 + 复用 | `storage.ts` import createHash；`sha256(...)+ext`；`this.get(key)` 命中复用 | ✅ |
| P3：事务内计数 | `attachment.ts` `getDb().transaction(syncFn)` 内含「读行→删行→count 兄弟」 | ✅ |

---

## 二、问题根因（作为修正依据）

### P2 根因（删「不存在 id」→ 200，违反契约）
`deleteAttachment`（`attachment.ts`）对缺失 id 静默 resolve：
- `attachment.ts:131` `if (!row) return { found: false, remaining: 0 };` → 缺失不抛错
- `attachment.ts:146` `if (!result.found || result.remaining !== 0) return;` → 直接 resolve

而 `DELETE /attachments/{id}` 接线 `guard('editor', resolveAttachmentOwner')`（`upload.ts:106`）。守卫逻辑（`auth.ts:53-54`）：`roleOk` 满足即 `return next()`——**editor/admin 删不存在的 id 时守卫直接放行**，直达 `deleteAttachment`；新实现 resolve → 路由 `return ok({})` → **HTTP 200**。

契约 `:2297-2303` 明确要求「**404 附件不存在**」。原实现 `if (res.changes === 0) throw 404` 正是为该场景返回 404，且经路由可达；新实现删除了该路径 → 契约 404 在 editor 路径上消失。开发 AI 在 `08` 文档将「删不存在 id resolves」作为预期行为写入并加测试，但**未标注为契约影响偏差**（不同于对 sync 事务偏差的显式标注），属静默行为变更——在契约冻结铁律下不应由开发 AI 单边决定。

### P3-2 根因（守卫缺失 id → 403，违反契约）
`guard()` 工厂（`auth.ts:56-60`）：当 `resolveOwner` 返回 `null`（资源不存在）时，落入 `throw new AppError(ErrCode.FORBIDDEN, 403)`。即 **member 删不存在的 id 返回 403，而非契约 404**。

此行为在本次去重改动**之前**已存在（原 `deleteAttachment` 的 404 仅 editor 路径经路由可达；member 路径始终被守卫 403 拦截）。本次去重使 editor 路径也失去 404 → **所有路径**删缺失 id 均不返回契约 404（editor→200、member→403）。属既有契约-实现偏差，须修复。

**修复范围判定（重要，避免越界误判）**：`guard()` 是共享工厂，被 `attachments`/`comments`/`articles` 三类带 `resolveOwner` 的资源共用（仅这三类传 `resolveOwner`；`guard('editor')` 等不传的不进入该分支，不受影响）。已逐个核对：
- `getAttachmentOwnerId`（`attachment.ts:104-115`）：行缺失 → 返回 `null`；
- `resolveCommentOwner` / `resolveArticleOwner`：同模式，行缺失 → `null`。
即 `null` 在这三类语义恒为"资源不存在"。契约既有约定"不存在→404"（comments/articles 测试已断言 404）。故将 `null → 404` 是**全局契约纠偏、零回归**，且 `guard.test.ts` ④(b) 用的是"非归属者"（`() => 'u1'` 配 `u2`），属"存在但非 owner → 403"，改动保留该 403，不误伤。

---

## 三、开发 AI 修正指令（owner 已裁决，照此执行）

### 任务 1（P2 · 方案 A）— 恢复「缺失 id → 404」

**文件**：`src/services/attachment.ts`　**方法**：`deleteAttachment`（约 `:117-153`）

将事务回调改为：缺失即抛 `NOT_FOUND(404)`；并去掉已恒为 `true` 的 `found` 字段，使类型与逻辑一致。目标代码：

```ts
/** DELETE /attachments/:id — 同步事务内删行 + 数同 storageKey 兄弟行；仅 0 引用才真删物理文件（去重后防孤儿文件）。 */
export const deleteAttachment = async (id: number): Promise<void> => {
  // better-sqlite3 事务回调须同步（不能 async）：DB 的「删行 + 数兄弟」原子化，消除并发交错窗口。
  // 异步的文件删除放到事务外做 best-effort（失败不阻塞行删除，与双存储边界一致）。
  const result = getDb().transaction(
    (tx): { storageKey: string; remaining: number } => {
      const row = (
        tx
          .select({ storageKey: attachments.storageKey })
          .from(attachments)
          .where(eq(attachments.id, id))
          .limit(1)
          .all() as { storageKey: string }[]
      )[0];
      if (!row) throw new AppError(ErrCode.NOT_FOUND, 404); // 缺失 → 404（守冻结契约，不静默 resolve）
      const res = tx.delete(attachments).where(eq(attachments.id, id)).run();
      if (res.changes === 0) throw new AppError(ErrCode.NOT_FOUND, 404);
      const remaining =
        (
          tx
            .select({ c: sql<number>`count(*)` })
            .from(attachments)
            .where(eq(attachments.storageKey, row.storageKey))
            .all() as { c: number }[]
        )[0]?.c ?? 0;
      return { storageKey: row.storageKey, remaining };
    },
  );

  if (result.remaining !== 0) return; // 仍有引用 → 不删物理文件
  // 仅无人引用才真删物理文件（双存储适配层：失败不阻塞行删除）
  try {
    await createStorage(getActiveEnv()).delete(result.storageKey);
  } catch {
    // 底层删除失败不阻塞行删除（双存储适配层真实边界）
  }
};
```

> 同步事务内抛 `AppError` 会触发 better-sqlite3 回滚并原样重抛，路由错误中间件转 404。无需新增 import（`AppError`/`ErrCode` 已导入）。

**测试配套**：`test/services/attachment.test.ts`

- 顶部新增 import：`import { ErrCode } from '@/shared/codes';`
- 将 `:133-135` 的「deleting non-existent id is idempotent」用例改为断言 404：

```ts
  it('deleting non-existent id returns 404 (contract-compliant)', async () => {
    await expect(deleteAttachment(9_999_999)).rejects.toMatchObject({
      code: ErrCode.NOT_FOUND,
      httpStatus: 404,
    });
  });
```

### 任务 2（P3-2）— 守卫「缺失 id → 404」（全局纠偏）

**文件**：`src/middleware/auth.ts`　**方法**：`guard` 工厂（`:56-60`）

将 `null` 与"非归属者"区分：资源不存在抛 `NOT_FOUND(404)`，存在但非归属者仍 `FORBIDDEN(403)`。目标代码：

```ts
    if (resolveOwner) {
      const ownerId = await resolveOwner(c);
      if (ownerId === null) throw new AppError(ErrCode.NOT_FOUND, 404); // 资源不存在 → 404（守契约，优于 403）
      if (ownerId === user.id) return next(); // 归属者放行（ownerOverride）
      throw new AppError(ErrCode.FORBIDDEN, 403); // 存在但非归属者 → 403（④(b)）
    }
    throw new AppError(ErrCode.FORBIDDEN, 403);
```

**影响面说明**（开发 AI 须知悉并自查）：此改为守卫工厂级修正，对 `attachments`/`comments`/`articles` 三类带 `resolveOwner` 的资源统一生效——**member 删"不存在的"对应资源将由 403 变为 404**，这与契约"不存在→404"既有一致（comments/articles 测试已断言 404），属正确纠偏，非回归。完成 `pnpm test` 全绿即证明无破坏；若历史上有误断言"缺失→403"的用例，应同步改为 404（契约正确优先）。

**测试配套（锁定修正）**：`test/middleware/guard.test.ts`

- `buildApp` 内新增一条返回 `null` 的路由：
```ts
  app.get('/missing', guard('admin', () => null), (c) => c.json({ ok: true }));
```
- 新增用例：
```ts
  it('④(b) 资源不存在（resolveOwner 返回 null）→ 404', async () => {
    const res = await buildApp({ id: 'u2', role: 'member' }).request('/missing');
    expect(res.status).toBe(404);
  });
```

### 任务 3（P3-1 · 接受，非阻塞）— 文档化孤儿竞态

P3-1（事务外删文件导致极窄孤儿竞态）owner 已**接受**，不作功能阻塞。但开发 AI 须在 `deleteAttachment` 的物理删除处（`result.remaining !== 0` 之后、`createStorage().delete(...)` 之前）补一句注释，说明：
- 文件删除在事务外（better-sqlite3 事务回调须同步，异步删文件会抛 "Transaction function cannot return a promise"）；
- 存在极窄孤儿竞态窗口（并发上传相同字节恰逢删除间隙 → 新行孤儿，后果轻微、重传即恢复）；
- 缓解方向：未来若引入 `ref_count` 列（需迁移，owner 当前否决）可在事务内计数并裁决删除。
并在交付文档 `08` §二 补「文件删除置于事务外 → 孤儿竞态窗口」一句使偏差透明。

### 任务 4（P4）— 五门门禁复绿（同原批次）

`typecheck` / `lint` / `vitest`（须 **≥132 passed**）/ 契约结构门 OK / 契约语义门 33 OK，且 `git diff` 确认 `openapi.v1.yaml` **字节级 0 行变更**。

---

## 四、复批门禁（开发 AI 完成后申请架构师复验）

架构师独立复跑以下，全部通过方可复批：

1. 五门门禁全绿（tsc0 / biome0 / vitest ≥132 / 契约双门 OK）；
2. `openapi.v1.yaml` 字节级 0 diff（零契约变更铁律守住）；
3. **P2 回归**：`DELETE` 缺失 id（editor 路径）返回 **404**（非 200）；
4. **P3-2 回归**：`guard` 缺失资源返回 **404**（`guard.test.ts` 新用例绿；comments/articles 既有 404 用例不受影响）；
5. 改动文件仍严格收敛（`attachment.ts` / `auth.ts` / 2 个测试文件），未触碰 `openapi.v1.yaml` / `schema.ts` / `migrate.ts` / `routes/*` / `storage.ts` / `upload.ts`。

复批通过 → owner 视觉确认 → 冻结 M1 后端主线（去重作为已冻结主线内的收口优化）。

---

## 五、原始发现记录（供追溯）

- **P2（已裁决方案 A）**：删「不存在 id」行为 404→200，违反冻结契约；根因 `deleteAttachment` 静默 resolve + editor 守卫放行。
- **P3-1（已接受）**：孤儿竞态，better-sqlite3 同步事务约束下的固有代价，无迁移路径，文档化接受。
- **P3-2（已裁决修复）**：守卫 `null → 403` 违反契约"不存在→404"；根因 `guard` 工厂未区分 `null`（不存在）与"非归属者"；修复为全局守卫纠偏。

---

*本审阅为独立 review，所有结论附磁盘证据（grep 行号、git diff、门禁复跑输出、契约双门），不采信交付自陈。修正指令经 owner 逐项裁决，开发 AI 照「三」执行后申请复批。*
