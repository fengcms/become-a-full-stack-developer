/**
 * src/routes/articles-read.ts
 * 文章公开/登录读路由（B2 核心 /articles 子树读侧）：列表 / 详情 / 阅读量。
 * 薄路由：解析鉴权身份 → 调 services/article → ok/paginate 格式化。写侧见 articles-write.ts。
 *
 * 关键纪律（对齐契约与 02 §2.2/§2.3/§3.3）：公开列表/详情仅返 published；未发布详情对匿名 404（隐瞒存在性）。
 */
import { Hono } from 'hono';
import { type AuthVars, optionalAuthMiddleware } from '@/middleware/auth';
import { getArticleByKey, incrementViewCount, queryArticles } from '@/services/article';
import { ok, paginate } from '@/shared/response';

const articlesReadRoute = new Hono<AuthVars>();

/** GET / — 公开列表，强制仅 published（?status= 被忽略）。 */
articlesReadRoute.get('/', async (c) => {
  const result = await queryArticles({
    c,
    forcedStatus: 'published',
    keyword: c.req.query('keyword') ?? undefined,
    tag: c.req.query('tag') ?? undefined,
    category: c.req.query('category') ?? undefined,
  });
  return paginate(result.list, result.pagination);
});

/** GET /:idOrSlug — 详情；id 或 slug 解析；匿名仅 published；owner/admin 可见任意态。 */
articlesReadRoute.get('/:idOrSlug', optionalAuthMiddleware, async (c) => {
  const me = c.get('user');
  return ok(
    await getArticleByKey(
      c.req.param('idOrSlug'),
      me ? { id: String(me.id), role: me.role } : null,
    ),
  );
});

/** POST /:id/view — 阅读量 +1（带去重）；仅 published 可计数，否则 404。 */
articlesReadRoute.post('/:id/view', optionalAuthMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? '';
  const ua = c.req.header('user-agent') ?? '';
  return ok(await incrementViewCount(id, me ? Number(me.id) : null, ip, ua));
});

export { articlesReadRoute };
