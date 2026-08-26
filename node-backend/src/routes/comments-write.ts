/**
 * src/routes/comments-write.ts
 * 评论写路由（B4 写侧）：发表 / 删除 / 复核置位。
 * 薄路由：鉴权 + 校验入参 → 调 services/comment → ok 格式化。可见性/存在性判定已下沉 service。
 * 读侧见 comments-read.ts，二者在 app.ts 同挂 /api/v1。
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位。
 */
import { type Context, Hono } from 'hono';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  type CommentInput,
  commentInputSchema,
  createComment,
  deleteComment,
  getCommentOwnerId,
  type ModerateInput,
  moderateComment,
  moderateSchema,
} from '@/services/comment';
import { ok } from '@/shared/response';

const commentsWriteRoute = new Hono<AuthVars>();

/** 评论归属解析（guard ownerOverride 用）：保留为路由桥接，DB 查库下沉到 service。 */
const resolveCommentOwner = async (c: Context<AuthVars>): Promise<string | null> => {
  const id = Number(c.req.param('id'));
  return getCommentOwnerId(id);
};

/** POST /articles/:idOrSlug/comments — 登录发表；未发布文章不可评论；自动敏感词过滤。 */
commentsWriteRoute.post(
  '/articles/:idOrSlug/comments',
  authMiddleware,
  v.json(commentInputSchema),
  async (c) => {
    const userId = Number(c.get('user').id);
    const body = c.req.valid('json') as CommentInput;
    return ok(await createComment(userId, c.req.param('idOrSlug'), body));
  },
);

/** DELETE /comments/:id — owner 或 editor+ 可删；级联删其子回复（x-cascade: children）。 */
commentsWriteRoute.delete(
  '/comments/:id',
  authMiddleware,
  guard('editor', resolveCommentOwner),
  async (c) => {
    const id = Number(c.req.param('id'));
    await deleteComment(id);
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
    const { status, reason } = c.req.valid('json') as ModerateInput;
    return ok(await moderateComment(id, status, reason));
  },
);

export { commentsWriteRoute };
