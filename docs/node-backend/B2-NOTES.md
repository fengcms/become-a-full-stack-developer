# M1 B2 文章核心批次 · 交付说明（NOTES）

> 批次：B2（文章 Articles，11 端点）｜依赖：B1 已通过（第二轮复审批复放行）
> 代码落点：`node-backend/src/{lib,db,routes}`，测试：`node-backend/test/routes/{articles,articles-admin}.test.ts`
> 门禁证据：`tsc --noEmit` ✅ 0 / `biome check` ✅ 0 / `vitest run` ✅ 51（B2 新增 18：articles 10 + articles-admin 8）

## 一、端点 ↔ 契约映射（11 端点，全部闭合）

| 端点 | 契约 | 关键约束 | 实现位置 |
|---|---|---|---|
| `GET /api/v1/articles` | 200 `ArticleList` | 强制仅 `published`（忽略 `?status=`） | `articles.ts` |
| `POST /api/v1/articles` | 200 `Article` / 409 `3002` | 默认 `draft`；member 传 `published`→降级 `pending`；member 忽略 `slug` | `articles.ts` |
| `GET /api/v1/articles/{idOrSlug}` | 200 `Article` / 404 `3001` | id 或 slug 解析；匿名仅 `published`；owner/admin 可见任意态 | `articles.ts` |
| `PUT /api/v1/articles/{id}` | 200 `Article` / 403 `2001` | editor 或 owner；member 编辑已发布→退回 `pending` | `articles.ts` |
| `DELETE /api/v1/articles/{id}` | 200 / 404 `3001` | 软删（置 `deleted_at`），slug 释放可复用 | `articles.ts` |
| `POST /api/v1/articles/{id}/submit` | 200 `Article` / 409 `3003` | `draft→pending`，非 draft 前态→3003 | `articles.ts` |
| `POST /api/v1/articles/{id}/view` | 200 `{viewCount}` / 404 `3001` | 阅读量去重；仅 `published` 可计数 | `articles.ts` |
| `GET /api/v1/me/articles` | 200 `ArticleList` | 本人全部状态（含 draft） | `articles-me.ts` |
| `GET /api/v1/admin/articles` | 200 `ArticleList` | editor/admin 可见全部状态 + 筛选 | `articles-admin.ts` |
| `POST /api/v1/admin/articles/{id}/approve` | 200 `Article` / 409 `3003` | `pending→published`，非 pending 前态→3003 | `articles-admin.ts` |
| `POST /api/v1/admin/articles/{id}/status` | 200 `Article` | admin 万能置位，不受 N9-2 矩阵限制，同态幂等 200 | `articles-admin.ts` |

## 二、关键设计决策

### 1. 阅读量去重（02 §3.3 落地）
- **去重键**：登录用户用 `u:${userId}`；匿名用 `a:${fnv1a(ip|userAgent)}`（FNV-1a 哈希，32 位定长，避免 UA 过长）。落 `article_view_dedup` 表，`unique(articleId, dedupKey)`。
- **24h 冷却**：查询 `createdAt >= now - 24h` 是否已有记录；命中则不计，未命中才走「插去重记录 + `UPDATE view_count = view_count + 1`」。
- **计数与去重解耦**：计数用 `sql\`${articles.viewCount} + 1\`` 的 SQL 表达式原地自增，避免「读-改-写」竞态；去重判定与计数写入分离，可同步、亦可降级为最终一致（当前同步实现已满足契约语义）。
- **可见性前置**：`view` 端点先判 `status === 'published'`，否则 404（未发布不计数、不暴露存在性）。

### 2. 默认状态 = draft + member 权限降级
- 创建时传 `status` 仅对 editor/admin 生效；member 传 `published` 经 `resolveNewStatus` 降级为 `pending`，对应「会员投稿默认待审、不可自发布」。
- member 编辑**已发布**文章 → 同样退回 `pending`（避免会员绕过审核直接改公开内容）。
- `slug` 仅特权角色可设置；member 传入即忽略（防会员抢占语义化短链）。`resolveNewStatus(input, current, privileged)` 是唯一状态结算入口，创建/更新复用。

### 3. slug 部分唯一索引（巧用 SQLite 语义）
- `uniq_article_slug` 建在**可空** `slug` 列；SQLite 对 `NULL` 允许多行共存，天然等价「部分唯一索引」（仅非空 slug 参与唯一约束）。
- 软删后 `deleted_at` 置值，该列变 `NULL`，占用释放、可复用——无需额外清理逻辑。
- 冲突检测：创建/更新时 `WHERE deleted_at IS NULL AND slug = ?` 查重，命中即 `3002`（`isUniqueConstraintError` 兜底并发竞态，与 B1 同款）。

### 4. 分类 / 标签的 B2 边界（刻意留白，避免下沉过度）
- **分类树**：`GET /categories/tree`、分类表属 B3。B2 文章仅透传 `categoryId`；`categoryName`/`categorySlug` 暂置 `NULL`（代码注释 `B3 落地分类表后补全`），防止在文章端伪造分类语义。
- **标签**：以 JSON 字符串存 `tags` 列（数组序列化，读写走 `JSON.stringify`/`parse`）。标签云计数已由 `GET /tags` 的 `Tag.articleCount` 覆盖，B2 **不单建 tags 表**——契合"文章是产品、代码是素材"的克制原则。

### 5. 状态转移矩阵（N9-2）的分工
- `submit`（`draft→pending`）与 `approve`（`pending→published`）是**受控转移**，非法的"前态不符"→ `3003`（`STATE_CONFLICT`）。
- 后台 `setStatus` 是 admin **万能置位**（下架/退回专用），不受 N9-2 矩阵限制；同态（如 `draft→draft`）直接幂等 200。
- `Article.status.x-allowed-transitions` 在契约层已机器化（v1.14 清零 N9-2），代码层的 3003 校验与之对齐。

## 三、踩坑与经验（沉淀，供后续批次 / 相关 AI）

1. **better-sqlite3 写操作必须用 `.run()`，不是 `.all()`**：`update().set().where()` 与 `insert().values()`（无 `returning`）是写语句，Drizzle better-sqlite3 要求 `.run()`；只有 `SELECT` 与 `INSERT...RETURNING().all()` 才能 `.all()`。`create` 因用了 `.returning().all()` 一直正常，导致 `submit/view/update/delete` 的 `.all()` 错误被掩盖到**运行时**才暴露——tsc、biome、契约双门都拦不住，只有 vitest 抓到 `This statement does not return data. Use run() instead`。**铁律：写 `.run()`、读 `.all()`、回读 `.returning().all()`。** 已在 `articles.ts` / `articles-admin.ts` 全量修正（共 7 处）。
2. **测试 `tokenOf` 必须先 register 再 login**：原 helper 只 `login`，但用例从未 `register` 该用户名 → `login` 命中"用户不存在→1001→`data:null`"，连累 `r.data.accessToken` 抛 `TypeError`。修正为 `tokenOf` 内先 `register`（409 可忽略）再 `login`，自包含且幂等。
3. **守卫信任登录时 JWT 角色声明，提权必须在 login 之前**：`authMiddleware`/`guard` 读取的是 `claims.role`（登录时签发，不回查 DB）。测试若先 `tokenOf` 登录（持 `member`）再 `elevate`（直接改库 role），令牌仍持旧角色，admin/editor 受保护端点会 403。修正：所有提权用例改为 `register → elevate → tokenOf`。
4. **共享 `:memory:` 库致用例污染**：`setup.ts` 每文件建一份内存库，文件内用例共享。计数类断言（`total === N`）会被前置用例的文章干扰。修正：B2 两测试文件各自加 `beforeEach` 重建全新 `:memory:` 库并 `migrate`，用例间零污染（也更贴合"每用例独立"的测试卫生）。
5. **member 创建 `published` 会被降级为 `pending`**：测试「公开列表仅返回 published」「关键词过滤」最初以 member 创建 `status:'published'`，被 `resolveNewStatus` 降级成 `pending`，公开列表 0 条。修正为改用 admin 账号创建已发布文章——这是"测试假设与领域规则不符"，**领域规则（member 不可自发布）本身正确**，无需改代码。
6. **`elevate` 的 `.run()` 返回 `RunResult` 而非 Promise**：类型标注 `Promise<unknown>` 与 `.run()` 实际返回不一致，tsc 报 `TS2739`。去掉 `Promise<unknown>` 标注即可（`.run()` 同步返回，`await` 非 Promise 亦合法）。

## 四、门禁证据（自验）

| 门禁 | 结果 |
|---|---|
| `pnpm exec tsc --noEmit` | ✅ 0 error（strict + verbatimModuleSyntax + paths） |
| `pnpm exec biome check .` | ✅ Checked 42 files, No fixes applied（0 error / 0 warning） |
| `pnpm exec vitest run` | ✅ Test Files 9 / Tests 51（B2 新增 18：articles 10 + articles-admin 8） |
| 契约双门（B0 基线） | 未改动契约，仅 B2 实现层；结构门 `STRUCTURAL_OK` + 语义门「语义自查全部通过」均全绿 |

## 五、后续建议

- **B3 分类批次**：回填 `categoryName`/`categorySlug`，补全 `GET /categories/tree`；届时文章端去掉 `B3 落地分类表后补全` 占位注释。
- **B5 评论批次**：`Comment.status`（approved/rejected/reviewing）目前未机器化 N9-2，可一并落地状态转移矩阵，与本文 §5 的 `submit/approve` 思路一致。
- **阅读量高并发**：当前同步写「去重记录 + 计数自增」已满足契约「24h 冷却 + 去重」语义；若上线后读多写多，可将计数写入改为事件/队列最终一致，去重判定逻辑不变。
- **建议 commit 信息**：`M1 B2 文章核心端点 + 测试`（与计划交付物一致）。本批代码已落地工作区，待总把控独立复验通过后提交。
