/**
 * @file src/api/users.test.ts
 * @description 用户接口的契约守卫测试（Phase 4）。
 *
 * 为什么这个文件必须存在：`docs/manage-frontend/M2-开发计划.md` §7 把列表/详情/改角色写成
 * `GET/GET/PATCH /admin/users/{id}`，但契约里这三个端点在 **`/users` 下**（admin 鉴权，路径不含 admin）：
 *   - 列表   `GET  /users`
 *   - 详情   `GET  /users/{id}`
 *   - 改角色 `PATCH /users/{id}`
 * 只有「重置密码」在 `POST /admin/users/{id}/reset-password`——路径带 admin。
 * 若将来有人照计划文档"修正"代码，列表/改角色接口会直接 404。这里把真实路径钉死。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminResetPassword, listUsers, updateUser } from '@/api/users'
import type { ApiResponse, User, UserPage } from '@/types/common'

/** 成功信封。 */
const okBody = <T>(data: T): ApiResponse<T> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 记录每次调用的方法与地址。 */
const setupFetch = (data: unknown) => {
  const calls: { method: string; url: string; body?: string }[] = []
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(url),
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(okBody(data)),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

/** 一页真实形状的用户列表。 */
const onePage = (list: User[] = [], total = list.length): UserPage => ({
  list,
  pagination: { page: 1, pageSize: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
})

describe('用户接口：端点路径严格对齐契约', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('列表走 GET /users（不是 /admin/users），且带筛选 query', async () => {
    const calls = setupFetch(onePage())
    await listUsers({ page: 1, pageSize: 10, role: 'editor', status: 'active', keyword: 'leo' })

    const [call] = calls
    expect(call?.method).toBe('GET')
    expect(call?.url).toContain('/users')
    expect(call?.url).not.toContain('/admin/users')
    expect(call?.url).toContain('role=editor')
    expect(call?.url).toContain('status=active')
    expect(call?.url).toContain('keyword=leo')
  })

  it('改角色/状态/等级走 PATCH /users/{id}（不是 /admin/users/{id}）', async () => {
    const calls = setupFetch({} as User)
    await updateUser(7, { role: 'editor', status: 'disabled', level: 3 })

    const [call] = calls
    expect(call?.method).toBe('PATCH')
    expect(call?.url).toContain('/users/7')
    expect(call?.url).not.toContain('/admin/users')
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      role: 'editor',
      status: 'disabled',
      level: 3,
    })
  })

  it('重置密码走 POST /admin/users/{id}/reset-password，body 带 newPassword', async () => {
    const calls = setupFetch(undefined)
    await adminResetPassword(7, 'newPass123')

    const [call] = calls
    expect(call?.method).toBe('POST')
    expect(call?.url).toContain('/admin/users/7/reset-password')
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({ newPassword: 'newPass123' })
  })

  it('分页仍是 { list, pagination }，不存在平铺的 items / total', async () => {
    setupFetch(onePage([], 0))
    const page = await listUsers()

    expect(page.list).toEqual([])
    expect((page as unknown as { total?: number }).total).toBeUndefined()
    expect((page as unknown as { items?: unknown }).items).toBeUndefined()
  })
})
