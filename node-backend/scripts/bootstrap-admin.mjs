/**
 * scripts/bootstrap-admin.mjs
 * 测试专属：向本地 SQLite 文件直接插入（或确保）一个 admin 账号。
 *
 * ⚠️ 这是冒烟测试的脚手架，不属于后端应用代码，不改动 src/ 任何一行。
 * 背景：系统当前没有任何「创建第一个管理员」的 API 入口（register 强制 member，
 *       提升需已为 admin），存在鸡生蛋死锁。生产环境需要另行补种子机制，
 *       但冒烟测试用「直插 DB」绕过，零侵入。
 *
 * 依赖：项目自带的 better-sqlite3（原生）与 bcryptjs（纯 JS），从项目根 node_modules 解析。
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');

const dbFile = process.env.SMOKE_DB_FILE;
const username = process.env.SMOKE_ADMIN_USER;
const email = process.env.SMOKE_ADMIN_EMAIL;
const password = process.env.SMOKE_ADMIN_PASS;

if (!dbFile || !username || !email || !password) {
  console.error('[bootstrap-admin] 缺少环境变量 SMOKE_DB_FILE / SMOKE_ADMIN_USER / SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASS');
  process.exit(1);
}

const db = new Database(dbFile);
const now = Date.now();
const hash = bcrypt.hashSync(password, 10);

const existing = db.prepare('SELECT id, role FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare("UPDATE users SET role = 'admin', status = 'active', password_hash = ?, email = ? WHERE username = ?")
    .run(hash, email, username);
  console.log(`[bootstrap-admin] 已存在 id=${existing.id}，已确保 role=admin`);
} else {
  const info = db.prepare(
    `INSERT INTO users (username, password_hash, role, email, display_name, level, status, created_at, updated_at)
     VALUES (?, ?, 'admin', ?, 'Smoke Admin', 0, 'active', ?, ?)`,
  ).run(username, hash, email, now, now);
  console.log(`[bootstrap-admin] 已插入 admin id=${info.lastInsertRowid}`);
}
db.close();
