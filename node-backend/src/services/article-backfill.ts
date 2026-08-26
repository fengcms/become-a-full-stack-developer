/**
 * src/lib/article-backfill.ts
 * 存量文章标签关联回填（B3.5）：把 articles.tags（JSON 字符串）解析为 article_tags 关联行。
 *
 * 背景：B3 建好 article_tags 关联表，但历史文章从未写入该表（dead table），导致
 * GET /tags 的 articleCount 恒为 0、标签删除守卫失效、列表标签过滤未走关联。
 * 本函数把存量文章的 tags 同步进关联表，使其立即生效。
 *
 * 幂等：依赖 uniq_article_tag 唯一索引 + ON CONFLICT DO NOTHING，重复执行安全
 * （已存在的关联被忽略）；按 slug==name 约定仅链接 catalog 中已存在的 Tag。
 */
import { isNull, sql } from 'drizzle-orm';
import { type Db, getDb } from '@/db/client';
import { articles, articleTags } from '@/db/schema';
import { parseTags } from '@/services/article';
import { resolveTagIds } from '@/services/article-tags';

/** 回填结果摘要。 */
export interface BackfillResult {
  /** 扫描到的未软删文章数。 */
  scanned: number;
  /** 实际建立的关联数（仅计数 catalog 中存在的标签）。 */
  linked: number;
  /** 回填后 article_tags 总关联数。 */
  total: number;
}

/**
 * 回填存量文章的标签关联。
 * @param db 目标库（默认取当前 getDb()）；脚本与单测均可注入，便于复用与验证。
 */
export const backfillArticleTags = async (db: Db = getDb()): Promise<BackfillResult> => {
  const rows = await db
    .select({ id: articles.id, tags: articles.tags })
    .from(articles)
    .where(isNull(articles.deletedAt))
    .all();

  let linked = 0;
  for (const row of rows) {
    const ids = await resolveTagIds(parseTags(row.tags));
    for (const tagId of ids) {
      await db
        .insert(articleTags)
        .values({ articleId: row.id, tagId, createdAt: new Date() })
        .onConflictDoNothing()
        .run();
    }
    linked += ids.length;
  }

  const totalRow = (await db.select({ count: sql<number>`count(*)` }).from(articleTags).all())[0];
  const total = Number(totalRow?.count ?? 0);
  return { scanned: rows.length, linked, total };
};
