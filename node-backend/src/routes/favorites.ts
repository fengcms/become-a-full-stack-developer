/**
 * src/routes/favorites.ts
 * 收藏（B6 会员中心）：GET/POST /me/favorites、DELETE /me/favorites/{articleId}。
 * 薄路由：鉴权 + 校验入参 → 调 services/favorites → ok/paginate 格式化。全部限定当前登录用户自身数据。
 * 挂载于 /api/v1（路径 /me/favorites*）。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { addFavorite, listMyFavorites, removeFavorite } from '@/services/favorites';
import { meta, parsePage } from '@/shared/pagination';
import { ok, paginate } from '@/shared/response';

const favoritesRoute = new Hono<AuthVars>();

const favoriteSchema = z.object({ articleId: z.number().int().positive() });
type FavoriteInput = z.infer<typeof favoriteSchema>;

/** GET /me/favorites — 我的收藏（分页，ArticlePage）。 */
favoritesRoute.get('/me/favorites', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
  const { list, total } = await listMyFavorites(userId, pageSize, offset);
  return paginate(list, meta(page, pageSize, total));
});

/** POST /me/favorites — 收藏某文章（幂等；未发布/不存在 → 404）。 */
favoritesRoute.post('/me/favorites', authMiddleware, v.json(favoriteSchema), async (c) => {
  const userId = Number(c.get('user').id);
  const { articleId } = c.req.valid('json') as FavoriteInput;
  return ok(await addFavorite(userId, articleId));
});

/** DELETE /me/favorites/:articleId — 取消收藏（幂等；仅删本人记录）。 */
favoritesRoute.delete('/me/favorites/:articleId', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const articleId = Number(c.req.param('articleId'));
  return ok(await removeFavorite(userId, articleId));
});

export { favoritesRoute };
