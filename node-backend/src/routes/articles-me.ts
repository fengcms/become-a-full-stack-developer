/**
 * src/routes/articles-me.ts
 * 文章路由（B2）/me/articles 子树：返回当前登录用户自己的全部文章（含非 published 三态）。
 * member 不具备后台权限，故需此端点聚合「我的投稿 / 我的文章」，避免逐条 GET 详情遍历。
 */
import { Hono } from 'hono';
import { type ArticleStatus, queryArticles } from '@/lib/article';
import { paginate } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';

const meArticlesRoute = new Hono<AuthVars>();

/** GET / — 我的文章（全部状态，仅本人），可选 status 筛选。 */
meArticlesRoute.get('/', authMiddleware, guard('member'), async (c) => {
  const me = c.get('user');
  const result = await queryArticles({
    c,
    authorId: Number(me.id),
    status: c.req.query('status') as ArticleStatus | undefined,
  });
  return paginate(result.list, result.pagination);
});

export { meArticlesRoute };
