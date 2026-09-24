/** @file Cached public data access and independent optional-module failure boundaries. */
import { cache } from 'react'
import { getCategoryTree } from '@/lib/api/categories'
import { getSiteSettings } from '@/lib/api/site'
import { listTags } from '@/lib/api/tags'
export const categories = cache(getCategoryTree)
export const settings = cache(getSiteSettings)
export const tags = cache(listTags)
export const fallbackSite = {
  siteName: '成为全栈开发工程师',
  siteTitle: '',
  siteKeywords: '',
  siteDescription: '用一个真实系统，串起全栈开发的每一步。',
}
/** Optional chrome can fall back; core content errors must reach the page boundary. */
export const siteChrome = cache(async () => ({
  site: await settings().catch(() => fallbackSite),
  categories: await categories().catch(() => []),
}))
