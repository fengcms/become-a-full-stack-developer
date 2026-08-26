/**
 * src/services/likes.ts
 * 点赞领域服务（B6 会员互动）：点赞/取消（幂等）、点赞态查询、我的点赞列表。
 * 所有 DB 查询与计数原子增减在此完成；路由仅做校验 → 调本服务 → ok 格式化。
 * 计数采用 ON CONFLICT DO NOTHING + 原子 SQL（like_count ± 1），无读改写竞态漂移。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, likes } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/services/article';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

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

/** 取未删除文章的当前 like_count；不存在 → 抛 404。 */
export const requireLikeArticle = async (articleId: number) => {
  const a = (
    await getDb()
      .select({ id: articles.id, likeCount: articles.likeCount })
      .from(articles)
      .where(and(eq(articles.id, articleId), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!a) throw new AppError(ErrCode.NOT_FOUND, 404);
  return a;
};

/** POST /articles/:id/like — 点赞（幂等：并发双发亦仅 +1，绝不一错 500）。 */
export const likeArticle = async (
  userId: number,
  articleId: number,
): Promise<{ liked: true; likeCount: number }> => {
  await requireLikeArticle(articleId);
  const db = getDb();
  // DB 层幂等：唯一约束 ON CONFLICT DO NOTHING，并发双发不会撞约束 500。
  const res = await db
    .insert(likes)
    .values({ userId, articleId, createdAt: new Date() })
    .onConflictDoNothing()
    .run();
  // 仅当本次确实新增一行时才原子 +1，避免应用层读改写竞态导致的计数漂移。
  if (res.changes > 0) {
    await db
      .update(articles)
      .set({ likeCount: sql`like_count + 1` })
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
  return { liked: true, likeCount: fresh.likeCount };
};

/** DELETE /articles/:id/like — 取消点赞（幂等：未赞仍返回 liked=false）。 */
export const unlikeArticle = async (
  userId: number,
  articleId: number,
): Promise<{ liked: false; likeCount: number }> => {
  await requireLikeArticle(articleId);
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
    // 原子下限夹 0：-1 永不产生负数，且并发下读数陈旧也不漂移。
    await db
      .update(articles)
      .set({ likeCount: sql`CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END` })
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
  return { liked: false, likeCount: fresh.likeCount };
};

/** GET /articles/:id/like/status — 当前用户点赞态 + 总赞数（匿名 liked=false）。 */
export const getLikeStatus = async (
  articleId: number,
  userId: number | null,
): Promise<{ liked: boolean; likeCount: number }> => {
  const article = await requireLikeArticle(articleId);
  let liked = false;
  if (userId != null) {
    const row = (
      await getDb()
        .select({ id: likes.id })
        .from(likes)
        .where(and(eq(likes.userId, userId), eq(likes.articleId, articleId)))
        .limit(1)
        .all()
    )[0];
    liked = !!row;
  }
  return { liked, likeCount: article.likeCount };
};

/** GET /me/likes — 我点赞过的文章（published，按点赞时间倒序；返回 ArticleSummary[]）。 */
export const listMyLikes = async (
  userId: number,
  pageSize: number,
  offset: number,
): Promise<ReturnType<typeof toArticleSummary>[]> => {
  const rows = await getDb()
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
  return rows.map((r) => toArticleSummary(r as ArticleSummaryRow));
};
