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
