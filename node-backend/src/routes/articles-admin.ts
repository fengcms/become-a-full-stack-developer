/**
 * src/routes/articles-admin.ts
 * 文章路由（B2）/admin/articles 子树：后台列表 + 审核通过（approve）+ 任意置位（status）。
 * - 列表：editor/admin 可见全部文章（含 draft/pending），支持 status/keyword/tag/category 筛选。
 * - approve：pending→published，非 pending 前态→3003。
 * - status：admin 万能置位，不受 N9-2 矩阵限制，同态幂等 200（下架/退回专用）。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { articles } from '@/db/schema';
import { type ArticleStatus, queryArticles, toArticle } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const setStatusSchema = z.object({ status: z.enum(['draft', 'pending', 'published']) });
type SetStatusInput = z.infer<typeof setStatusSchema>;

const adminArticlesRoute = new Hono<AuthVars>();

/** GET / — 后台列表（鉴权，全部状态，支持筛选）。 */
adminArticlesRoute.get('/', authMiddleware, guard('editor'), async (c) => {
  const result = await queryArticles({
    c,
    status: c.req.query('status') as ArticleStatus | undefined,
    keyword: c.req.query('keyword') ?? undefined,
    tag: c.req.query('tag') ?? undefined,
    category: c.req.query('category') ?? undefined,
  });
  return paginate(result.list, result.pagination);
});

/** POST /:id/approve — pending→published（editor/admin），非 pending 前态→3003。 */
adminArticlesRoute.post('/:id/approve', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (existing.status !== 'pending') throw new AppError(ErrCode.STATE_CONFLICT, 409); // 3003
  const now = new Date();
  await db
    .update(articles)
    .set({ status: 'published', publishedAt: existing.publishedAt ?? now, updatedAt: now })
    .where(eq(articles.id, id))
    .run();
  const updated = (await db.select().from(articles).where(eq(articles.id, id)).limit(1).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return ok(toArticle(updated));
});

/** POST /:id/status — admin 任意置位（不受矩阵限制），同态幂等 200。 */
adminArticlesRoute.post(
  '/:id/status',
  authMiddleware,
  guard('admin'),
  v.json(setStatusSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const db = getDb();
    const existing = (
      await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
        .limit(1)
        .all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
    const { status } = c.req.valid('json') as SetStatusInput;
    if (status === existing.status) return ok(toArticle(existing)); // 幂等
    const now = new Date();
    const publishedAt = status === 'published' ? (existing.publishedAt ?? now) : null;
    await db
      .update(articles)
      .set({ status, publishedAt, updatedAt: now })
      .where(eq(articles.id, id))
      .run();
    const updated = (await db.select().from(articles).where(eq(articles.id, id)).limit(1).all())[0];
    if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toArticle(updated));
  },
);

export { adminArticlesRoute };
