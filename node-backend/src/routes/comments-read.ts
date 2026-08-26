/**
 * src/routes/comments-read.ts
 * 评论读路由（B4 读侧）：公开列表 + 后台列表。
 * 薄路由：解析鉴权身份 → 调 services/comment 列表函数 → paginate 格式化。
 * 写侧见 comments-write.ts，二者在 app.ts 同挂 /api/v1。
 *
 * 关键纪律（对齐契约 + 02 §2.5）：三态 approved/rejected/reviewing；
 * 自动流只产出 approved/rejected，reviewing 仅由 PATCH 人工置位；公开列表恒只返 approved。
 */

import { Hono } from 'hono';
import { type AuthVars, authMiddleware, guard, optionalAuthMiddleware } from '@/middleware/auth';
import { type CommentStatus, listAdminComments, listArticleComments } from '@/services/comment';
import { meta, parsePage } from '@/shared/pagination';
import { paginate } from '@/shared/response';

const commentsReadRoute = new Hono<AuthVars>();

/** GET /articles/:idOrSlug/comments — 公开仅 approved；未发布文章匿名 404，作者/admin 可看（仍只 approved）。 */
commentsReadRoute.get('/articles/:idOrSlug/comments', optionalAuthMiddleware, async (c) => {
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
commentsReadRoute.get('/admin/comments', authMiddleware, guard('editor'), async (c) => {
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

export { commentsReadRoute };
