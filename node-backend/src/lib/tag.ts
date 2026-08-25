/**
 * src/lib/tag.ts
 * 标签领域纯逻辑：序列化与 articleCount 聚合。
 *
 * articleCount 聚合策略（呼应 B2 复批「改为关联表精确 IN 查询」建议）：
 * 由 article_tags 关联表 JOIN 已发布且未软删的文章计数，得到每个标签下的有效文章数。
 * 该计数精确、不依赖 articles.tags 的 JSON 子串匹配。
 * 关联表的回填入口（创建/更新文章时同步写入）属 B2/B4 文章提交逻辑，按 B3「禁止项」不在此实现，
 * 故当前 junction 通常为空、articleCount 为 0；待文章提交增强后计数自动生效（见 B3-NOTES）。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, articleTags, type TagRow } from '@/db/schema';

/** DB 行 → 契约 Tag（含实时 articleCount）。 */
export const toTag = (t: TagRow, articleCount: number) => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  articleCount,
});

/**
 * 批量聚合各标签的有效文章数：article_tags JOIN 已发布、未删除文章，按 tagId 分组计数。
 * @returns Map<tagId, count>
 */
export const tagArticleCounts = async (): Promise<Map<number, number>> => {
  const rows = await getDb()
    .select({
      tagId: articleTags.tagId,
      count: sql<number>`count(*)`,
    })
    .from(articleTags)
    .innerJoin(
      articles,
      and(
        eq(articleTags.articleId, articles.id),
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
      ),
    )
    .groupBy(articleTags.tagId)
    .all();
  return new Map(rows.map((r) => [r.tagId, Number(r.count)]));
};
