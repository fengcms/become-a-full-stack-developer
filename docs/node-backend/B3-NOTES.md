# M1 Node 后端 · B3 批次交付说明（分类 / 标签）

> 批次：B3 · 依赖 B2（已放行）· 放行依据 `docs/node-backend/review/B2-代码审阅-第二轮复审批复.md`
> 端点数：11（分类 7 + 标签 4）· 全部对齐契约 `docs/api/openapi.v1.yaml` v1.11.0

## 一、端点 ↔ 契约映射

| 方法 & 路径 | 授权（x-authz） | 契约 operationId | 实现文件 |
|---|---|---|---|
| `GET /api/v1/categories` | 公开（security: []） | listCategories | `routes/categories-read.ts` |
| `POST /api/v1/categories` | editor | createCategory | `routes/categories-write.ts` |
| `PUT /api/v1/categories/{id}` | editor | updateCategory | `routes/categories-write.ts` |
| `DELETE /api/v1/categories/{id}` | editor（x-cascade: none） | deleteCategory | `routes/categories-write.ts` |
| `GET /api/v1/categories/tree` | 公开 | getCategoryTree | `routes/categories-read.ts` |
| `GET /api/v1/categories/{id}/breadcrumb` | 公开 | getCategoryBreadcrumb | `routes/categories-read.ts` |
| `GET /api/v1/categories/stats` | 公开 | getCategoryStats | `routes/categories-read.ts` |
| `GET /api/v1/tags` | 公开（含 articleCount） | listTags | `routes/tags.ts` |
| `POST /api/v1/tags` | editor | createTag | `routes/tags.ts` |
| `PUT /api/v1/tags/{id}` | editor | updateTag | `routes/tags.ts` |
| `DELETE /api/v1/tags/{id}` | editor（x-cascade: none） | deleteTag | `routes/tags.ts` |

授权统一取 `x-authz.minRole`（第 4 铁律机器字段），不采信契约示例散文里的"非 admin"措辞（与 B2 一致）。

## 二、关键行为与决策（登记，供评审）

### 1. 分类树（契约 §2.2 留外，本批给出合理实现）
- 树经 `parentId` 自关联递归组装，节点无层级上限由应用层在**创建/变更 parentId** 时校验。
- `buildTree(rows)`（`lib/category.ts`）：一次取全量，按 `parentId` 分桶 + 递归 `toNode`；子节点按 `sortOrder` 升序、其次 `id` 稳定排序。
- `buildTree` 递归内持 `seen` 集：数据腐化成环时命中自身即截断、不展开子孙、不死循环（B3 复批 P3-1 防御性兜底，与 `depthOf`/`toBreadcrumb` 同款防御）。
- `GET /tree` 直接对全量分类调 `buildTree`，无需层级参数（契约整树返回）。

### 2. 环检测（wouldCreateCycle）
- 把节点 X 的 `parentId` 改为 Y 时，若 `Y === X`（自挂）或沿 Y 向上遍历命中 X（Y 是 X 的子孙）→ 成环，返回 409 / 3002。
- 纯函数，单测友好；数据异常成环时被 `seen` 集合防御，不会死循环。

### 3. 深度限制（x-max-depth: 4）
- `depthOf(rows, id)` 向上计数祖先层级（根=1）。创建子节点后深度 = `depthOf(父) + 1`，须 `≤ 4`；超出 → 409 / 3002。
- 变更 parentId（移动子树）时，校验**整棵被移动子树**的深度 = `depthOf(新父) + subtreeHeight(被移动节点)`（含自身及全部子孙高度），须 `≤ 4`；超出 → 409 / 3002。
- ⚠️ 原说明「既覆盖新建过深子节点，也覆盖把某节点挂到深节点下使其超界」对**被移动节点自身**成立，对**其子孙**原先不成立（漏算子孙高度，移动带深子孙的子树会越过 x-max-depth）。该过度声称已据 B3 复批 P2-1 修正：`subtreeHeight` 把关后，移动带子孙的子树亦受 x-max-depth 约束（见 `lib/category.ts` + `categories-write.ts` 的 PUT 校验 + 新增单测）。

### 4. 删除策略（x-cascade: none）
- 分类删除：有子分类（`parent_id = id`）→ 409；有已发布/未删文章引用（`category_id = id AND deleted_at IS NULL`）→ 409。二者均无则硬删。
- 标签删除：有 `article_tags` 关联行（`tag_id = id`）→ 409；否则硬删。
- 均不级联，要求调用方先迁子节点/文章/关联，避免悬空 `parent_id` 或孤儿中间表行（契合契约"避免悬空引用"措辞）。

### 5. Tag.articleCount 聚合（响应式 B2 复批「关联表精确 IN 查询」建议）
- 由 `article_tags` 关联表 `JOIN articles`（仅 `status='published' AND deleted_at IS NULL`）`GROUP BY tag_id` 精确计数（`lib/tag.ts` `tagArticleCounts`）。
- **精确、不依赖 articles.tags 的 JSON 子串匹配**，彻底消除 B2 P3 的 tag 子串误匹配隐患（按 B2 复批建议落地）。

### 6. article_tags 暂未回填（重要说明）
- 本批次按 B3「禁止项：不在本批实现文章归属的提交逻辑（属 B2/B4）」，**未引入"文章打标签"的写入入口**，故当前 `article_tags` 为空、`GET /tags` 的 articleCount 自然为 0。
- 计数查询本身已通过白盒测试验证正确（直接插入 `article_tags` 关联 + 已发布/草稿文章，断言仅已发布计入）。
- 待 B2/B4 增强文章提交（创建/更新时同步 `article_tags`）后，articleCount 自动生效，**无需改本批任何代码**——这是干净的前向兼容设计，不是缺陷。

## 三、schema / 迁移

- 新增三表：`categories`（`parent_id` 自关联、slug 唯一索引）、`tags`（slug 唯一索引）、`article_tags`（`article_id+tag_id` 唯一索引）。
- `categories.parentId` **未声明 `.references(() => categories.id)`**：Drizzle 自引用 FK 会造成生成类型成环（TS7022/7024），且 SQLite FK 默认不强制；父存在性/成环/级联由应用层（lib/category.ts + 删除守卫）保证。迁移 raw SQL 同步去掉该 FK 子句，保持 schema 单一事实源一致。
- 导出类型：`CategoryRow` / `NewCategory` / `TagRow` / `NewTag` / `ArticleTagRow`。

## 四、门禁证据（自验，不采信自陈）

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 error |
| `biome check .` | ✅ 0 error / 0 warning（51 文件） |
| `vitest run` | ✅ **72 passed（12 文件，B3 原 14 + 复批补 4：移动子树深度 1 集成 + subtreeHeight/buildTree 环防御 3 单测）** |
| 契约双门 | ✅ STRUCTURAL_OK + 语义自查全部通过（未改契约） |

## 五、文件清单（本批新增/改动）

- 新增：`src/lib/slug.ts`（共享 slug 正则+Zod 字段）、`src/lib/category.ts`（树/环检测/深度/面包屑/`subtreeHeight`）、`src/lib/tag.ts`（聚合计数）、`src/routes/categories-read.ts`（4 公开 GET 端点）、`src/routes/categories-write.ts`（3 editor 写端点，复用 `allCategories`）、`src/routes/tags.ts`、`test/routes/categories.test.ts`、`test/routes/tags.test.ts`、`test/lib/category.test.ts`（subtreeHeight + buildTree 环防御单测）
- 改动：`src/db/schema.ts`（三表+类型）、`src/db/migrate.ts`（同步 raw SQL）、`src/app.ts`（挂载 read+write 两子路由）

> 复批修复（P2-1 + P3-1）：`lib/category.ts` 增 `subtreeHeight` 并给 `buildTree` 加 `seen` 集防御；`categories-write.ts` 的 PUT 校验由 `depthOf(新父)+1` 改为 `depthOf(新父)+subtreeHeight(被移动节点)`。`test/lib/category.test.ts` 锁定两修复，`test/routes/categories.test.ts` 增「移动带子孙的子树使子孙超界 → 409」集成测试。
>
> 文件粒度说明：`src/routes/categories.ts` 原 235 行超限（≤200 铁律），已拆分为 `categories-read.ts`（75 行，公开读）与 `categories-write.ts`（192 行，editor 写），二者在 `app.ts` 同挂 `/api/v1/categories`，行为等价、测试全绿。
>
> 门禁证据：tsc 0 / biome 0（50 文件）/ vitest 68（B3 14）/ 契约双门全绿。本批代码已落地工作区，待总把控独立复验通过后提交（commit：`M1 B3 分类标签端点 + 测试`）。
