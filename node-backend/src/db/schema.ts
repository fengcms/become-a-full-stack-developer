/**
 * src/db/schema.ts
 * Drizzle 表定义（对齐 docs/prd/02-领域模型与API契约.md §二 的 User 实体）。
 * 命名：DB 字段 snake_case，响应层转 camelCase（见主计划 §三.3.6）。
 * B0 仅建 users 表；其余表（articles / categories / comments …）后续批次增量添加。
 *
 * 注：底层实体名为 User，契约路径 GET /members/{id} 仅是公开资料视图别名，
 * 路由层映射到 users 表并脱敏，不要另建 members 表（裁决 Q4）。
 */
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'),
    email: text('email'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    level: integer('level').notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('uniq_username').on(table.username),
    // 审阅补充：email 在领域模型 02 中为唯一。nullable 唯一索引允许多行 null，
    // 但注册 email 必填，故唯一约束在业务上等价为"非空唯一"。
    uniqueIndex('uniq_email').on(table.email),
  ],
);

/** users 行 → 查询结果类型。 */
export type User = typeof users.$inferSelect;
/** 插入 users 的入参类型。 */
export type NewUser = typeof users.$inferInsert;

/**
 * 刷新令牌表（有状态刷新模型，对应 02 §九 P11「刷新旋转 + 登出作废」）。
 * 仅存 token 的 SHA-256 哈希，明文令牌只在签发瞬间返回客户端一次。
 */
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tokenHash: text('token_hash').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uniq_token_hash').on(table.tokenHash)],
);

/** refresh_tokens 行 → 查询结果类型。 */
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

/**
 * 文章表（B2 核心，对齐 02 §二 Article 实体）。
 * 软删除用 `deleted_at`；slug 走普通唯一索引——SQLite 唯一索引对 NULL 允许多行，
 * 天然等价于「部分唯一索引」，删除后 slug 释放可被新文章复用（02 §2.2 R10）。
 * category_* 三列在 B2 仅透传存储：分类表与 slug 解析在 B3（分类/标签批次）落地。
 * tags 以 JSON 数组字符串去规范化存储，B3 将改为 article_tags 关联表以获得 FilterTag-by-slug 精确性。
 */
export const articles = sqliteTable(
  'articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    slug: text('slug'),
    summary: text('summary'),
    content: text('content').notNull(),
    coverImage: text('cover_image'),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id),
    authorName: text('author_name'),
    categoryId: integer('category_id'),
    categoryName: text('category_name'),
    categorySlug: text('category_slug'),
    status: text('status').notNull().default('draft'),
    tags: text('tags'), // JSON 字符串，B2 去规范化；B3 改造为 article_tags
    viewCount: integer('view_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('uniq_article_slug').on(table.slug)],
);

/** articles 行 → 查询结果类型。 */
export type ArticleRow = typeof articles.$inferSelect;
/** 插入 articles 的入参类型。 */
export type NewArticle = typeof articles.$inferInsert;

/**
 * 阅读量去重表（02 §2.4）。(article_id, dedup_key) 唯一约束防同用户/IP 短时间重复计数。
 * 24h 冷却编码进 dedup_key 的时间桶（baseKey#bucket，bucket=floor(now/24h)），
 * 冷却过后桶号变化 → 不再撞旧记录 → 根除「永久唯一约束 vs 24h 冷却」的 500；
 * 同窗口并发撞唯一约束时由应用层 isUniqueConstraintError 兜底下发 200（见 routes/articles.ts）。
 */
export const articleViewDedup = sqliteTable(
  'article_view_dedup',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id),
    dedupKey: text('dedup_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uniq_article_dedup').on(table.articleId, table.dedupKey)],
);

/** article_view_dedup 行 → 查询结果类型。 */
export type ArticleViewDedupRow = typeof articleViewDedup.$inferSelect;

/**
 * 分类表（B3 分类/标签批次，对齐契约 Category 实体）。
 * 无限级自关联树：parentId 指向自身 id；NULL 表示根分类。
 * 最大嵌套深度 4 级（契约 Category.x-max-depth），由应用层在创建/变更 parentId 时校验。
 * slug 唯一索引：SQLite 对 NULL 允许多行，但分类 slug 必填，故等价于非空唯一。
 */
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    // 自关联父节点；SQLite 自引用 FK 会造成 Drizzle 类型成环，且 FK 默认不强制，
    // 父存在性 / 成环 / 级联由应用层（lib/category.ts + 删除守卫）保证，故此处不声明 references。
    parentId: integer('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uniq_category_slug').on(table.slug)],
);

/** categories 行 → 查询结果类型。 */
export type CategoryRow = typeof categories.$inferSelect;
/** 插入 categories 的入参类型。 */
export type NewCategory = typeof categories.$inferInsert;

/**
 * 标签表（B3，对齐契约 Tag 实体）。扁平集合，无层级。
 * articleCount 不存表，运行时由 article_tags 关联实时聚合（见 lib/tag.ts）。
 */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uniq_tag_slug').on(table.slug)],
);

/** tags 行 → 查询结果类型。 */
export type TagRow = typeof tags.$inferSelect;
/** 插入 tags 的入参类型。 */
export type NewTag = typeof tags.$inferInsert;

/**
 * 文章-标签关联表（B3 落地，对齐 02 §二「标签改为关联表」演进方向）。
 * 作为标签与文章的规范关联；Tag.articleCount 由本表 JOIN 已发布文章精确聚合。
 * 附注：文章打标签的写入入口（创建/更新文章时同步本表）属 B2/B4 文章提交逻辑，
 * 按 B3「禁止项」不在此批次实现——故当前 junction 为空，articleCount 自然为 0，
 * 待 B2/B4 增强文章提交时回填，计数即自动生效（详见 B3-NOTES）。
 */
export const articleTags = sqliteTable(
  'article_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    articleId: integer('article_id')
      .notNull()
      .references(() => articles.id),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('uniq_article_tag').on(table.articleId, table.tagId)],
);

/** article_tags 行 → 查询结果类型。 */
export type ArticleTagRow = typeof articleTags.$inferSelect;
