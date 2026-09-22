/**
 * @file lib/api/site.ts
 * @description 站点配置端点。对齐契约 v1.11.0。
 *   公开端点，用于页头/页脚/SEO meta。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 站点基础配置。 */
export type SiteSetting = components['schemas']['SiteSetting']

/**
 * 获取站点基础配置（公开）。
 * 单条记录，始终返回最新已发布配置。
 */
export const getSiteSettings = (): Promise<SiteSetting> =>
  serverFetch<SiteSetting>('/site/settings', {
    cache: 'force-cache',
    next: { tags: ['site-settings'] },
  })
