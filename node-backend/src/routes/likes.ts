/**
 * src/routes/likes.ts
 * 点赞（B6 会员互动，对齐 02 §二 Like）：POST/DELETE /articles/{id}/like、GET /articles/{id}/like/status、GET /me/likes。
 * 点赞/取消均为幂等（唯一约束 + 应用层判存）；articles.like_count 由应用层维护，与 likes 行数一致。
 * GET /like/status 公开（匿名 liked=false）；其余需登录 member。
 * 挂载于 /api/v1（路径 /articles/{id}/like* 与 /me/likes）。
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { articles, likes } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { parsePage } from '@/lib/pagination';
import { ok } from '@/lib/response';
import { type AuthVars, authMiddleware, optionalAuthMiddleware } from '@/middleware/auth';

const likesRoute = new Hono<AuthVars>();

/** 文章摘要投影列（不拉 content 长文本）。 */
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

/** 取文章（未删除）的当前 like_count；不存在 → 抛 404。 */
const requireArticle = async (id: number) => {
  const a = (
    await getDb()
      .select({ id: articles.id, likeCount: articles.likeCount })
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!a) throw new AppError(ErrCode.NOT_FOUND, 404);
  return a;
};

/** POST /articles/:id/like — 点赞（幂等：已赞仍返回 liked=true + 当前 likeCount）。 */
likesRoute.post('/articles/:id/like', authMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const userId = Number(c.get('user').id);
  const article = await requireArticle(articleId);
  const db = getDb();
  const existing = (
    await db
      .select({ id: likes.id })
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.articleId, articleId)))
      .limit(1)
      .all()
  )[0];
  if (!existing) {
    await db.insert(likes).values({ userId, articleId, createdAt: new Date() }).run();
    await db
      .update(articles)
      .set({ likeCount: article.likeCount + 1 })
      .where(eq(articles.id, articleId))
      .run();
  }
  const fresh = (
    await db
      .select({ likeCount: articles.likeCount })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1)
      .all()
  )[0];
  if (!fresh) throw new AppError(ErrCode.INTERNAL, 500);
  return ok({ liked: true, likeCount: fresh.likeCount });
});

/** DELETE /articles/:id/like — 取消点赞（幂等：未赞仍返回 liked=false）。 */
likesRoute.delete('/articles/:id/like', authMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const userId = Number(c.get('user').id);
  const article = await requireArticle(articleId);
  const db = getDb();
  const existing = (
    await db
      .select({ id: likes.id })
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.articleId, articleId)))
      .limit(1)
      .all()
  )[0];
  if (existing) {
    await db.delete(likes).where(eq(likes.id, existing.id)).run();
    await db
      .update(articles)
      .set({ likeCount: Math.max(0, article.likeCount - 1) })
      .where(eq(articles.id, articleId))
      .run();
  }
  const fresh = (
    await db
      .select({ likeCount: articles.likeCount })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1)
      .all()
  )[0];
  if (!fresh) throw new AppError(ErrCode.INTERNAL, 500);
  return ok({ liked: false, likeCount: fresh.likeCount });
});

/** GET /articles/:id/like/status — 当前用户点赞态 + 总赞数（公开，匿名 liked=false）。 */
likesRoute.get('/articles/:id/like/status', optionalAuthMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const article = await requireArticle(articleId);
  const me = c.get('user');
  let liked = false;
  if (me) {
    const row = (
      await getDb()
        .select({ id: likes.id })
        .from(likes)
        .where(and(eq(likes.userId, Number(me.id)), eq(likes.articleId, articleId)))
        .limit(1)
        .all()
    )[0];
    liked = !!row;
  }
  return ok({ liked, likeCount: article.likeCount });
});

/** GET /me/likes — 我点赞过的文章（published，按点赞时间倒序；契约 data 为裸数组）。 */
likesRoute.get('/me/likes', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { pageSize, offset } = parsePage(c);
  const db = getDb();
  const rows = await db
    .select({ ...SUMMARY_COLS })
    .from(likes)
    .innerJoin(articles, eq(likes.articleId, articles.id))
    .where(
      and(eq(likes.userId, userId), eq(articles.status, 'published'), isNull(articles.deletedAt)),
    )
    .orderBy(desc(likes.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const list = rows.map((r) => toArticleSummary(r as ArticleSummaryRow));
  return ok(list);
});

export { likesRoute };
