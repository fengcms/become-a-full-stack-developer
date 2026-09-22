/**
 * @file lib/api/search.ts
 * @description 全文搜索端点（标题/正文/会员昵称）。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 搜索结果。 */
export type SearchResult = components['schemas']['SearchResult']
/** 搜索类型。 */
export type SearchType = 'article' | 'member'

/** 搜索查询参数。 */
export interface SearchQuery {
  q: string
  type?: SearchType
  page?: number
  pageSize?: number
}

/**
 * 全文搜索（跨文章标题/正文与会员昵称）。
 *
 * @param q - 搜索关键词。
 * @param type - 搜索类型：article 或 member，不传同时搜索。
 * @param page - 页码。
 * @param pageSize - 每页条数。
 */
export const search = ({ q, type, page = 1, pageSize = 10 }: SearchQuery): Promise<SearchResult> =>
  serverFetch<SearchResult>('/search', {
    query: { q, type, page, pageSize },
    cache: 'no-store',
  })
