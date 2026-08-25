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
  (table) => [uniqueIndex('uniq_username').on(table.username)],
);

/** users 行 → 查询结果类型。 */
export type User = typeof users.$inferSelect;
/** 插入 users 的入参类型。 */
export type NewUser = typeof users.$inferInsert;
