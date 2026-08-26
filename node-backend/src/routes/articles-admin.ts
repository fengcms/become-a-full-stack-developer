/**
 * src/routes/articles-admin.ts
 * 文章路由（B2）/admin/articles 子树：后台列表 + 审核通过（approve）+ 任意置位（status）。
 * 薄路由：鉴权 + 校验入参 → 调 services/article → ok/paginate 格式化。
 *
 * - 列表：editor/admin 可见全部文章（含 draft/pending），支持 status/keyword/tag/category 筛选。
 * - approve：pending→published，非 pending 前态→3003。
 * - status：admin 万能置位，不受 N9-2 矩阵限制，同态幂等 200（下架/退回专用）。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  type ArticleStatus,
  approveArticle,
  queryArticles,
  setArticleStatus,
} from '@/services/article';
import { ok, paginate } from '@/shared/response';

const setStatusSchema = z.object({ status: z.enum(['draft', 'pending', 'published']) });
type SetStatusInput = z.infer<typeof setStatusSchema>;

const adminArticlesRoute = new Hono<AuthVars>();

/** GET / — 后台列表（鉴权，全部状态，支持筛选）。 */
adminArticlesRoute.get('/', authMiddleware, guard('editor'), async (c) => {
  const result = await queryArticles({
    c,
    status: c.req.query('status') as ArticleStatus | undefined,
    keyword: c.req.query('keyword') ?? undefined,
    tag: c.req.query('tag') ?? undefined,
    category: c.req.query('category') ?? undefined,
  });
  return paginate(result.list, result.pagination);
});

/** POST /:id/approve — pending→published（editor/admin），非 pending 前态→3003。 */
adminArticlesRoute.post('/:id/approve', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  return ok(await approveArticle(id));
});

/** POST /:id/status — admin 任意置位（不受矩阵限制），同态幂等 200。 */
adminArticlesRoute.post(
  '/:id/status',
  authMiddleware,
  guard('admin'),
  v.json(setStatusSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const { status } = c.req.valid('json') as SetStatusInput;
    return ok(await setArticleStatus(id, status));
  },
);

export { adminArticlesRoute };
