# M1 后端 · 批次 B6：收藏 / 历史 / 点赞 / 通知（Favorites, History, Likes, Notifications）

> 依赖 B1、B2。四组"以用户为中心"的轻量功能，均只操作当前登录用户自身数据。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/06-favorites-notifications.md，实现收藏/历史/点赞/通知批次。
实现契约 /api/v1/me/favorites*、/api/v1/me/history*、/api/v1/articles/{id}/like、/api/v1/articles/{id}/like/status、
/api/v1/me/likes、/api/v1/me/notifications* 的全部 15 个端点（含 DELETE /me/history 清空历史、DELETE /articles/{id}/like 取消点赞）。
重点：history upsert 唯写路径、like 与 unlike 两个幂等操作、notification 未读计数与已读。完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET    /api/v1/me/favorites` → 我的收藏列表
- `POST   /api/v1/me/favorites` → 收藏某文章
- `DELETE /api/v1/me/favorites/{articleId}` → 取消收藏
- `GET    /api/v1/me/history` → 我的阅读历史
- `POST   /api/v1/me/history` → 记录阅读（upsert 唯写路径，见下）
- `DELETE /api/v1/me/history/{articleId}` → 删单条历史
- `DELETE /api/v1/me/history` → 清空我的全部阅读历史（`clearMyHistory`，`x-idempotent`）
- `POST   /api/v1/articles/{id}/like` → 点赞（`likeArticle`，幂等：已赞仍成功）
- `DELETE /api/v1/articles/{id}/like` → 取消点赞（`unlikeArticle`，幂等：未赞仍成功）
- `GET    /api/v1/articles/{id}/like/status` → 当前用户对该文点赞状态
- `GET    /api/v1/me/likes` → 我点过赞的文章列表
- `GET    /api/v1/me/notifications` → 我的通知列表（分页）
- `GET    /api/v1/me/notifications/unread-count` → 未读计数
- `POST   /api/v1/me/notifications/read-all` → 全部标记已读
- `PATCH  /api/v1/me/notifications/{id}` → 标记单条已读

## 关键行为指引
- **阅读历史唯写路径**：`POST /me/history` 用 upsert（同用户+同文章只更新 `viewedAt`），`view` 字段只增计数（与 B2 的 view 计数分工：B2 管文章总阅读量，本批管用户历史）。
- **点赞与取消是两个幂等操作**：`POST /like`（`likeArticle`，已赞仍成功）+ `DELETE /like`（`unlikeArticle`，未赞仍成功），`like/status` 与 `me/likes` 供前端查状态。不要用单个 `POST` 做"切换"语义，否则与契约 `unlikeArticle` 端点重复定义。
- **通知**：`Notification` 实体（02 §二）。本批实现"查/未读计数/已读"；通知的**生成**逻辑（如文章被审核通过时通知作者）可在对应业务批次或后续补，本批先把读取端做通，生成端留 NOTES 待补。
- 所有端点严格限定 `c.set('user').id` 自身数据，越权访问返回 403/404。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：收藏增删查、history upsert 不重复、like 切换与状态、notification 未读计数随已读变化、越权访问他人数据被拒。
3. 逐端点核对响应与契约一致。

## 禁止项
- 不改契约；不新增 error.code。
- 不在本批实现通知的自动生成（仅做读取端，生成逻辑 NOTES 登记）。

## 交付物
- `src/routes/favorites.ts` + `src/routes/notifications.ts` + schema 的 `favorites`/`view_history`/`likes`/`notifications` 表。
- 一个 commit：`M1 B6 收藏历史点赞通知端点 + 测试`。
- NOTES：通知生成逻辑的后续归属建议。
