/**
 * src/routes/likes.ts
 * 点赞（B6 会员互动）：POST/DELETE /articles/{id}/like、GET /articles/{id}/like/status、GET /me/likes。
 * 薄路由：鉴权 + 取参 → 调 services/likes → ok 格式化。点赞/取消幂等与计数原子增减在 service 层。
 * GET /like/status 公开（匿名 liked=false）；其余需登录 member。
 * 挂载于 /api/v1（路径 /articles/{id}/like* 与 /me/likes）。
 */
import { Hono } from 'hono';
import { type AuthVars, authMiddleware, optionalAuthMiddleware } from '@/middleware/auth';
import { getLikeStatus, likeArticle, listMyLikes, unlikeArticle } from '@/services/likes';
import { parsePage } from '@/shared/pagination';
import { ok } from '@/shared/response';

const likesRoute = new Hono<AuthVars>();

/** POST /articles/:id/like — 点赞（幂等）。 */
likesRoute.post('/articles/:id/like', authMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const userId = Number(c.get('user').id);
  return ok(await likeArticle(userId, articleId));
});

/** DELETE /articles/:id/like — 取消点赞（幂等）。 */
likesRoute.delete('/articles/:id/like', authMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const userId = Number(c.get('user').id);
  return ok(await unlikeArticle(userId, articleId));
});

/** GET /articles/:id/like/status — 当前用户点赞态 + 总赞数（公开，匿名 liked=false）。 */
likesRoute.get('/articles/:id/like/status', optionalAuthMiddleware, async (c) => {
  const articleId = Number(c.req.param('id'));
  const me = c.get('user');
  return ok(await getLikeStatus(articleId, me ? Number(me.id) : null));
});

/** GET /me/likes — 我点赞过的文章（published，按点赞时间倒序；契约 data 为裸数组）。 */
likesRoute.get('/me/likes', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { pageSize, offset } = parsePage(c);
  return ok(await listMyLikes(userId, pageSize, offset));
});

export { likesRoute };
