/**
 * @file src/api/articles.test.ts
 * @description 分页字段消费的冒烟测试（审阅 P3-5 + 后端《M2-分页字段名纠正报告》）。
 *
 * 为什么值得单独钉住：本契约分页是 `{ list, pagination }`，
 * 而参考项目 telemarketing-saas-manage 用的是 `{ items, total }`。
 * 两者极易串味——一旦有人按参考项目的习惯写成 `data.items`，
 * 页面表现是**静默空白**（不是报错），联调时极难定位。这里把真实响应形状写死。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { listAdminArticles } from '@/api/articles'
import type { ApiResponse, ArticlePage, ArticleSummary } from '@/types/common'

/** 构造一个返回契约信封的响应。 */
const respondWith = (body: ApiResponse<ArticlePage>) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 成功信封。 */
const okBody = (data: ArticlePage): ApiResponse<ArticlePage> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 一页真实形状的文章数据。 */
const sample = (): ArticleSummary => ({ id: 1, title: '第一篇' }) as unknown as ArticleSummary

/** 一页真实形状的分页结果。 */
const onePage = (list: ArticleSummary[] = [sample()], total = list.length): ArticlePage => ({
  list,
  pagination: { page: 1, pageSize: 20, total, totalPages: 1 },
})

describe('分页消费：{ list, pagination } 而非 { items, total }', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 数组与元信息的取值路径。 */
  it('数组取自 data.list，元信息取自 data.pagination', async () => {
    respondWith(okBody(onePage()))
    const page = await listAdminArticles({ page: 1, pageSize: 20 })

    expect(page.list).toHaveLength(1)
    expect(page.list[0]?.title).toBe('第一篇')
    expect(page.pagination.total).toBe(1)
    expect(page.pagination.totalPages).toBe(1)
  })

  /**
   * 参考项目习惯的 `data.total` 在本契约下不存在。
   * 若有人照抄，total 为 undefined，分页组件会算出 NaN 页码 —— 这里提前拦住。
   */
  it('不存在平铺的 total 字段，元信息是 pagination 对象', async () => {
    respondWith(okBody(onePage()))
    const page = await listAdminArticles()

    expect(page.pagination).toBeTypeOf('object')
    expect((page as unknown as { total?: number }).total).toBeUndefined()
    expect((page as unknown as { items?: unknown }).items).toBeUndefined()
  })

  /** 空结果必须是空数组，否则列表组件 map(undefined) 会直接崩。 */
  it('空列表时 list 为空数组而非 undefined', async () => {
    respondWith(okBody(onePage([], 0)))
    const page = await listAdminArticles()

    expect(page.list).toEqual([])
    expect(page.pagination.total).toBe(0)
  })

  /** 分页与筛选参数正确进入 query，空值被丢弃。 */
  it('分页与筛选参数进入 query，空值被丢弃', async () => {
    const fetchMock = respondWith(okBody(onePage()))
    await listAdminArticles({ page: 2, pageSize: 10, status: 'pending', keyword: '' })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/admin/articles')
    expect(url).toContain('page=2')
    expect(url).toContain('pageSize=10')
    expect(url).toContain('status=pending')
    expect(url).not.toContain('keyword')
  })
})
