/**
 * src/lib/related.ts
 * 文章关联查询（B7）：取已发布文章、上一篇/下一篇、相关文章。
 * 纯查询逻辑，不触碰 HTTP 层；DB 行 snake_case → 契约 camelCase 在此完成。
 *
 * related 基于「共享标签 + 同分类」打分；标签取 articles.tags 去规范化 JSON 列
 * （B2 创建文章即填充，与 article_tags 关联表回填状态无关）。
 */
import { and, asc, desc, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { type ArticleRow, articles } from '@/db/schema';
import { parseTags } from '@/services/article';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 上一篇/下一篇精简投影（ArticleStub）。 */
export interface ArticleStub {
  id: number;
  title: string;
  slug: string | null;
}
/** 相关文章精简投影（ArticleRelatedItem）。 */
export interface ArticleRelatedItem {
  id: number;
  title: string;
  slug: string | null;
  viewCount: number;
}

/** 取已发布文章（含 content）；不存在或未发布 → 404（公开可见性铁律）。 */
export const getPublishedArticle = async (id: number): Promise<ArticleRow> => {
  const row = (
    await getDb()
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (row.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
  return row;
};

/** 上一篇（更早发布）/ 下一篇（更晚发布），均限 published；无则 null。 */
export const getAdjacent = async (
  article: ArticleRow,
): Promise<{ prev: ArticleStub | null; next: ArticleStub | null }> => {
  const db = getDb();
  const base = and(eq(articles.status, 'published'), isNull(articles.deletedAt));
  if (!article.publishedAt) return { prev: null, next: null };
  const cols = { id: articles.id, title: articles.title, slug: articles.slug } as const;
  const prevRow = (
    await db
      .select(cols)
      .from(articles)
      .where(and(base, lt(articles.publishedAt, article.publishedAt)))
      .orderBy(desc(articles.publishedAt))
      .limit(1)
      .all()
  )[0];
  const nextRow = (
    await db
      .select(cols)
      .from(articles)
      .where(and(base, gt(articles.publishedAt, article.publishedAt)))
      .orderBy(asc(articles.publishedAt))
      .limit(1)
      .all()
  )[0];
  return {
    prev: prevRow ? { id: prevRow.id, title: prevRow.title, slug: prevRow.slug ?? null } : null,
    next: nextRow ? { id: nextRow.id, title: nextRow.title, slug: nextRow.slug ?? null } : null,
  };
};

/** 相关文章：共享标签（每份权重 2）+ 同分类（权重 1）打分，排除自身，仅 published，取前 limit 篇。 */
export const getRelated = async (
  article: ArticleRow,
  limit: number,
): Promise<ArticleRelatedItem[]> => {
  const db = getDb();
  const curTags = new Set(parseTags(article.tags));
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      viewCount: articles.viewCount,
      tags: articles.tags,
      categoryId: articles.categoryId,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
        ne(articles.id, article.id),
      ),
    )
    .all();
  return rows
    .map((r) => {
      const shared = parseTags(r.tags).filter((t) => curTags.has(t)).length;
      const sameCat = article.categoryId != null && r.categoryId === article.categoryId ? 1 : 0;
      return {
        id: r.id,
        title: r.title,
        slug: r.slug ?? null,
        viewCount: r.viewCount,
        score: shared * 2 + sameCat,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.viewCount - a.viewCount)
    .slice(0, limit)
    .map(({ id, title, slug, viewCount }) => ({ id, title, slug, viewCount }));
};
