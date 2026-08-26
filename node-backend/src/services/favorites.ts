/**
 * src/services/favorites.ts
 * 收藏领域服务（B6 会员中心）：我的收藏列表、收藏/取消（幂等）。
 * 全部限定当前登录用户自身数据；路由仅做校验 → 调本服务 → 格式化。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, favorites } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/services/article';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 收藏列表投影列（与 ArticleSummary 对齐，不拉 content 长文本）。 */
const SUMMARY_COLS = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  summary: articles.summary,
  coverImage: articles.coverImage,
  authorId: articles.authorId,
  authorName: articles.authorName,
  categoryId: articles.categoryId,
  categoryName: articles.categoryName,
  tags: articles.tags,
  status: articles.status,
  viewCount: articles.viewCount,
  likeCount: articles.likeCount,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
} as const;

/** GET /me/favorites — 我的收藏（分页，返回 { list, total }，list 为 ArticleSummary[]）。 */
export const listMyFavorites = async (
  userId: number,
  pageSize: number,
  offset: number,
): Promise<{ list: ReturnType<typeof toArticleSummary>[]; total: number }> => {
  const db = getDb();
  const rows = await db
    .select({ ...SUMMARY_COLS, favCreatedAt: favorites.createdAt })
    .from(favorites)
    .innerJoin(articles, eq(favorites.articleId, articles.id))
    .where(and(eq(favorites.userId, userId), isNull(articles.deletedAt)))
    .orderBy(desc(favorites.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await db
      .select({ c: sql<number>`count(*)` })
      .from(favorites)
      .innerJoin(articles, eq(favorites.articleId, articles.id))
      .where(and(eq(favorites.userId, userId), isNull(articles.deletedAt)))
      .all()
  )[0];
  const list = rows.map((r) => toArticleSummary(r as ArticleSummaryRow));
  return { list, total: Number(totalRow?.c ?? 0) };
};

/** POST /me/favorites — 收藏某文章（幂等；未发布/不存在 → 404）。 */
export const addFavorite = async (
  userId: number,
  articleId: number,
): Promise<Record<string, never>> => {
  const article = (
    await getDb()
      .select({ id: articles.id, status: articles.status })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1)
      .all()
  )[0];
  if (article?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
  await getDb()
    .insert(favorites)
    .values({ userId, articleId, createdAt: new Date() })
    .onConflictDoNothing()
    .run();
  return {};
};

/** DELETE /me/favorites/:articleId — 取消收藏（幂等；仅删本人记录）。 */
export const removeFavorite = async (
  userId: number,
  articleId: number,
): Promise<Record<string, never>> => {
  await getDb()
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.articleId, articleId)))
    .run();
  return {};
};
