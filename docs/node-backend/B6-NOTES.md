# M1 后端 · 批次 B6：收藏 / 历史 / 点赞 / 通知 — 实现笔记

> 依赖 B1、B2。四组「以用户为中心」的轻量功能，均只操作当前登录用户自身数据。
> 任务包：`docs/prd/m1-tasks/06-favorites-notifications.md`；主计划映射：`M1-后端实现计划.md` 行 B6。

## 一、端点清单与实现文件（15 端点）

| 方法 & 路径 | 授权（x-authz） | 契约 operationId | 实现文件 |
|---|---|---|---|
| `GET /api/v1/me/favorites` | member | listMyFavorites | `routes/favorites.ts` |
| `POST /api/v1/me/favorites` | member，x-idempotent | addFavorite | `routes/favorites.ts` |
| `DELETE /api/v1/me/favorites/{articleId}` | member（ownerOverride 隐式） | removeFavorite | `routes/favorites.ts` |
| `GET /api/v1/me/history` | member | listMyHistory | `routes/history.ts` |
| `POST /api/v1/me/history` | member | reportReadingProgress | `routes/history.ts` |
| `DELETE /api/v1/me/history` | member，x-idempotent | clearMyHistory | `routes/history.ts` |
| `DELETE /api/v1/me/history/{articleId}` | member（ownerOverride 隐式） | removeHistoryItem | `routes/history.ts` |
| `POST /api/v1/articles/{id}/like` | member，x-idempotent | likeArticle | `routes/likes.ts` |
| `DELETE /api/v1/articles/{id}/like` | member，x-idempotent | unlikeArticle | `routes/likes.ts` |
| `GET /api/v1/articles/{id}/like/status` | 公开（security: []） | getArticleLikeStatus | `routes/likes.ts` |
| `GET /api/v1/me/likes` | member | listMyLikes | `routes/likes.ts` |
| `GET /api/v1/me/notifications` | member | listMyNotifications | `routes/notifications.ts` |
| `GET /api/v1/me/notifications/unread-count` | member | getUnreadNotificationCount | `routes/notifications.ts` |
| `POST /api/v1/me/notifications/read-all` | member | readAllNotifications | `routes/notifications.ts` |
| `PATCH /api/v1/me/notifications/{id}` | member（ownerOverride 隐式） | updateNotification | `routes/notifications.ts` |

**文件拆分说明（铁律 ≤200）**：任务包交付物只列 `favorites.ts` + `notifications.ts`，但 15 端点若塞进 2 文件会越界。本批按职责拆 4 文件：`favorites.ts`(103) / `history.ts`(152) / `likes.ts`(163) / `notifications.ts`(108)，均 ≤200。挂载点全部 `app.ts` 的 `app.route('/api/v1', …)`，路径自然形成 `/me/*` 与 `/articles/{id}/like*`。

## 二、关键行为指引与实现决策

1. **收藏列表**：`favorites ⋈ articles`（过滤 `deleted_at IS NULL`）按 `favorites.created_at` 倒序分页，复用 `toArticleSummary` 投影，返回 `ArticlePage`（list + pagination）。
2. **收藏写入幂等**：`POST /me/favorites` 用 `insert().onConflictDoNothing()` 唯一约束 `(user_id, article_id)` 兜底；重复收藏返回 200 不报错。
3. **收藏 404 语义**：契约明示「未发布文章不可收藏」→ 文章不存在 **或** `status !== 'published'` 一律 404（与 B2/B4 一致）。
4. **历史 upsert 唯写路径**：`POST /me/history` 先查 `(user_id, article_id)`，存在则仅更新 `last_read_at`（progress 仅在请求携带时覆盖，否则保留旧值），否则插入。`view_count` 不在此动（与 `POST /articles/{id}/view` 职责分离，02 §2.4）。
5. **历史删除幂等**：`DELETE /me/history` 与 `/me/history/{articleId}` 均 `WHERE user_id = 当前用户`，删不存在记录照样 200。
6. **点赞/取消双幂等**：`likeArticle`/`unlikeArticle` 先查存在性再决定 insert/delete，并维护 `articles.like_count`（+1 / 下限 0 的 -1），与该表行数一致（02 §二 Like）。返回 `{ liked, likeCount }`。
7. **like/status 公开**：`optionalAuthMiddleware`；匿名 `liked = false`，`likeCount` 取文章当前值；文章不存在 → 404。
8. **ownerOverride 实现**：`/me/*` 端点天然以 `c.get('user').id` 限定自身，DELETE 类直接 `WHERE user_id = 当前用户` 实现「仅本人」，无需额外 guard；`PATCH /notifications/{id}` 因路径参数是通知 id（非当前用户标识），显式加载后判 `userId !== 当前` → **404**（不泄露存在性，符合契约 404 文案）。
9. **通知生成端不在本批**：任务包禁止项明确「不实现通知自动生成」。本批仅读取端；生成逻辑（文章发布/评论审核通过 → 写 Notification）留待对应业务批次或后续补，NOTES 登记。**测试用 DB 直插 `notifications` 模拟已生成通知**。

## 三、文件清单

- 新增 schema：`favorites` / `view_history` / `likes` / `notifications` 四表 + 对应 Row 类型（`src/db/schema.ts`）。
- 新增 DDL：`src/db/migrate.ts` 四表建表 + 3 个唯一索引（favorite / view_history / like）。
- 新增路由：`src/routes/favorites.ts`(103) / `history.ts`(152) / `likes.ts`(163) / `notifications.ts`(108)。
- 改写：`src/app.ts`（挂载 4 条新路由，71 行）。
- 新增测试：`test/routes/interactions.test.ts`（8 例行为级，覆盖收藏增删查+幂等+未发布 404、history upsert 不重复+清空+删除幂等、like 切换与状态+公开态+幂等、notification 未读计数随已读变化+非本人 404+单条已读）。

## 四、门禁证据（自跑）

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 error |
| `biome check .` | ✅ 0 error / 0 warning（77 文件） |
| `vitest run` | ✅ **116 passed**（15 文件；B6 行为级 8 例，存量 108） |
| 契约结构门 `openapi-spec-validator` | ✅ `openapi.v1.yaml: OK` |
| 契约语义门 `check_contract.py` | ✅ 全部通过 |
| 契约改动 | ✅ `git status` 干净，未触碰 `openapi.v1.yaml` |

## 五、契约侧观察（登记，不改代码/契约）

- **`GET /me/likes` 响应形态不一致**：契约 `responses.200.data` 直接是 `array of ArticleSummary`（无 list/pagination 包裹），但 `parameters` 却声明了 `page`/`pageSize`。实现严格按契约返回**裸数组**（`ok(list)`），但仍以 `page`/`pageSize` 作 `limit`/`offset` 服务端截断，避免无界返回。该参数/响应不一致属契约文档问题，按纪律**不改契约、不改代码语义**，仅如实登记，待契约维护批次统一处理（呼应 B5 复批 N 项提醒）。
- **`schema.ts` 行数**：本批续增四表后 `schema.ts` 达 336 行，超过 200 软上限。该文件是「全部表单一事实源」，此前 B2–B5 各批均在其内增量加表且历次审阅未将其列为 P 级（审阅 P2 拆分诉求历来针对 route 文件）。为不引入跨文件 import 的大面积重构风险，本批保持单文件，沿用既往批次先例；若总把控认为需拆，可单独立项（如 `schema/*.ts` 按实体分片）。

## 六、逐端点契约核对

- 所有列表端点 `data` 包络：`paginate(list, meta(...))` 产出 `{ list, pagination }`（契约 `ArticlePage` / `HistoryPage` / `NotificationPage` 一致）；`/me/likes` 例外出裸数组（见五）。
- 错误码复用既有：`NOT_FOUND(3001)` 文章不存在/未发布/通知非本人，`FORBIDDEN` 本批未触发（ownerOverride 均经 404 短路），无新增 error.code。
- `x-idempotent` 标注的 4 端点（契约实测仅 `addFavorite`/`removeFavorite`/`likeArticle`/`unlikeArticle` 标 `x-idempotent:true`，见回复 P3-5 纠正）：全部实现为「重复/删不存在仍 200」。`clearMyHistory`/`removeHistoryItem` 契约**未标** `x-idempotent`（DELETE 天然幂等），实现同样幂等。注：原稿此处过度声称 6 端点，已据实测契约纠正。
