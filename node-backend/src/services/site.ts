/**
 * src/services/site.ts
 * 站点配置领域：读取单条（id=1 恒唯一）/ 更新。序列化在 service 内（脱敏 DTO）。
 * 单条记录由 admin 经 PATCH 维护；Logo 须先经上传端点获得 URL 再传入 logoUrl。
 * 不在此处拼 HTTP 响应（路由层用 ok 格式化）。
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { type SiteSettingRow, siteSettings } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 契约 SiteSetting（snake_case → camelCase，可空字段补 null）。 */
export interface SiteSetting {
  id: number;
  siteName: string;
  siteTitle: string | null;
  siteDescription: string;
  siteKeywords: string | null;
  logoUrl: string | null;
  copyright: string | null;
  updatedAt: string;
}

/** DB 行 → 契约 SiteSetting。 */
export const toSiteSetting = (s: SiteSettingRow): SiteSetting => ({
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
export const getSiteSetting = async (): Promise<SiteSettingRow> => {
  const row = (
    await getDb().select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1).all()
  )[0];
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return row;
};

/** PATCH 字段（仅传变更项，显式 null 表示清空）。 */
export interface SiteSettingPatch {
  siteName?: string;
  siteTitle?: string | null;
  siteDescription?: string;
  siteKeywords?: string | null;
  logoUrl?: string | null;
  copyright?: string | null;
}

/** PATCH /admin/site/settings — admin 更新（字段可选）；返回更新后的配置行。 */
export const updateSiteSetting = async (patch: SiteSettingPatch): Promise<SiteSettingRow> => {
  const set: Partial<SiteSettingRow> = { updatedAt: new Date() };
  if (patch.siteName !== undefined) set.siteName = patch.siteName;
  if (patch.siteTitle !== undefined) set.siteTitle = patch.siteTitle;
  if (patch.siteDescription !== undefined) set.siteDescription = patch.siteDescription;
  if (patch.siteKeywords !== undefined) set.siteKeywords = patch.siteKeywords;
  if (patch.logoUrl !== undefined) set.logoUrl = patch.logoUrl;
  if (patch.copyright !== undefined) set.copyright = patch.copyright;
  await getDb().update(siteSettings).set(set).where(eq(siteSettings.id, 1)).run();
  return getSiteSetting();
};
