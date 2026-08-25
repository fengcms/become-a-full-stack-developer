# M1 后端 · 批次 B4：评论（Comments）交付说明

> 批次：B4（评论，5 端点）｜依据：`docs/prd/m1-tasks/04-comments.md` + 契约 `openapi.v1.yaml` v1.11.0
> 审阅基线：B3.5 复批已正式放行 B4（评论，按 `04-comments.md`，不碰 articles.ts）
> 状态：代码已落地工作区，待总把控独立复验

## 一、端点 ↔ 契约映射

| 方法 & 路径 | 授权（x-authz） | 契约 operationId | 实现文件 |
|---|---|---|---|
| `GET /api/v1/articles/{idOrSlug}/comments` | 可选鉴权（security: [{}, bearerAuth]） | listArticleComments | `routes/comments-read.ts` |
| `POST /api/v1/articles/{idOrSlug}/comments` | member（x-authz.minRole: member） | createComment | `routes/comments-write.ts` |
| `DELETE /api/v1/comments/{id}` | editor + ownerOverride（userId） + x-cascade: children | deleteComment | `routes/comments-write.ts` |
| `PATCH /api/v1/comments/{id}/status` | editor（x-authz.minRole: editor） | moderateComment | `routes/comments-write.ts` |
| `GET /api/v1/admin/comments` | editor（x-authz.minRole: editor） | listAdminComments | `routes/comments-read.ts` |

5 端点按读/写拆分为 `comments-read.ts`（2 个 GET）+ `comments-write.ts`（POST/DELETE/PATCH），均 ≤200 行（铁律）；二者在 `app.ts` 同挂 `/api/v1`。共享查询辅助 `resolveArticle` / `userNameOf` 抽到 `lib/comment-query.ts`（与 `lib/article.ts` 同源模式，避免路由文件互相 import）。读取与写路由内部路径 `/articles/:idOrSlug/comments`、`/comments/:id`、`/comments/:id/status`、`/admin/comments` 区分，严格遵守"不碰 articles.ts"边界。

## 二、关键行为决策

### 1. 默认态：approved / rejected（按契约，非任务包）
任务包 `04-comments.md` 写"会员投稿默认 reviewing"，但**冻结契约** `Comment` schema 与 `createComment` 描述明确：
> 自动流只产出 approved / rejected；reviewing 仅能由 `PATCH /comments/{id}/status`（admin）置位与移出。

两者冲突。**契约是七端共同地基、实现不得偏离**，故以契约为准：发表走敏感词自动流 → `approved`（干净）或 `rejected`（违规比率超阈值），**不产生 reviewing**。reviewing 仅由 `PATCH` 人工置位，且是它唯一的进出路径（修复第三轮复审 P1 的死胡同态）。任务包"默认 reviewing"视为被契约覆盖，已在此登记偏差。

### 2. 敏感词过滤策略（基础版，不追求完整词库）
- `lib/comment.ts` 维护 `SENSITIVE_WORDS` 基础演示词库（如 `广告 / spam / fuck / shit / 垃圾 / 代开发票`）。
- `moderateContent(raw)`：命中词整体替换为**等长星号**（`*` 重复匹配长度）；统计命中字符数，算违规比率 `命中字符数 / 原文长度`。
- 比率 > `REJECT_RATIO`(0.3) → `rejected`；否则 `approved`。阈值 0.3 为可解释默认（单条短评论命中即易超阈，长评论零星命中仍放行）。
- 存库的是**已转义后的展示文本**（契约 Comment.content "已做敏感词转星号处理"），原始违规文本不落库。
- 返回体 `data.status` 透出判定结果；`rejected` 时前端应就地提示且不要插入公开列表。

### 3. 公开列表恒只返 approved（语义铁律）
`listArticleComments` 无论调用者身份（匿名/作者/admin）一律 `WHERE status='approved'`。`reviewing` / `rejected` 仅经 `GET /admin/comments` 可见。
- 未发布文章：匿名 → 404（隐瞒存在性）；**文章作者本人 / admin** 可读取其评论列表（仍只 approved，与契约"对任何调用者都一样"一致）。
- 不可对未发布文章评论（POST 命中未发布 → 404）。

### 4. 级联删除（x-cascade: children）
`DELETE /comments/:id`：先 `DELETE ... WHERE parent_id = :id`（清子回复），再删自身。避免孤儿回复。无嵌套层级（本契约评论单层），故仅一层子回复需要清理。

### 5. 授权矩阵
| 动作 | 放行条件 |
|---|---|
| 发表 | 登录（member+） |
| 改状态 | editor / admin（member → 403） |
| 删自己 | owner（userId == 当前用户），含 member |
| 删他人 | editor / admin |
| 后台列表 | editor / admin |

`ownerOverride` 通过 `guard('editor', resolveCommentOwner)` 实现：`resolveCommentOwner` 加载评论、缺失直接抛 404（非 403）、返回 `String(cm.userId)` 供 `guard` 比对当前用户。不引入 `c.set('comment')` 自定义变量（避免破坏 `AuthVars` 类型，见 B4 修复轮）。DELETE 存在性由 `run()` 返回的 `changes === 0` 判定，不在 handler 内重复查库（P3-2 优化）。

## 三、文件清单

- 新增：`src/db/schema.ts`（comments 表 + CommentRow/CommentStatus）、`src/db/migrate.ts`（comments DDL）、`src/lib/comment.ts`（敏感词过滤/序列化/入参 schema）、`src/lib/comment-query.ts`（共享查询辅助 `resolveArticle` / `userNameOf`）、`src/routes/comments-read.ts`（2 个 GET，72 行）、`src/routes/comments-write.ts`（POST/DELETE/PATCH，127 行）、`test/routes/comments.test.ts`（12 例行为级测试，含 2 例 parentId 校验）
- 改动：`src/app.ts`（同挂 `commentsReadRoute` + `commentsWriteRoute` 于 `/api/v1`）
- 未动：articles 系列路由（严格遵守"不碰 articles.ts"边界）

## 四、契约一致性观察（非阻塞，未改契约）
- `Comment.content` 契约 `maxLength: 2000`，但 `createComment` 请求体 `content` `maxLength: 65535`——两处上限不一致。本批按**请求体契约**校验（min 1 / max 65535）并原样存储展示文本；若后续收紧到 2000 属契约侧修正，不在本批范围。已登记供契约维护批次。
- 父评论 `parentId` 引用校验：非存在 → 404；跨文章引用 → 404。

## 五、门禁（已实跑复验）
- `tsc --noEmit`：✅ 0 error
- `biome check .`：✅ 0 error / 0 warning（62 文件）
- `vitest run`：✅ **90 passed**（14 文件；B4 行为级 12 例 + 存量 78；含 P3-1 新增 2 例 parentId 校验：指向不存在评论 → 404 / 指向他文评论 → 404）
- 契约双门：✅ 未触碰 `openapi.v1.yaml`（git 确认无 diff），结构门 + 语义自查预期零回归
- 代码行数（P2-1 拆分后实测）：`comments-read.ts` 72 行、`comments-write.ts` 127 行、`comment-query.ts` 40 行，路由文件均 ≤200（铁律）；`lib/comment.ts` ≈ 90 行。原 `comments.ts` 单文件 219 行 >200 已消除。
- 注：B4 首轮交付时 Bash 工具故障未实跑门禁，导致 `comments.ts` 真实编译错误与 219 行越界均漏网；经总把控审阅指出后已拆分 + 修复，门禁现已真绿，非"自陈待复跑"。
