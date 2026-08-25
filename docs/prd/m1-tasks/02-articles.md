# M1 后端 · 批次 B2：文章核心（Articles）

> 依赖 B1。本批是体量最大、最核心的一批，覆盖文章的增删改查、投稿、审核、阅读量。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/02-articles.md，在 B0/B1 基础上实现文章核心批次。
实现契约中 /api/v1/articles* 及 /api/v1/me/articles、/api/v1/admin/articles* 的全部 11 个端点。
严格遵循：公开列表/详情只返 published；状态转移矩阵 N9-2（见主计划 §3.4）；
阅读量去重按 §3.3 在本批合理实现并登记 NOTES。完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET    /api/v1/articles` → 公开列表，仅 `published`，分页 + 过滤（category/tag/keyword/author）
- `POST   /api/v1/articles` → 登录用户创建（默认 `draft`，见 02 §二；会员投稿亦可经 submit 转 `pending`）
- `GET    /api/v1/articles/{idOrSlug}` → 详情；匿名仅 `published`；owner/admin 可见任意状态
- `PUT    /api/v1/articles/{id}` → 更新；owner/admin
- `DELETE /api/v1/articles/{id}` → 删除；owner/admin
- `POST   /api/v1/articles/{id}/submit` → `draft→pending`（转移矩阵允许）
- `POST   /api/v1/articles/{id}/view` → 阅读量 +1（去重，见下方）
- `GET    /api/v1/me/articles` → 当前用户自己的文章（含非 published）
- `GET    /api/v1/admin/articles` → 后台列表（全状态，admin）
- `POST   /api/v1/admin/articles/{id}/approve` → `pending→published`（admin）
- `POST   /api/v1/admin/articles/{id}/status` → 状态切换（admin，受转移矩阵约束）

## 关键行为指引
- **状态转移矩阵（N9-2）**：`Article.status` 合法转移见契约 `Article.status.x-allowed-transitions`（draft→pending/published、pending→published/draft、published→draft/pending 共 6 条）。后端在写库前**强制校验**，非法转移返回 4xx + 对应业务码。
- **公开可见性铁律**：`GET /articles`（公开）忽略 status 只返 published；未发布详情/评论对匿名 404；后台筛选走 `GET /admin/articles`。
- **阅读量去重（§3.3 留契约外）**：本批实现"按 userId 或 IP + 24h 冷却去重计数"，写分离（计数可异步/最终一致）。**在 NOTES 登记实现方式**，后续由对应后端文章 PRD 层确认。不要过度设计，能跑通即可。
- `content` 以 Markdown 源文存储（02 §二）；`Article` 主 schema 的 `status` 与契约一致。
- 列表/详情响应字段对齐契约 `Article` schema（camelCase）。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：列表仅 published、匿名访问未发布详情 404、owner 可见、submit 转移、approve 转移、非法转移被拒、view 计数去重。
3. 逐端点核对响应字段/状态码/`error.code` 与契约一致。
4. N9-2 矩阵在测试中至少覆盖 2 条合法 + 1 条非法。

## 禁止项
- 不改契约；不新增 error.code。
- 不在本批实现 adjacent/related/toc/like（属 B7/B6）。

## 交付物
- `src/routes/articles.ts` + `src/db/schema.ts` 的 `articles` 表（对齐 02 §二）。
- 一个 commit：`M1 B2 文章核心端点 + 测试`。
- NOTES：阅读量去重实现、状态默认值选择（draft 还是创建即 pending）及理由。
