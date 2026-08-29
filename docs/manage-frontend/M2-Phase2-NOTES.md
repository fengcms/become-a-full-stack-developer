# M2 Phase 2 · 评论审核模块 · 交付与 NOTES

> 批次：Phase 2（评论审核，任务卡 #14）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint 绿 ✅ / **test 33 passed**（新增 5）✅ / build 绿 ✅

---

## 一、本批交付物

| 模块 | 文件 | 说明 |
|---|---|---|
| 评论 API | `src/api/comments.ts` | 端点按契约实现（见 §2 偏差说明） |
| 评论 Hooks | `src/hooks/useComments.ts` | 审核/回复/删除三 mutation，写后失效 `['comments']` |
| 列表页 | `src/pages/comments/CommentListPage.tsx` | DataTable（刻意不传 sort） |
| 审核弹窗 | `src/pages/comments/CommentReviewDialog.tsx` | `PATCH /comments/{id}/status`，reason 可选 |
| 回复弹窗 | `src/pages/comments/CommentReplyDialog.tsx` | `POST /articles/{idOrSlug}/comments`（parentId 回复） |
| 令牌 | `src/index.css` | 评论三态 `status-approved/rejected/reviewing`（明暗各一套） |
| 路由 | `src/router/index.tsx` | `/comments` 占位换真实页 |
| 守卫测试 | `src/api/comments.test.ts` | 5 用例，钉死端点路径 |

---

## 二、🔴 计划与契约偏差（重要，按契约实现）

`M2-开发计划.md` §5 写的 `POST /admin/comments`（代回复）与 `DELETE /admin/comments/{id}` **契约里不存在**——`/admin/comments` 只有 GET。真实端点（以 `openapi.v1.yaml` 为唯一真相）：

| 操作 | 端点 | 角色 | 备注 |
|---|---|---|---|
| 列表 | `GET /admin/comments` | editor+ | query: page/pageSize/status/articleId，**无 sort** |
| 审核 | `PATCH /comments/{id}/status` | editor+ | body `{status, reason?}`；reviewing 唯一进出路径；置 approved 后端清 rejectedReason |
| 代回复 | `POST /articles/{idOrSlug}/comments` | member+ | 传 parentId 即回复；返回值**可能 rejected** |
| 删除 | `DELETE /comments/{id}` | editor + ownerOverride | `x-cascade: children` 级联删子回复 |

> 偏差已写进 `src/api/comments.ts` 文件头，并用 `comments.test.ts` 钉死路径，防后人照计划文档「修正」成 404。

---

## 三、关键设计

- **契约不支持 sort → DataTable 刻意不传 sort**（传了也是被忽略的无效参数）。
- **`Comment` 无 articleTitle 字段** → 「所属文章」列显示 `#articleId` 并跳文章编辑页。
- **代回复不做乐观插入**：契约返回值可能 `rejected`，故就地提示且不插入列表。
- **三态令牌前置**：approved/rejected/reviewing 用语义令牌，与文章状态令牌同源。

---

## 四、运行方式

随 `pnpm dev` 访问 `/comments`；`pnpm test` 含 `comments.test.ts`（5 用例，验证 4 端点路径与 rejected 处理）。

---

## 五、待总把控留意 / 回流项

- 未改动契约；偏差仅记文件头 + 测试。
- 下一阶段：Phase 3 分类树 + 标签（#13）。
