/**
 * src/routes/comments.ts
 * 评论路由（读 + 写，合并自 comments-read/write）：公开/后台列表 + 发表/删除/复核置位。
 * 薄路由：解析鉴权身份 → 调 services/comment → ok/paginate 格式化。可见性/存在性判定已下沉 service。
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位；公开列表恒只返 approved。
 */
import { type Context, Hono } from 'hono';
import { type AuthVars, authMiddleware, guard, optionalAuthMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  type CommentInput,
  type CommentStatus,
  commentInputSchema,
  createComment,
  deleteComment,
  getCommentOwnerId,
  listAdminComments,
  listArticleComments,
  type ModerateInput,
  moderateComment,
  moderateSchema,
} from '@/services/comment';
import { meta, parsePage } from '@/shared/pagination';
import { ok, paginate } from '@/shared/response';

const commentsRoute = new Hono<AuthVars>();

/** 评论归属解析（guard ownerOverride 用）：保留为路由桥接，DB 查库下沉到 service。 */
const resolveCommentOwner = async (c: Context<AuthVars>): Promise<string | null> => {
  const id = Number(c.req.param('id'));
  return getCommentOwnerId(id);
};

// —— 读 ——
/** GET /articles/:idOrSlug/comments — 公开仅 approved；未发布文章匿名 404，作者/admin 可看（仍只 approved）。 */
commentsRoute.get('/articles/:idOrSlug/comments', optionalAuthMiddleware, async (c) => {
  const me = c.get('user');
  const { page, pageSize, offset } = parsePage(c);
  const { items, total } = await listArticleComments(
    c.req.param('idOrSlug'),
    me ? { id: String(me.id), role: me.role } : null,
    pageSize,
    offset,
  );
  return paginate(items, meta(page, pageSize, total));
});

/** GET /admin/comments — editor+ 后台列表（全状态），可按 status / articleId 筛选。 */
commentsRoute.get('/admin/comments', authMiddleware, guard('editor'), async (c) => {
  const status = c.req.query('status') as CommentStatus | undefined;
  const articleId = c.req.query('articleId');
  const { page, pageSize, offset } = parsePage(c);
  const { items, total } = await listAdminComments(
    status,
    articleId ? Number(articleId) : undefined,
    pageSize,
    offset,
  );
  return paginate(items, meta(page, pageSize, total));
});

// —— 写 ——
/** POST /articles/:idOrSlug/comments — 登录发表；未发布文章不可评论；自动敏感词过滤。 */
commentsRoute.post(
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
commentsRoute.delete(
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
commentsRoute.patch(
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

export { commentsRoute };
