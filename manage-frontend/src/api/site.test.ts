/**
 * @file src/api/site.test.ts
 * @description 站点统计端点契约守卫。钉死 getSiteStats→/stats、getCategoryStats→/categories/stats
 *   的路径与信封 data 形状（SiteStats / CategoryStat[]），防止后人误改路径或取数键。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminSiteSettings,
  getCategoryStats,
  getSiteStats,
  updateSiteSettings,
} from '@/api/site'
import type {
  ApiResponse,
  CategoryStat,
  SiteSetting,
  SiteSettingUpdate,
  SiteStats,
} from '@/types/common'

/** 构造返回契约信封的 fetch mock。 */
const respondWith = (body: ApiResponse<unknown>) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 成功信封。 */
const envelope = <T>(data: T): ApiResponse<T> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

describe('site stats endpoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** getSiteStats 打 /stats（不含 categories 前缀，避免与 /categories/stats 串味）。 */
  it('getSiteStats 请求 /stats 且返回 SiteStats 形状', async () => {
    const stats: SiteStats = { articleCount: 10, commentCount: 5, memberCount: 3, viewTotal: 100 }
    const mock = respondWith(envelope(stats))
    const data = await getSiteStats()
    const url = String(mock.mock.calls[0]?.[0])
    expect(url).toContain('/stats')
    expect(url).not.toContain('categories')
    expect(data).toMatchObject({
      articleCount: 10,
      commentCount: 5,
      memberCount: 3,
      viewTotal: 100,
    })
  })

  /** getCategoryStats 打 /categories/stats，返回 CategoryStat[]。 */
  it('getCategoryStats 请求 /categories/stats 且返回 CategoryStat[]', async () => {
    const list: CategoryStat[] = [
      { id: 1, name: '前端', slug: 'fe', articleCount: 8 },
      { id: 2, name: '后端', slug: 'be', articleCount: 2 },
    ]
    const mock = respondWith(envelope(list))
    const data = await getCategoryStats()
    const url = String(mock.mock.calls[0]?.[0])
    expect(url).toContain('/categories/stats')
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ id: 1, name: '前端', slug: 'fe', articleCount: 8 })
  })
})

describe('site admin settings endpoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** getAdminSiteSettings 打后台 settings 路径（非公开 /site/settings）。 */
  it('getAdminSiteSettings 请求 /admin/site/settings', async () => {
    const setting = { id: 1, siteName: '我的博客' } as unknown as SiteSetting
    const mock = respondWith(envelope(setting))
    const data = await getAdminSiteSettings()
    const url = String(mock.mock.calls[0]?.[0])
    // 后台端点必须带 /admin/ 段；注意 /admin/site/settings 自身即含 /site/settings 子串，
    // 故不能用 not.toContain('/site/settings') 区分，靠 /admin/ 段即可（公开版无此前缀）。
    expect(url).toContain('/admin/site/settings')
    expect(data.siteName).toBe('我的博客')
  })

  /** updateSiteSettings 走 PATCH 同路径，回传更新后配置。 */
  it('updateSiteSettings 以 PATCH 请求 /admin/site/settings', async () => {
    const payload: SiteSettingUpdate = { siteName: '新名' }
    const updated = { id: 1, siteName: '新名' } as unknown as SiteSetting
    const mock = respondWith(envelope(updated))
    const data = await updateSiteSettings(payload)
    const url = String(mock.mock.calls[0]?.[0])
    const init = mock.mock.calls[0]?.[1] as { method?: string } | undefined
    expect(url).toContain('/admin/site/settings')
    expect(init?.method).toBe('PATCH')
    expect(data.siteName).toBe('新名')
  })
})
