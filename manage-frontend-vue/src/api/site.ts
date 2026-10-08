/**
 * @file src/api/site.ts
 * @description 站点配置与全站统计。
 *   注意两个 settings 端点的区别，别混用：
 *     GET  /site/settings        公开，前台/页头取品牌信息用
 *     GET  /admin/site/settings  admin，含完整可编辑字段
 *     PATCH /admin/site/settings admin，写入
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { CategoryStat, SiteSetting, SiteSettingUpdate, SiteStats } from '@/types/common'

/**
 * 公开站点配置。GET /site/settings（无令牌）
 * @returns 站点品牌等公开信息。
 */
export const getPublicSiteSettings = (): Promise<SiteSetting> =>
  http.get<SiteSetting>('/site/settings', { skipAuth: true })

/**
 * 后台站点配置。GET /admin/site/settings（admin）
 * @returns 含完整可编辑字段的站点配置。
 */
export const getAdminSiteSettings = (): Promise<SiteSetting> =>
  http.get<SiteSetting>('/admin/site/settings')

/**
 * 更新站点配置。PATCH /admin/site/settings（admin）
 * @param payload - 站点配置更新字段。
 * @returns 更新后的站点配置。
 */
export const updateSiteSettings = (payload: SiteSettingUpdate): Promise<SiteSetting> =>
  http.patch<SiteSetting>('/admin/site/settings', payload)

/**
 * 全站统计。GET /stats（公开）
 * @returns 文章数 / 评论数 / 会员数 / 阅读量等聚合指标。
 */
export const getSiteStats = (): Promise<SiteStats> =>
  http.get<SiteStats>('/stats', { skipAuth: true })

/**
 * 分类文章数统计。GET /categories/stats（公开）
 * @returns 各分类的文章计数列表。
 */
export const getCategoryStats = (): Promise<CategoryStat[]> =>
  http.get<CategoryStat[]>('/categories/stats', { skipAuth: true })
