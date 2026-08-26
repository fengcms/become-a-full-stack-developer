/**
 * src/routes/favorites.ts
 * 收藏（B6 会员中心）：GET/POST /me/favorites、DELETE /me/favorites/{articleId}。
 * 全部限定当前登录用户自身数据；收藏写入幂等（唯一约束 + ON CONFLICT DO NOTHING）。
 * 挂载于 /api/v1（路径 /me/favorites*）。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { articles, favorites } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const favoritesRoute = new Hono<AuthVars>();

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

const favoriteSchema = z.object({ articleId: z.number().int().positive() });
type FavoriteInput = z.infer<typeof favoriteSchema>;

/** GET /me/favorites — 我的收藏（分页，ArticlePage）。 */
favoritesRoute.get('/me/favorites', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
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
  return paginate(list, meta(page, pageSize, Number(totalRow?.c ?? 0)));
});

/** POST /me/favorites — 收藏某文章（幂等；未发布/不存在 → 404）。 */
favoritesRoute.post('/me/favorites', authMiddleware, v.json(favoriteSchema), async (c) => {
  const userId = Number(c.get('user').id);
  const { articleId } = c.req.valid('json') as FavoriteInput;
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
  return ok({});
});

/** DELETE /me/favorites/:articleId — 取消收藏（幂等；仅删本人记录）。 */
favoritesRoute.delete('/me/favorites/:articleId', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const articleId = Number(c.req.param('articleId'));
  await getDb()
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.articleId, articleId)))
    .run();
  return ok({});
});

export { favoritesRoute };
