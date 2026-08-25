# M1 后端 · 批次 B4：评论（Comments）

> 依赖 B1、B2。评论挂在文章下，含三态审核。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/04-comments.md，实现评论批次。
实现契约 /api/v1/articles/{idOrSlug}/comments、/api/v1/comments*、/api/v1/admin/comments 的全部 5 个端点。
重点：会员投稿默认 reviewing 态（管理员兜底态），approved 才对公开可见；admin 可改状态。
完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET    /api/v1/articles/{idOrSlug}/comments` → 列表（公开仅 `approved`；owner/admin 可见全部）
- `POST   /api/v1/articles/{idOrSlug}/comments` → 登录用户发表（默认 `reviewing` 态，见下）
- `DELETE /api/v1/comments/{id}` → 删除（评论 owner 或 admin）
- `PATCH  /api/v1/comments/{id}/status` → 改状态（admin：approved/rejected）
- `GET    /api/v1/admin/comments` → 后台列表（全状态，admin）

## 关键行为指引
- **评论三态**（02 §二，契约未机器化）：`approved` / `rejected` / `reviewing`。会员投稿默认 `reviewing`（管理员兜底态），仅 `approved` 对公开可见。
- 敏感词过滤：本批实现基础过滤（命中则转 reviewing 或拒绝，选一种写 NOTES），不追求完整词库。
- 删除评论级联处理其回复（如有嵌套；本契约评论为单层，按单层实现）。
- 授权：发表需登录；改状态仅 admin；删自己或 admin。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：发表默认 reviewing、公开列表仅见 approved、admin 改 approved/rejected、删自己/他人(403)、未登录发表 401。
3. 逐端点核对响应与契约一致。

## 禁止项
- 不改契约；不新增 error.code。

## 交付物
- `src/routes/comments.ts` + schema 的 `comments` 表（对齐 02 §二，含 status/articleId/authorId/content）。
- 一个 commit：`M1 B4 评论端点 + 测试`。
- NOTES：默认态选择理由、敏感词过滤策略。
