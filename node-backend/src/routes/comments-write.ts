/**
 * src/routes/comments-write.ts
 * 评论写路由（B4 写侧）：发表 / 删除 / 复核置位。
 * 读侧见 comments-read.ts，二者在 app.ts 同挂 /api/v1。
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位。
 */
import { eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { getDb } from '@/db/client';
import { comments } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import {
  type CommentInput,
  commentInputSchema,
  type ModerateInput,
  moderateContent,
  moderateSchema,
  toComment,
} from '@/lib/comment';
import { resolveArticle, userNameOf } from '@/lib/comment-query';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const commentsWriteRoute = new Hono<AuthVars>();

/** POST /articles/:idOrSlug/comments — 登录发表；未发布文章不可评论；自动敏感词过滤。 */
commentsWriteRoute.post(
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
commentsWriteRoute.delete(
  '/comments/:id',
  authMiddleware,
  guard('editor', resolveCommentOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    const db = getDb();
    await db.delete(comments).where(eq(comments.parentId, id)).run(); // 级联删子回复
    const res = await db.delete(comments).where(eq(comments.id, id)).run();
    // 复用 run() 的 changes 判定存在性，避免与 guard 内 resolveCommentOwner 重复查库（P3-2）
    if (res.changes === 0) throw new AppError(ErrCode.NOT_FOUND, 404);
    return ok({});
  },
);

/** PATCH /comments/:id/status — editor+ 人工复核置位；approved 时清空 rejectedReason。 */
commentsWriteRoute.patch(
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

export { commentsWriteRoute };
