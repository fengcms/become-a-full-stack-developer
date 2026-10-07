/** 升级指定已有本地库；先使用 SQLite backup API 备份（包含 WAL），再做幂等增量迁移。 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createLocalDb } from '../src/db/client';
import { migrateWechat } from '../src/db/migrate-wechat';

const file = resolve(process.env.DB_FILE ?? './data/app.db');
if (!existsSync(file)) throw new Error('目标库不存在，拒绝把空库当作已迁移环境');
const db = createLocalDb(file);
const client = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
const directory = resolve('.wrangler/backups');
mkdirSync(directory, { recursive: true });
const backup = resolve(directory, `local-pre-wechat-${Date.now()}.sqlite`);
try {
  await client.backup(backup);
  const before = await db.all(
    sql`SELECT id,username,password_hash,status,role FROM users ORDER BY id`,
  );
  await migrateWechat(db);
  const after = await db.all(
    sql`SELECT id,username,password_hash,status,role FROM users ORDER BY id`,
  );
  assert.deepEqual(after, before);
  assert.deepEqual(await db.all(sql`PRAGMA foreign_key_check`), []);
  console.log(
    JSON.stringify({
      database: file,
      backup,
      usersPreserved: before.length,
      migration: 'wechat_credentials',
      passed: true,
    }),
  );
} finally {
  client.close();
}
