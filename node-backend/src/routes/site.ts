/**
 * src/routes/site.ts
 * 站点配置（B7 辅助/站点）：GET /site/settings（公开）、GET+PATCH /admin/site/settings（admin）。
 * 单条记录（id=1），由 admin 经 PATCH 维护；Logo 须先经上传端点获得 URL 再传入 logoUrl。
 * 挂载于 /api/v1（路径 /site/settings 与 /admin/site/settings）。
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type SiteSettingRow, siteSettings } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const siteRoute = new Hono<AuthVars>();

/** DB 行 → 契约 SiteSetting（snake_case → camelCase，可空字段补 null）。 */
const toSiteSetting = (s: SiteSettingRow) => ({
  id: s.id,
  siteName: s.siteName,
  siteTitle: s.siteTitle ?? null,
  siteDescription: s.siteDescription,
  siteKeywords: s.siteKeywords ?? null,
  logoUrl: s.logoUrl ?? null,
  copyright: s.copyright ?? null,
  updatedAt: s.updatedAt.toISOString(),
});

/** 读取单条配置（id=1 恒为唯一记录）；缺失 → 500（理论上由迁移种子保证存在）。 */
const readSiteSetting = async (): Promise<SiteSettingRow> => {
  const row = (
    await getDb().select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1).all()
  )[0];
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return row;
};

/** GET /site/settings — 公开读取（页头/页脚/SEO）。 */
siteRoute.get('/site/settings', async () => ok(toSiteSetting(await readSiteSetting())));

/** GET /admin/site/settings — admin 读取（后台设置页回填）。 */
siteRoute.get('/admin/site/settings', authMiddleware, guard('admin'), async () =>
  ok(toSiteSetting(await readSiteSetting())),
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
    const set: Partial<SiteSettingRow> = { updatedAt: new Date() };
    if (patch.siteName !== undefined) set.siteName = patch.siteName;
    if (patch.siteTitle !== undefined) set.siteTitle = patch.siteTitle;
    if (patch.siteDescription !== undefined) set.siteDescription = patch.siteDescription;
    if (patch.siteKeywords !== undefined) set.siteKeywords = patch.siteKeywords;
    if (patch.logoUrl !== undefined) set.logoUrl = patch.logoUrl;
    if (patch.copyright !== undefined) set.copyright = patch.copyright;
    await getDb().update(siteSettings).set(set).where(eq(siteSettings.id, 1)).run();
    return ok(toSiteSetting(await readSiteSetting()));
  },
);

export { siteRoute };
