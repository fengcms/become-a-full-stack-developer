/**
 * src/routes/articles-read.ts
 * 文章公开/登录读路由（B2 核心 /articles 子树读侧）：列表 / 详情 / 阅读量。
 * 写侧见 articles-write.ts，二者在 app.ts 同挂 /api/v1/articles。
 *
 * 关键纪律（对齐契约与 02 §2.2/§2.3/§3.3）：
 * - 公开列表/详情仅返 published；未发布详情对匿名 404（隐瞒存在性）。
 * - 阅读量去重 24h 冷却（§3.3 留契约外，实现见下）。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { articles, articleViewDedup } from '@/db/schema';
import { fnv1a, queryArticles, toArticle } from '@/lib/article';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, optionalAuthMiddleware } from '@/middleware/auth';

const VIEW_DEDUP_MS = 24 * 60 * 60 * 1000;

const articlesReadRoute = new Hono<AuthVars>();

/** GET / — 公开列表，强制仅 published（?status= 被忽略）。 */
articlesReadRoute.get('/', async (c) => {
  const result = await queryArticles({
    c,
    forcedStatus: 'published',
    keyword: c.req.query('keyword') ?? undefined,
    tag: c.req.query('tag') ?? undefined,
    category: c.req.query('category') ?? undefined,
  });
  return paginate(result.list, result.pagination);
});

/** GET /:idOrSlug — 详情；id 或 slug 解析；匿名仅 published；owner/admin 可见任意态。 */
articlesReadRoute.get('/:idOrSlug', optionalAuthMiddleware, async (c) => {
  const key = c.req.param('idOrSlug');
  const db = getDb();
  const where = /^\d+$/.test(key)
    ? and(eq(articles.id, Number(key)), isNull(articles.deletedAt))
    : and(eq(articles.slug, key), isNull(articles.deletedAt));
  const row = (await db.select().from(articles).where(where).limit(1).all())[0];
  if (!row) throw new AppError(ErrCode.NOT_FOUND, 404);

  const me = c.get('user') as AuthVars['Variables']['user'] | undefined;
  const owner = me && String(row.authorId) === me.id;
  const visible = row.status === 'published' || owner || me?.role === 'admin';
  if (!visible) throw new AppError(ErrCode.NOT_FOUND, 404); // 未发布对非授权者隐瞒
  return ok(toArticle(row));
});

/** POST /:id/view — 阅读量 +1（带去重）；仅 published 可计数，否则 404。
 * 去重采用「24h 时间桶」：dedupKey = baseKey#bucket，bucket = floor(now/WINDOW)。
 * 冷却过后桶号自然变化 → 不再撞旧记录，根除「永久唯一约束 vs 24h 冷却」的 500；
 * 同窗口并发插入撞唯一约束 → isUniqueConstraintError 兜底，跳过增量、返回 200，不重复计数。 */
articlesReadRoute.post('/:id/view', optionalAuthMiddleware, async (c) => {
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
  if (existing?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);

  const me = c.get('user') as AuthVars['Variables']['user'] | undefined;
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? '';
  const ua = c.req.header('user-agent') ?? '';
  const baseKey = me ? `u:${me.id}` : `a:${fnv1a(`${ip}|${ua}`)}`;
  const bucket = Math.floor(Date.now() / VIEW_DEDUP_MS); // 每 24h 一个桶
  const dedupKey = `${baseKey}#${bucket}`;

  const recent = await db
    .select({ id: articleViewDedup.id })
    .from(articleViewDedup)
    .where(and(eq(articleViewDedup.articleId, id), eq(articleViewDedup.dedupKey, dedupKey)))
    .limit(1)
    .all();
  if (recent.length === 0) {
    try {
      await db
        .insert(articleViewDedup)
        .values({ articleId: id, dedupKey, createdAt: new Date() })
        .run();
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        // 同窗口并发重复插入：视作已计数，跳过增量（不重复计数、不抛 500）
        const cur = (
          await db
            .select({ viewCount: articles.viewCount })
            .from(articles)
            .where(eq(articles.id, id))
            .limit(1)
            .all()
        )[0];
        return ok({ viewCount: cur?.viewCount ?? existing.viewCount });
      }
      throw err;
    }
    await db
      .update(articles)
      .set({ viewCount: sql`${articles.viewCount} + 1` })
      .where(eq(articles.id, id))
      .run();
  }
  const rows = await db
    .select({ viewCount: articles.viewCount })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1)
    .all();
  const updated = rows[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return ok({ viewCount: updated.viewCount });
});

export { articlesReadRoute };
