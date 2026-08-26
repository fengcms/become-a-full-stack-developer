/**
 * src/services/history.ts
 * 阅读历史领域服务（B6 会员中心，对齐 02 §二 ReadingLog）：列表、上报进度（upsert）、清空、删单条。
 * POST 为唯一写入路径；删除两个端点均幂等，仅本人数据。路由仅做校验 → 调本服务 → 格式化。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, type ViewHistoryRow, viewHistory } from '@/db/schema';
import { type ArticleSummaryRow, toArticleSummary } from '@/services/article';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

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

/** DB 行 → 契约 ReadingHistoryItem（article 摘要 + lastReadAt + progress）。 */
const toHistoryItem = (r: ArticleSummaryRow & Pick<ViewHistoryRow, 'lastReadAt' | 'progress'>) => ({
  article: toArticleSummary(r),
  lastReadAt: r.lastReadAt.toISOString(),
  progress: r.progress ?? null,
});

/** GET /me/history — 我的阅读历史（分页，返回 { list, total }，按 lastReadAt 倒序）。 */
export const listMyHistory = async (
  userId: number,
  pageSize: number,
  offset: number,
): Promise<{ list: ReturnType<typeof toHistoryItem>[]; total: number }> => {
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
  return { list, total: Number(totalRow?.c ?? 0) };
};

/** POST /me/history — 上报阅读进度（upsert 唯写路径；未发布/不存在 → 404）。 */
export const reportReadingProgress = async (
  userId: number,
  articleId: number,
  progress: number | null | undefined,
): Promise<ReturnType<typeof toHistoryItem>> => {
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
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return toHistoryItem(row as ArticleSummaryRow & Pick<ViewHistoryRow, 'lastReadAt' | 'progress'>);
};

/** DELETE /me/history — 清空我的全部阅读历史（幂等）。 */
export const clearMyHistory = async (userId: number): Promise<void> => {
  await getDb().delete(viewHistory).where(eq(viewHistory.userId, userId)).run();
};

/** DELETE /me/history/:articleId — 删除单条阅读历史（幂等；仅本人）。 */
export const deleteMyHistoryItem = async (userId: number, articleId: number): Promise<void> => {
  await getDb()
    .delete(viewHistory)
    .where(and(eq(viewHistory.userId, userId), eq(viewHistory.articleId, articleId)))
    .run();
};
