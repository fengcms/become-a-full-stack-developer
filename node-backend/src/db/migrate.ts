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
  `CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT,
    summary TEXT,
    content TEXT NOT NULL,
    cover_image TEXT,
    author_id INTEGER NOT NULL,
    author_name TEXT,
    category_id INTEGER,
    category_name TEXT,
    category_slug TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    tags TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (author_id) REFERENCES users(id)
  )`,
  // slug 唯一索引：SQLite 对 NULL 允许多行，天然等价于「部分唯一索引」（软删除后 slug 释放可复用）
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_article_slug ON articles (slug)`,
  `CREATE TABLE IF NOT EXISTS article_view_dedup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    dedup_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_article_dedup ON article_view_dedup (article_id, dedup_key)`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_category_slug ON categories (slug)`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_tag_slug ON tags (slug)`,
  `CREATE TABLE IF NOT EXISTS article_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_article_tag ON article_tags (article_id, tag_id)`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    rejected_reason TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER,
    storage_key TEXT NOT NULL,
    url TEXT NOT NULL,
    storage TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (article_id) REFERENCES articles(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_favorite ON favorites (user_id, article_id)`,
  `CREATE TABLE IF NOT EXISTS view_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    last_read_at INTEGER NOT NULL,
    progress INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (article_id) REFERENCES articles(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_view_history ON view_history (user_id, article_id)`,
  `CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (article_id) REFERENCES articles(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_like ON likes (user_id, article_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
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
