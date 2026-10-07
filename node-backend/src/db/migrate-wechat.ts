import { sql } from 'drizzle-orm';
import type { Db } from './client';

/** 本地已有库增量升级；历史会员默认已配置，不重写任何密码。 */
export async function migrateWechat(db: Db): Promise<void> {
  const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(users)`);
  if (!columns.some((c) => c.name === 'credentials_configured')) {
    await db.run(
      sql`ALTER TABLE users ADD COLUMN credentials_configured INTEGER NOT NULL DEFAULT 1`,
    );
  }
  await db.run(sql`CREATE TABLE IF NOT EXISTS wechat_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL, open_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
  )`);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_wechat_identity ON wechat_identities(app_id, open_id)`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_wechat_user ON wechat_identities(user_id)`,
  );
}
