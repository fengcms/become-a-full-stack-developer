/**
 * @file src/api/me.test.ts
 * @description 个人中心端点契约守卫：钉死真实路径 + 信封/data 形状，防后人照计划「修正」成错误路径。
 *   - GET /me/profile、PATCH /me/profile、POST /me/change-password 路径正确
 *   - ⚠️ GET /me/likes 返回 **裸数组**（非分页 {list,pagination}）——契约 §R5 内部矛盾，已反向断言防回归
 *   - GET /me/favorites 返回分页 ArticlePage
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  changePassword,
  getMyProfile,
  listMyFavorites,
  listMyLikes,
  updateMyProfile,
} from '@/api/me'
import type { ArticlePage, ArticleSummary } from '@/types/common'

/** 通用 fetch mock 装置（复用 articles.test.ts 范式）。 */
const mockFetch = (body: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('me API 端点契约守卫', () => {
  it('getMyProfile → GET /me/profile', async () => {
    const mock = mockFetch({
      code: 0,
      message: 'ok',
      data: { id: 1, username: 'u', role: 'member' },
      requestId: 'r',
      timestamp: '',
    })
    const data = await getMyProfile()
    expect(String(mock.mock.calls[0]?.[0])).toContain('/me/profile')
    expect(data.username).toBe('u')
  })

  it('updateMyProfile → PATCH /me/profile（局部更新）', async () => {
    const mock = mockFetch({
      code: 0,
      message: 'ok',
      data: { id: 1, username: 'u', role: 'member' },
      requestId: 'r',
      timestamp: '',
    })
    await updateMyProfile({ nickname: '新昵称' })
    const url = String(mock.mock.calls[0]?.[0])
    const method = (mock.mock.calls[0]?.[1] as RequestInit | undefined)?.method
    expect(url).toContain('/me/profile')
    expect(method).toBe('PATCH')
  })

  it('changePassword → POST /me/change-password', async () => {
    const mock = mockFetch({ code: 0, message: 'ok', data: null, requestId: 'r', timestamp: '' })
    await changePassword({ oldPassword: 'oldoldold', newPassword: 'newnewnew' })
    const url = String(mock.mock.calls[0]?.[0])
    const method = (mock.mock.calls[0]?.[1] as RequestInit | undefined)?.method
    expect(url).toContain('/me/change-password')
    expect(method).toBe('POST')
  })

  it('listMyLikes → GET /me/likes 返回裸数组（非分页对象，§R5）', async () => {
    const list: ArticleSummary[] = [
      { id: 1, title: 'A', authorId: 1, status: 'published', createdAt: '2026-01-01T00:00:00Z' },
    ]
    const mock = mockFetch({ code: 0, message: 'ok', data: list, requestId: 'r', timestamp: '' })
    const data = await listMyLikes()
    // 路径正确
    expect(String(mock.mock.calls[0]?.[0])).toContain('/me/likes')
    // 裸数组，绝不是 { list, pagination }
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown as { list?: unknown }).list).toBeUndefined()
    expect((data as unknown as { pagination?: unknown }).pagination).toBeUndefined()
    expect(data[0]?.title).toBe('A')
  })

  it('listMyFavorites → GET /me/favorites 返回分页 ArticlePage', async () => {
    const page: ArticlePage = {
      list: [
        { id: 2, title: 'B', authorId: 1, status: 'published', createdAt: '2026-01-01T00:00:00Z' },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }
    const mock = mockFetch({ code: 0, message: 'ok', data: page, requestId: 'r', timestamp: '' })
    const data = await listMyFavorites()
    expect(String(mock.mock.calls[0]?.[0])).toContain('/me/favorites')
    expect(Array.isArray(data.list)).toBe(true)
    expect(data.pagination.total).toBe(1)
  })
})
