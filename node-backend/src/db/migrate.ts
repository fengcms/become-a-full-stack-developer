/**
 * src/db/migrate.ts
 * 本地 / 测试建表执行器。生产（Cloudflare D1）迁移走 drizzle-kit，deploy 阶段应用，不在此处。
 *
 * 注意：better-sqlite3 的 prepare 不支持多条语句，故按 ';' 拆成单条语句逐条执行。
 *
 * 审阅 B08：本文件的 raw SQL 与 db/schema.ts 是"双源真值"，易漂移。
 * 约定 db/schema.ts 为单一事实源，此处 STATEMENTS 的任何改动都须与 schema.ts 同步。
 */
import { sql } from 'drizzle-orm';
import type { Db } from '@/db/client';

/** 建表语句清单（与 schema.ts 保持同步；新增表在此追加）。 */
const STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    level INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_username ON users (username)`,
  // email 唯一（领域模型 02 要求；SQLite 唯一索引对 null 不冲突，注册 email 必填故等价非空唯一）
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_email ON users (email)`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_hash ON refresh_tokens (token_hash)`,
];

/**
 * 执行建表（开发 / 测试用本地 SQLite）。
 * @param db Drizzle 数据库实例
 */
export const migrate = async (db: Db): Promise<void> => {
  for (const statement of STATEMENTS) {
    await db.run(sql.raw(statement));
  }
};
