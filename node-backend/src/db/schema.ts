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
 * 阅读量去重表（02 §2.4）。(article_id, dedup_key) 唯一约束防同用户/IP 短时间重复计数；
 * 24h 冷却由应用层按 created_at 判定（写分离降级为同步保真，B2 够用）。
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
