/**
 * src/routes/comments-read.ts
 * 评论读路由（B4 读侧）：公开列表 + 后台列表。
 * 写侧见 comments-write.ts，二者在 app.ts 同挂 /api/v1。
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位；公开列表恒只返 approved。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { comments } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { type CommentStatus, toComment } from '@/lib/comment';
import { resolveArticle } from '@/lib/comment-query';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { paginate } from '@/lib/response';
import { type AuthVars, authMiddleware, guard, optionalAuthMiddleware } from '@/middleware/auth';

const commentsReadRoute = new Hono<AuthVars>();

/** GET /articles/:idOrSlug/comments — 公开仅 approved；未发布文章匿名 404，作者/admin 可看（仍只 approved）。 */
commentsReadRoute.get('/articles/:idOrSlug/comments', optionalAuthMiddleware, async (c) => {
  const article = await resolveArticle(c.req.param('idOrSlug'));
  if (!article) throw new AppError(ErrCode.NOT_FOUND, 404);
  const me = c.get('user');
  const privileged = me && (String(article.authorId) === me.id || me.role === 'admin');
  if (article.status !== 'published' && !privileged) throw new AppError(ErrCode.NOT_FOUND, 404);

  const { page, pageSize, offset } = parsePage(c);
  const db = getDb();
  const conds = and(eq(comments.articleId, article.id), eq(comments.status, 'approved'));
  const rows = await db
    .select()
    .from(comments)
    .where(conds)
    .orderBy(comments.createdAt)
    .limit(pageSize)
    .offset(offset)
    .all();
  const total = Number(
    (await db.select({ c: sql<number>`count(*)` }).from(comments).where(conds).all())[0]?.c ?? 0,
  );
  return paginate(rows.map(toComment), meta(page, pageSize, total));
});

/** GET /admin/comments — editor+ 后台列表（全状态），可按 status / articleId 筛选。 */
commentsReadRoute.get('/admin/comments', authMiddleware, guard('editor'), async (c) => {
  const status = c.req.query('status') as CommentStatus | undefined;
  const articleId = c.req.query('articleId');
  const where = and(
    status ? eq(comments.status, status) : undefined,
    articleId ? eq(comments.articleId, Number(articleId)) : undefined,
  );
  const { page, pageSize, offset } = parsePage(c);
  const db = getDb();
  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const total = Number(
    (await db.select({ c: sql<number>`count(*)` }).from(comments).where(where).all())[0]?.c ?? 0,
  );
  return paginate(rows.map(toComment), meta(page, pageSize, total));
});

export { commentsReadRoute };
