# M1 后端 · 批次 B7：辅助接口 / 站点（Aux & Site）— 实现笔记

> 依赖 B2、B3。收尾批次：文章辅助查询、全站统计、搜索、站点设置，8 端点。
> 任务包：`docs/prd/m1-tasks/07-aux-site.md`；主计划映射：`M1-后端实现计划.md` 行 B7。
> **契约未改动**（冻结基线 v1.11.0），本批仅落地既有契约端点。

## 一、端点清单与实现文件（8 端点）

| 方法 & 路径 | 授权（x-authz） | 契约 operationId | 实现文件 |
|---|---|---|---|
| `GET /api/v1/articles/{id}/adjacent` | 公开（security: []） | getArticleAdjacent | `routes/aux.ts` + `lib/related.ts` |
| `GET /api/v1/articles/{id}/related` | 公开（security: []） | getArticleRelated | `routes/aux.ts` + `lib/related.ts` |
| `GET /api/v1/articles/{id}/toc` | 公开（security: []） | getArticleToc | `routes/aux.ts` + `lib/toc.ts` |
| `GET /api/v1/stats` | 公开（security: []） | getSiteStats | `routes/aux.ts` + `lib/stats.ts` |
| `GET /api/v1/search` | 公开（security: []） | search | `routes/aux.ts` + `lib/search.ts` |
| `GET /api/v1/site/settings` | 公开（security: []） | getSiteSettings | `routes/site.ts` |
| `GET /api/v1/admin/site/settings` | admin | getAdminSiteSettings | `routes/site.ts` |
| `PATCH /api/v1/admin/site/settings` | admin | updateSiteSettings | `routes/site.ts` |

**文件拆分说明（铁律 ≤200）**：原 `lib/aux.ts` 聚合 4 个独立领域达 316 行，越界。按职责拆为 4 个聚焦模块，全部 ≤200：

- `lib/related.ts`(118)：`getPublishedArticle` / `getAdjacent` / `getRelated` + 两个 Stub 类型。
- `lib/toc.ts`(46)：`parseToc` + `slugify` + `TocItem` 类型（纯函数、零 DB 依赖）。
- `lib/stats.ts`(42)：`getSiteStats` + `SiteStats` 类型。
- `lib/search.ts`(132)：`searchArticles` / `searchMembers` + `MemberProfile` / `MemberPage` 类型。
- 路由层 `routes/aux.ts`(66) / `routes/site.ts`(79) 各自严守 ≤200，`app.ts` 挂载于 `/api/v1`。

## 二、关键行为指引与实现决策

1. **公开可见性铁律**：`adjacent` / `related` / `toc` 仅对 `published` 文章有效；文章不存在 **或** `status !== 'published'` 一律 404（`getPublishedArticle` 统一抛 `NOT_FOUND`），与 B2/B4 公开列表口径一致（不泄露未发布文章存在性）。
2. **adjacent（上一篇/下一篇）**：以 `publishedAt` 排序——`prev` 取 `publishedAt < 当前` 中最新一篇，`next` 取 `published_at > 当前` 中最早一篇，均限 `published` + `deleted_at IS NULL`；无则 `null`。`publishedAt` 为 `null`（如草稿被误查，实际已被铁律拦截）时双 `null`。
3. **related（相关文章）打分**：`共享标签数 × 2 + 同分类 × 1`，排除自身，仅 `published`，按 `score` 降序、`viewCount` 次降序，`slice(0, limit)`。`?limit` 默认 5、封顶 10（下限 1）。
   - **依赖 denormalized `articles.tags`**：`article_tags` 关联表按 B3 禁止项暂未回填，故相关推荐直接读取文章的 `tags` JSON 列；回填 junction 后无需改此逻辑（打分仍基于标签集合）。这是「文章是产品、代码是素材」铁律下对关联表未就绪的务实兜底。
4. **toc（目录）边界**：解析 `content`（Markdown）标题层级（`#`~`######`）；**跳过代码围栏内的 `#` 行**（避免把代码里的 `# 注释` 当成标题）；锚点经 `slugify`（保留字母/数字/中文、截断 100、空则回退 `'heading'`），**重复锚点追加 `-n` 去重**；展示 `text` 截断 200，不改写原文。
5. **stats（全站统计）**：`articleCount` = `published` 文章数；`commentCount` = `approved` 评论数；`memberCount` = `active` 用户数；`viewTotal` = `published` 文章 `view_count` 累计（`coalesce(sum, 0)`）。四项 `Promise.all` 并发查询。
6. **search（搜索）**：`?q` 必填，空白 → `4001 VALIDATION`（`VALIDATION`/400）；`?type` 默认 `article`，`=member` 走会员搜索。文章命中 `title` / `summary` / `content` 三处 `LIKE`（限 `published`）；会员命中 `display_name` / `username` 的 `LIKE`（排除 `disabled`），并附各人 `published` 文章数。响应为互斥结构：`{ articles: ArticlePage | null, members: MemberPage | null }`，仅一侧有值。`?sort` 仅文章生效（透传 `buildSortSql` 白名单）。
7. **site settings（站点配置）**：单条记录 `id = 1`，迁移时 `onConflictDoNothing` 种子默认值（`siteName='成为全栈开发工程师'` 等）。`GET /site/settings` 公开读；`GET+PATCH /admin/site/settings` 需 `admin`。`PATCH` 字段全 optional，仅传变更项；`null` 显式清空（如 `siteTitle`、`logoUrl`）；`updatedAt` 每次写自动刷新。读取缺失 → 500（理论上由迁移种子保证存在）。

## 三、search 实现取舍（为何 LIKE 而非全文检索引擎）

- 任务包明确「不要求全文检索引擎，LIKE 或简单匹配即可」。B7 采用 `LIKE '%q%'` 三列 OR 匹配，零额外依赖、Cloudflare D1（SQLite）直接可用，契合「兼容普通 Linux + CF」双目标。
- 取舍代价：大表 `LIKE` 前缀/中缀无索引，性能随数据量线性劣化。但本专栏为「文章是产品」的素材级系统，文章总量有限（主线 130 篇量级），且搜索仅限 `published`——实际扫描集极小，远未触碰 `BE11` 的 `SCAN_LIMIT` 护栏阈值。若未来内容量显著膨胀，可平滑替换为 FTS5 或外部检索，契约响应形状不变。
- 会员搜索同理用 `LIKE`，且 `type` 已把文章/会员两类查询在契约层隔离，互不影响。

## 四、toc 边界小结

- 跳过 ``` 围栏（含 ```js / ```ts 等带语言标识）内的所有 `#` 行。
- 标题正则 `^(#{1,6})\s+(.+?)\s*#*\s*$`：捕获层级与文本，忽略尾部 `#` 闭合写法；非标题行（如 `#` 后无空格、`- # 列表项`）不误判。
- 锚点去重保证同页内 `id` 唯一，前端可直接 `href="#anchor"` 跳转；CJK 锚点保留原文字（非 ASCII 锚点现代浏览器均支持）。

## 五、文件清单

- schema：`src/db/schema.ts` 新增 `site_settings` 表 + `SiteSettingRow` / `NewSiteSetting` 类型（357 行，单一事实源，沿用 B0~B6 不拆先例）。
- 迁移：`src/db/migrate.ts` 追加 `site_settings` DDL + 种子默认行（`onConflictDoNothing`，198 行，<200）。
- 新增 lib：`src/lib/related.ts`(118) / `toc.ts`(46) / `stats.ts`(42) / `search.ts`(132)。
- 新增路由：`src/routes/aux.ts`(66) / `site.ts`(79)。
- 改写：`src/app.ts`（挂载 `auxRoute` + `siteRoute`，76 行）。
- 新增测试：`test/routes/aux.test.ts`（9 例行为级，覆盖 adjacent 上下篇、related 同分类命中/无关排除/limit、toc 解析+围栏跳过+锚点去重、stats 数值、search 命中标/摘/正/未命中/空 q 400/member 搜索、site 公开读/admin 改/匿名 401/会员 403/部分更新）。

## 六、门禁证据（自跑）

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 error |
| `biome check .` | ✅ 0 error / 0 warning（91 文件） |
| `vitest run` | ✅ **126 passed**（17 文件；B7 行为级 9 例，存量 117） |
| 契约结构门 `openapi-spec-validator` | ✅ `openapi.v1.yaml: OK`（未改契约） |
| 契约语义门 `check_contract.py` | ✅ 全部通过（33 OK，未改契约） |

## 七、待总把控独立复验

- B7 自验五门全绿、未触碰契约（冻结基线 v1.11.0 不变）。
- 请总把控抽查：契约一致性核查表（8 端点响应形状与 02 §二 对齐）、读所有批次 NOTES。
- 无误 → **M1 后端代码冻结**，进入「写 M1 后端文章」阶段（由总把控执笔，以验证过的代码为素材）。
