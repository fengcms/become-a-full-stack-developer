/**
 * scripts/seed-users.ts
 * 种子用户脚本：创建首个管理员账号，解决「register 强制 member + 提升需已为 admin」的鸡生蛋死锁。
 *
 * 与 scripts/bootstrap-admin.mjs（冒烟测试直插 DB 脚手架，其文件头明确标注「生产环境需要另行补种子机制」）不同，
 * 本脚本走正规应用层：
 *   - 复用 @/shared/password 的 hashPassword，保证哈希格式与登录 verifyPassword 完全兼容；
 *   - 走 Drizzle + 应用层唯一约束校验（与 registerUser 同语义），不绕过任何领域逻辑。
 *
 * 运行方式（本地 Node / 自管 Linux）：
 *   pnpm seed
 *   读取 process.env 中的 DB_FILE（务必指向真实库文件，默认 :memory: 无意义）与以下种子变量（均含默认值）：
 *     SEED_ADMIN_USERNAME  默认 admin
 *     SEED_ADMIN_EMAIL     默认 admin@example.com
 *     SEED_ADMIN_PASSWORD  默认 admin123456（生产务必覆盖为强口令）
 *     SEED_ADMIN_NICKNAME  默认 站点管理员
 * 幂等：用户名已存在则跳过插入；若已存在但非 admin（如被降级的残留账号），会确保提升为 admin。
 *   强制重置密码 / 资料：加 --reset 参数（pnpm seed -- --reset）。
 *
 * Cloudflare D1 部署：不直接跑 Node 脚本，改用文件底部等价 SQL（wrangler d1 execute）。
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { readEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { users } from '@/db/schema';
import { isUniqueConstraintError } from '@/shared/db-error';
import { hashPassword } from '@/shared/password';

const run = async (): Promise<void> => {
  const env = readEnv(process.env as Record<string, string | undefined>);
  const dbFile = env.DB_FILE;
  if (dbFile === ':memory:') {
    console.warn('[seed] 警告：DB_FILE 为 :memory:，种子将写入临时内存库，进程退出即丢失。');
    console.warn('[seed] 请在环境变量 / .env 中设置 DB_FILE 指向真实数据库文件后再运行。');
  } else {
    mkdirSync(dirname(dbFile), { recursive: true });
  }

  const db = createLocalDb(dbFile);
  await migrate(db); // 确保表存在（首次运行创建）
  setDb(db);

  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123456';
  const nickname = process.env.SEED_ADMIN_NICKNAME ?? '站点管理员';
  const forceReset = process.argv.includes('--reset');

  const existing = (
    await db.select().from(users).where(eq(users.username, username)).limit(1).all()
  )[0];

  if (!existing) {
    try {
      const inserted = await db
        .insert(users)
        .values({
          username,
          email,
          passwordHash: await hashPassword(password),
          displayName: nickname,
          role: 'admin',
          status: 'active',
          level: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
        .all();
      const u = inserted[0];
      if (!u) throw new Error('插入管理员后未返回行');
      console.log(`[seed] 已创建管理员 id=${u.id} username=${username} role=admin`);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new Error(
          `用户名或邮箱冲突（${username} / ${email} 已被其他账号占用）。请更换 SEED_ADMIN_USERNAME / SEED_ADMIN_EMAIL 后重试。`,
        );
      }
      throw err;
    }
  } else if (existing.role !== 'admin' || forceReset) {
    await db
      .update(users)
      .set({
        role: 'admin',
        status: 'active',
        email,
        displayName: nickname,
        passwordHash: await hashPassword(password),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .run();
    const reason = forceReset ? '强制重置密码/资料' : `原角色 ${existing.role}，已提升`;
    console.log(
      `[seed] 已确保管理员 id=${existing.id} username=${username} role=admin（${reason}）`,
    );
  } else {
    console.log(`[seed] 管理员已存在 id=${existing.id} username=${username} role=admin，跳过`);
  }
};

run().catch((err) => {
  console.error('[seed] 失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});

/*
 * ===== Cloudflare D1 等价 SQL（wrangler d1 execute）=====
 * D1 环境无法跑 Node 脚本，用以下 SQL 完成等价首管理员种子（依赖 uniq_username / uniq_email 唯一索引）。
 * 把 <DB_NAME> 换成实际绑定名；密码哈希需在本地用 bcryptjs(rounds=12) 预先生成后粘贴到 <BCRYPT_HASH>。
 *
 *   wrangler d1 execute <DB_NAME> --remote --command="
 *     INSERT INTO users (username, password_hash, role, email, display_name, level, status, created_at, updated_at)
 *     SELECT 'admin', '<BCRYPT_HASH>', 'admin', 'admin@example.com', '站点管理员', 1, 'active', unixepoch()*1000, unixepoch()*1000
 *     WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
 *   "
 * 说明：D1 侧无法调用应用层的 hashPassword，需先在本地用相同 bcryptjs(rounds=12) 生成哈希；
 *   若 admin 已存在则 WHERE NOT EXISTS 跳过，保证幂等。
 */
