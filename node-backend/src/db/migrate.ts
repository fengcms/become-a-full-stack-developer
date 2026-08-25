/**
 * src/db/migrate.ts
 * 本地 / 测试建表执行器。生产（Cloudflare D1）迁移走 drizzle-kit，deploy 阶段应用，不在此处。
 *
 * 注意：better-sqlite3 的 prepare 不支持多条语句，故按 ';' 拆成单条语句逐条执行。
 */
import { sql } from 'drizzle-orm';
import type { Db } from './client';

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
