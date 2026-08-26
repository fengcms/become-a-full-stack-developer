/**
 * src/routes/site.ts
 * 站点配置（B7 辅助/站点）：GET /site/settings（公开）、GET+PATCH /admin/site/settings（admin）。
 * 单条记录（id=1），由 admin 经 PATCH 维护；Logo 须先经上传端点获得 URL 再传入 logoUrl。
 * 挂载于 /api/v1（路径 /site/settings 与 /admin/site/settings）。
 * 薄路由：校验入参 → 调 service → ok 格式化。无 DB 查询。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { getSiteSetting, toSiteSetting, updateSiteSetting } from '@/services/site';
import { ok } from '@/shared/response';

const siteRoute = new Hono<AuthVars>();

/** GET /site/settings — 公开读取（页头/页脚/SEO）。 */
siteRoute.get('/site/settings', async () => ok(toSiteSetting(await getSiteSetting())));

/** GET /admin/site/settings — admin 读取（后台设置页回填）。 */
siteRoute.get('/admin/site/settings', authMiddleware, guard('admin'), async () =>
  ok(toSiteSetting(await getSiteSetting())),
);

const updateSchema = z.object({
  siteName: z.string().max(100).optional(),
  siteTitle: z.string().max(200).nullable().optional(),
  siteDescription: z.string().max(500).optional(),
  siteKeywords: z.string().max(200).nullable().optional(),
  logoUrl: z.string().max(512).nullable().optional(),
  copyright: z.string().max(200).nullable().optional(),
});
type UpdateInput = z.infer<typeof updateSchema>;

/** PATCH /admin/site/settings — admin 更新（字段可选，仅传变更项；显式 null 表示清空）。 */
siteRoute.patch(
  '/admin/site/settings',
  authMiddleware,
  guard('admin'),
  v.json(updateSchema),
  async (c) => {
    const patch = c.req.valid('json') as UpdateInput;
    return ok(toSiteSetting(await updateSiteSetting(patch)));
  },
);

export { siteRoute };
