/**
 * scripts/backfill-article-tags.ts
 * 一次性存量回填脚本（B3.5）：把 articles.tags 同步进 article_tags 关联表。
 *
 * 运行方式（本地 Node / 自管 Linux）：
 *   pnpm tsx scripts/backfill-article-tags.ts
 *   读取 .env / 环境变量中的 DB_FILE（务必指向真实库文件，默认 :memory: 无意义）。
 * 幂等：重复执行安全（uniq_article_tag + ON CONFLICT DO NOTHING）。
 *
 * Cloudflare D1 部署：不直接跑 Node 脚本，改用 wrangler 执行等价 SQL（见文件底部）。
 */
import { readEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { backfillArticleTags } from '@/lib/article-backfill';

const run = async (): Promise<void> => {
  const env = readEnv(process.env as Record<string, string | undefined>);
  if (env.DB_FILE === ':memory:') {
    console.warn('[backfill] 警告：DB_FILE 为 :memory:，回填将写入临时内存库，无持久效果。');
    console.warn('[backfill] 请在 .env 中设置 DB_FILE 指向真实数据库文件后再运行。');
  }
  const db = createLocalDb(env.DB_FILE);
  await migrate(db);
  setDb(db);

  const result = await backfillArticleTags(db);
  console.log('[backfill] article_tags 存量回填完成');
  console.log(`  - 扫描未删文章: ${result.scanned}`);
  console.log(`  - 建立关联数(仅 catalog 已存在标签): ${result.linked}`);
  console.log(`  - article_tags 当前总行数: ${result.total}`);
};

run().catch((err) => {
  console.error('[backfill] 失败：', err);
  process.exit(1);
});

/*
 * ===== Cloudflare D1 等价 SQL（wrangler d1 execute）=====
 * D1 环境无法跑 Node 脚本，用以下 SQL 完成等价回填（依赖 article_tags(article_id, tag_id)
 * 唯一索引 + INSERT OR IGNORE 保证幂等）。把 <DB_NAME> 换成实际绑定名：
 *
 *   wrangler d1 execute <DB_NAME> --remote --command="
 *     INSERT OR IGNORE INTO article_tags (article_id, tag_id, created_at)
 *     SELECT a.id, t.id, unixepoch()*1000
 *     FROM articles a, json_each(a.tags) j
 *     JOIN tags t ON t.slug = json_extract(j.value, '$') OR t.name = json_extract(j.value, '$')
 *     WHERE a.deleted_at IS NULL;
 *   "
 * 说明：SQLite 的 json_each 可展开 articles.tags 的 JSON 数组；json_extract(j.value,'$')
 * 取数组元素原文，与 tags 表的 slug/name 匹配，得到 (article_id, tag_id) 后插入并忽略重复。
 */
