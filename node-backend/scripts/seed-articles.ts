/**
 * scripts/seed-articles.ts
 * 文章种子脚本：把 articles/ 目录下的教程 markdown 解析后，以 published 状态写入本地库，
 * 用于本地后端 / 前端联调时快速获得「基础数据」。
 *
 * 复用应用层写法（与 seed-users.ts 同套路）：
 *   - 走 createArticleRow / updateArticleRow（services/article-mutation），状态机、slug、分类字段、标签关联全部走正规逻辑；
 *   - 复用 hashPassword / 应用层唯一约束校验，不绕过领域逻辑；
 *   - 幂等：按 slug 判断，已存在则更新（标题/摘要/正文/分类），不存在则创建；重复执行安全。
 *
 * 运行方式（本地 Node / 自管 Linux）：
 *   cd node-backend
 *   DB_FILE=./data/app.db pnpm tsx scripts/seed-articles.ts
 * 说明：
 *   - 必须显式设置 DB_FILE 指向真实库文件（默认 :memory: 会进程退出即丢，已对开发场景告警）。
 *   - 首次运行会自动 migrate（建表）+ 创建管理员（admin/admin123456，可用 SEED_ADMIN_* 覆盖）+ 按模块建分类。
 *   - slug 采用 ASCII 形式 `m{模块}-{序号}`（如 m0-01），以通过契约 SLUG_PATTERN（^[a-z0-9-]{1,64}$）。
 *
 * Cloudflare D1 部署：不直接跑 Node 脚本，改用 wrangler 执行等价 SQL（解析逻辑见本文件，insert 语句由人工/脚本生成）。
 */
import { mkdirSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { readEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { articles, categories, type ArticleRow, users } from '@/db/schema';
import { createArticleRow, updateArticleRow } from '@/services/article-mutation';
import type { ArticleStatus } from '@/services/article';
import { hashPassword } from '@/shared/password';

const here = dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = resolve(here, '../../articles');

/** 模块编号 → 分类名（用于自动建分类）。 */
const MODULE_NAMES: Record<string, string> = {
  '0': '产品篇（开篇与规划）',
  '1': 'Node 后端',
  '2': 'React 管理后台',
  '3': 'Next 网站前台',
  '4': 'Flutter 应用',
  '5': 'Taro 跨端',
  '6': 'Go 后端',
  '7': 'Vue3 前端',
  '8': '收官篇',
  B: '支线',
};

interface ParsedArticle {
  moduleKey: string; // '0'..'8' 或 'B'
  seq: string; // '01'
  title: string;
  content: string;
  summary: string;
  slug: string; // ASCII：m0-01
}

/** 解析单篇 markdown：取 H1 为标题，余下为正文，首段去标记后截断为摘要。 */
const parseArticle = (file: string): ParsedArticle | null => {
  const meta = /^M([0-9B]+)-(.+)\.md$/i.exec(file);
  if (!meta) return null;
  const moduleKey = meta[1];
  const rest = meta[2]; // 形如 01-为什么前端工程师要走向全栈
  const seqMatch = /^(\d+)-?(.*)$/.exec(rest);
  const seq = seqMatch?.[1] ?? '00';
  const fileTitleHint = (seqMatch?.[2] ?? '').trim();

  const raw = readFileSync(resolve(ARTICLES_DIR, file), 'utf8');
  const lines = raw.split(/\r?\n/);
  let title = '';
  const body: string[] = [];
  let foundTitle = false;
  for (const line of lines) {
    if (!foundTitle) {
      const h1 = /^#\s+(.*)$/.exec(line);
      if (h1) {
        title = h1[1].trim();
        foundTitle = true;
      }
      continue;
    }
    body.push(line);
  }
  if (!title) title = fileTitleHint || file;
  const content = body.join('\n').trim();

  // 摘要：首个含字符的段落，去 markdown 标记，截断 140 字
  const firstPara = content
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[#>*`_`~]/g, '').replace(/\s+/g, ' ').trim())
    .find((p) => p.length > 4);
  const summary = firstPara
    ? firstPara.length > 140
      ? `${firstPara.slice(0, 137)}…`
      : firstPara
    : '';

  return {
    moduleKey,
    seq,
    title,
    content,
    summary,
    slug: `m${moduleKey.toLowerCase()}-${seq}`,
  };
};

/** 确保管理员存在（复用 seed-users.ts 语义）。返回 admin id。 */
const ensureAdmin = async (db: ReturnType<typeof createLocalDb>): Promise<number> => {
  const existing = (
    await db.select().from(users).where(eq(users.role, 'admin')).limit(1).all()
  )[0];
  if (existing) return existing.id;
  const inserted = await db
    .insert(users)
    .values({
      username: process.env.SEED_ADMIN_USERNAME ?? 'admin',
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
      passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? 'admin123456'),
      displayName: process.env.SEED_ADMIN_NICKNAME ?? '站点管理员',
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
  console.log(`[seed-articles] 已创建管理员 id=${u.id} username=${u.username}`);
  return u.id;
};

/** 确保各模块分类存在，返回 moduleKey → categoryId 映射。 */
const ensureCategories = async (
  db: ReturnType<typeof createLocalDb>,
  moduleKeys: string[],
): Promise<Map<string, number>> => {
  const map = new Map<string, number>();
  for (const k of moduleKeys) {
    const slug = `m${k.toLowerCase()}`;
    const existing = (
      await db.select().from(categories).where(eq(categories.slug, slug)).limit(1).all()
    )[0];
    if (existing) {
      map.set(k, existing.id);
      continue;
    }
    const inserted = await db
      .insert(categories)
      .values({
        name: MODULE_NAMES[k] ?? `模块 ${k}`,
        slug,
        description: `《成为全栈》模块 ${k} 文章分类`,
        parentId: null,
        sortOrder: Number(k) || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .all();
    const c = inserted[0];
    if (!c) throw new Error(`创建分类 ${slug} 后未返回行`);
    map.set(k, c.id);
    console.log(`[seed-articles] 已创建分类 id=${c.id} slug=${slug} name=${c.name}`);
  }
  return map;
};

const run = async (): Promise<void> => {
  const env = readEnv(process.env as Record<string, string | undefined>);
  if (env.DB_FILE === ':memory:') {
    console.warn(
      '[seed-articles] 警告：DB_FILE=:memory:，种子数据进程退出即丢失。请使用 DB_FILE=./data/app.db 再运行。',
    );
  } else {
    mkdirSync(dirname(env.DB_FILE), { recursive: true });
  }

  const db = createLocalDb(env.DB_FILE);
  await migrate(db); // 确保表存在
  setDb(db);

  const adminId = await ensureAdmin(db);
  const files = readdirSync(ARTICLES_DIR).filter((f) => /^M[0-9B].*\.md$/i.test(f));
  const parsed = files
    .map(parseArticle)
    .filter((p): p is ParsedArticle => p !== null);
  if (parsed.length === 0) {
    console.warn('[seed-articles] 未在 articles/ 下发现可解析的文章文件，退出。');
    return;
  }

  const catMap = await ensureCategories(db, [...new Set(parsed.map((p) => p.moduleKey))]);

  let created = 0;
  let updated = 0;
  for (const p of parsed) {
    const existing: ArticleRow | undefined = (
      await db.select().from(articles).where(eq(articles.slug, p.slug)).limit(1).all()
    )[0];
    const input = {
      title: p.title,
      summary: p.summary,
      content: p.content,
      categoryId: catMap.get(p.moduleKey) ?? null,
      slug: p.slug,
      status: 'published' as ArticleStatus,
    };
    if (!existing) {
      await createArticleRow(input, adminId, true);
      created += 1;
    } else {
      await updateArticleRow(existing.id, input, existing, true);
      updated += 1;
    }
  }

  console.log(
    `[seed-articles] 完成：扫描 ${files.length} 个文件，解析 ${parsed.length} 篇，新增 ${created}，更新 ${updated}。`,
  );
};

run().catch((err) => {
  console.error('[seed-articles] 失败：', err instanceof Error ? err.message : err);
  process.exit(1);
});
