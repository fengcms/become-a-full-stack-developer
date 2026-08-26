/**
 * src/routes/history.ts
 * 阅读历史（B6 会员中心，对齐 02 §二 ReadingLog）：GET/POST /me/history、DELETE /me/history、DELETE /me/history/{articleId}。
 * POST 为唯一写入路径（upsert last_read_at + 可选 progress）；删除两个端点均幂等，仅本人数据。
 * 挂载于 /api/v1（路径 /me/history*）。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { articles, type ViewHistoryRow, viewHistory } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const historyRoute = new Hono<AuthVars>();

/** 历史列表投影列（文章摘要 + 阅读元数据）。 */
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

const historySchema = z.object({
  articleId: z.number().int().positive(),
  progress: z.number().int().min(0).max(100).nullable().optional(),
});
type HistoryInput = z.infer<typeof historySchema>;

/** DB 行 → 契约 ReadingHistoryItem（article 摘要 + lastReadAt + progress）。 */
const toHistoryItem = (r: ArticleSummaryRow & Pick<ViewHistoryRow, 'lastReadAt' | 'progress'>) => ({
  article: toArticleSummary(r),
  lastReadAt: r.lastReadAt.toISOString(),
  progress: r.progress ?? null,
});

/** GET /me/history — 我的阅读历史（分页，HistoryPage，按 lastReadAt 倒序）。 */
historyRoute.get('/me/history', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
  const db = getDb();
  const rows = await db
    .select({ ...SUMMARY_COLS, lastReadAt: viewHistory.lastReadAt, progress: viewHistory.progress })
    .from(viewHistory)
    .innerJoin(articles, eq(viewHistory.articleId, articles.id))
    .where(and(eq(viewHistory.userId, userId), isNull(articles.deletedAt)))
    .orderBy(desc(viewHistory.lastReadAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await db
      .select({ c: sql<number>`count(*)` })
      .from(viewHistory)
      .innerJoin(articles, eq(viewHistory.articleId, articles.id))
      .where(and(eq(viewHistory.userId, userId), isNull(articles.deletedAt)))
      .all()
  )[0];
  const list = rows.map((r) =>
    toHistoryItem(r as ArticleSummaryRow & Pick<ViewHistoryRow, 'lastReadAt' | 'progress'>),
  );
  return paginate(list, meta(page, pageSize, Number(totalRow?.c ?? 0)));
});

/** POST /me/history — 上报阅读进度（upsert 唯写路径；未发布/不存在 → 404）。 */
historyRoute.post('/me/history', authMiddleware, v.json(historySchema), async (c) => {
  const userId = Number(c.get('user').id);
  const { articleId, progress } = c.req.valid('json') as HistoryInput;
  const article = (
    await getDb()
      .select({ id: articles.id, status: articles.status })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1)
      .all()
  )[0];
  if (article?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
  const db = getDb();
  const now = new Date();
  // DB 层 upsert：并发双发不会再撞 uniq_view_history → 500（P3-1）。
  // 冲突时仅更新 lastReadAt；progress 仅在请求显式携带时才覆盖。
  const onConflictSet: { lastReadAt: Date; progress?: number | null } = { lastReadAt: now };
  if (progress !== undefined) onConflictSet.progress = progress;
  await db
    .insert(viewHistory)
    .values({ userId, articleId, lastReadAt: now, progress: progress ?? null })
    .onConflictDoUpdate({
      target: [viewHistory.userId, viewHistory.articleId],
      set: onConflictSet,
    })
    .run();
  const row = (
    await db
      .select({
        ...SUMMARY_COLS,
        lastReadAt: viewHistory.lastReadAt,
        progress: viewHistory.progress,
      })
      .from(viewHistory)
      .innerJoin(articles, eq(viewHistory.articleId, articles.id))
      .where(and(eq(viewHistory.userId, userId), eq(viewHistory.articleId, articleId)))
      .limit(1)
      .all()
  )[0];
  return ok(
    toHistoryItem(row as ArticleSummaryRow & Pick<ViewHistoryRow, 'lastReadAt' | 'progress'>),
  );
});

/** DELETE /me/history — 清空我的全部阅读历史（幂等）。 */
historyRoute.delete('/me/history', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  await getDb().delete(viewHistory).where(eq(viewHistory.userId, userId)).run();
  return ok({});
});

/** DELETE /me/history/:articleId — 删除单条阅读历史（幂等；仅本人）。 */
historyRoute.delete('/me/history/:articleId', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const articleId = Number(c.req.param('articleId'));
  await getDb()
    .delete(viewHistory)
    .where(and(eq(viewHistory.userId, userId), eq(viewHistory.articleId, articleId)))
    .run();
  return ok({});
});

export { historyRoute };
