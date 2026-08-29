/**
 * @file src/api/notify.test.ts
 * @description 通知端点契约守卫：钉死 /me/notifications 系列真实路径 + 信封/data 形状。
 *   - GET    /me/notifications             → NotificationPage（list + pagination）
 *   - GET    /me/notifications/unread-count → { count }
 *   - POST   /me/notifications/read-all
 *   - PATCH  /me/notifications/{id}        → body { isRead: true }
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getUnreadCount,
  listMyNotifications,
  markNotificationRead,
  readAllNotifications,
} from '@/api/notify'
import type { NotificationPage } from '@/types/common'

/** 通用 fetch mock 装置。 */
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

describe('notify API 端点契约守卫', () => {
  it('listMyNotifications → GET /me/notifications 分页', async () => {
    const page: NotificationPage = {
      list: [
        { id: 1, type: 'system', title: 't', isRead: false, createdAt: '2026-01-01T00:00:00Z' },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }
    const mock = mockFetch({ code: 0, message: 'ok', data: page, requestId: 'r', timestamp: '' })
    const data = await listMyNotifications()
    expect(String(mock.mock.calls[0]?.[0])).toContain('/me/notifications')
    expect(data.list[0]?.id).toBe(1)
  })

  it('getUnreadCount → GET /me/notifications/unread-count（路径带 unread-count 段）', async () => {
    const mock = mockFetch({
      code: 0,
      message: 'ok',
      data: { count: 3 },
      requestId: 'r',
      timestamp: '',
    })
    const data = await getUnreadCount()
    const url = String(mock.mock.calls[0]?.[0])
    expect(url).toContain('/me/notifications/unread-count')
    expect(data.count).toBe(3)
  })

  it('readAllNotifications → POST /me/notifications/read-all', async () => {
    const mock = mockFetch({ code: 0, message: 'ok', data: null, requestId: 'r', timestamp: '' })
    await readAllNotifications()
    const url = String(mock.mock.calls[0]?.[0])
    const method = (mock.mock.calls[0]?.[1] as RequestInit | undefined)?.method
    expect(url).toContain('/me/notifications/read-all')
    expect(method).toBe('POST')
  })

  it('markNotificationRead → PATCH /me/notifications/{id} 带 isRead:true', async () => {
    const note = {
      id: 7,
      type: 'system',
      title: 't',
      isRead: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const mock = mockFetch({ code: 0, message: 'ok', data: note, requestId: 'r', timestamp: '' })
    await markNotificationRead(7)
    const url = String(mock.mock.calls[0]?.[0])
    const method = (mock.mock.calls[0]?.[1] as RequestInit | undefined)?.method
    const body = JSON.parse((mock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as string)
    expect(url).toContain('/me/notifications/7')
    expect(method).toBe('PATCH')
    expect(body).toEqual({ isRead: true })
  })
})
