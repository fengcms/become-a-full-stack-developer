/**
 * src/routes/comments.ts
 * 评论批次（B4）全部 5 端点，统一挂在 /api/v1 下：
 *   GET    /articles/:idOrSlug/comments  公开列表（仅 approved；未发布文章匿名 404）
 *   POST   /articles/:idOrSlug/comments  登录发表（自动敏感词过滤，approved/rejected）
 *   DELETE /comments/:id                 owner 或 editor+ 删除，级联删子回复（x-cascade: children）
 *   PATCH  /comments/:id/status          editor+ 人工复核置位（reviewing 唯一进出路径）
 *   GET    /admin/comments              editor+ 后台列表（全状态，可按 status/articleId 筛选）
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位；公开列表恒只返 approved。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { getDb } from '@/db/client';
import { articles, comments, users } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import {
  type CommentInput,
  type CommentStatus,
  commentInputSchema,
  type ModerateInput,
  moderateContent,
  moderateSchema,
  toComment,
} from '@/lib/comment';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware, guard, optionalAuthMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

/** 按 id 或 slug 解析未软删文章；不存在返回 null。 */
const resolveArticle = async (
  key: string,
): Promise<{ id: number; status: string; authorId: number } | null> => {
  const where = /^\d+$/.test(key)
    ? and(eq(articles.id, Number(key)), isNull(articles.deletedAt))
    : and(eq(articles.slug, key), isNull(articles.deletedAt));
  const row = (
    await getDb()
      .select({ id: articles.id, status: articles.status, authorId: articles.authorId })
      .from(articles)
      .where(where)
      .limit(1)
      .all()
  )[0];
  return row ?? null;
};

/** 取当前登录用户名（displayName 优先，降级 username）。 */
const userNameOf = async (userId: number): Promise<string> => {
  const u = (
    await getDb()
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .all()
  )[0];
  return u?.displayName ?? u?.username ?? '匿名用户';
};

const commentsRoute = new Hono<AuthVars>();

/** GET /articles/:idOrSlug/comments — 公开仅 approved；未发布文章匿名 404，作者/admin 可看（仍只 approved）。 */
commentsRoute.get('/articles/:idOrSlug/comments', optionalAuthMiddleware, async (c) => {
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

/** POST /articles/:idOrSlug/comments — 登录发表；未发布文章不可评论；自动敏感词过滤。 */
commentsRoute.post(
  '/articles/:idOrSlug/comments',
  authMiddleware,
  v.json(commentInputSchema),
  async (c) => {
    const me = c.get('user');
    const article = await resolveArticle(c.req.param('idOrSlug'));
    if (article?.status !== 'published') throw new AppError(ErrCode.NOT_FOUND, 404);
    const body = c.req.valid('json') as CommentInput;
    if (body.parentId != null) {
      const parent = (
        await getDb()
          .select({ id: comments.id, articleId: comments.articleId })
          .from(comments)
          .where(eq(comments.id, body.parentId))
          .limit(1)
          .all()
      )[0];
      if (!parent || parent.articleId !== article.id) throw new AppError(ErrCode.NOT_FOUND, 404);
    }
    const mod = moderateContent(body.content);
    const userId = Number(me.id);
    const [row] = await getDb()
      .insert(comments)
      .values({
        articleId: article.id,
        userId,
        userName: await userNameOf(userId),
        parentId: body.parentId ?? null,
        content: mod.content,
        status: mod.status,
        createdAt: new Date(),
      })
      .returning()
      .all();
    if (!row) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toComment(row));
  },
);

/** 解析评论归属：加载并校验存在性（缺失 → 404），返回 userId 供 ownerOverride 判定。 */
const resolveCommentOwner = async (c: Context<AuthVars>): Promise<string | null> => {
  const id = Number(c.req.param('id'));
  const cm = (
    await getDb()
      .select({ userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1)
      .all()
  )[0];
  if (!cm) throw new AppError(ErrCode.NOT_FOUND, 404);
  return String(cm.userId);
};

/** DELETE /comments/:id — owner 或 editor+ 可删；级联删其子回复（x-cascade: children）。 */
commentsRoute.delete(
  '/comments/:id',
  authMiddleware,
  guard('editor', resolveCommentOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    const existing = (
      await getDb()
        .select({ id: comments.id })
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1)
        .all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
    const db = getDb();
    await db.delete(comments).where(eq(comments.parentId, id)).run(); // 级联删子回复
    await db.delete(comments).where(eq(comments.id, id)).run();
    return ok({});
  },
);

/** PATCH /comments/:id/status — editor+ 人工复核置位；approved 时清空 rejectedReason。 */
commentsRoute.patch(
  '/comments/:id/status',
  authMiddleware,
  guard('editor'),
  v.json(moderateSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const existing = (
      await getDb().select().from(comments).where(eq(comments.id, id)).limit(1).all()
    )[0];
    if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
    const { status, reason } = c.req.valid('json') as ModerateInput;
    const rejectedReason = status === 'approved' ? null : (reason ?? existing.rejectedReason);
    const [row] = await getDb()
      .update(comments)
      .set({ status, rejectedReason })
      .where(eq(comments.id, id))
      .returning()
      .all();
    if (!row) throw new AppError(ErrCode.INTERNAL, 500);
    return ok(toComment(row));
  },
);

/** GET /admin/comments — editor+ 后台列表（全状态），可按 status / articleId 筛选。 */
commentsRoute.get('/admin/comments', authMiddleware, guard('editor'), async (c) => {
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

export { commentsRoute };
