/**
 * @file src/api/comments.test.ts
 * @description 评论接口的契约守卫测试（Phase 2）。
 *
 * 为什么这个文件必须存在：`docs/manage-frontend/M2-开发计划.md` §5 把代回复与删除
 * 写成了 `POST /admin/comments` 与 `DELETE /admin/comments/{id}`，
 * 但契约里 `/api/v1/admin/comments` **只有 GET**，这两个端点根本不存在。
 * 若将来有人照计划文档"修正"代码，接口会直接 404。这里把四条真实路径钉死。
 *
 * 另一处值得守的点：`reviewing` 态只能由 `PATCH /comments/{id}/status` 进出，
 * 自动流不产出该状态——它是人工审核的专用通道。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteComment, listAdminComments, moderateComment, replyComment } from '@/api/comments'
import type { ApiResponse, Comment, CommentPage } from '@/types/common'

/** 成功信封。 */
const okBody = <T>(data: T): ApiResponse<T> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 记录每次调用的方法与地址，并统一返回成功信封。 */
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

/** 一条真实形状的评论。 */
const aComment = (): Comment =>
  ({
    id: 11,
    articleId: 22,
    userId: 33,
    userName: '张三',
    content: '写得很好',
    status: 'approved',
    createdAt: '2026-08-29T10:00:00Z',
  }) as unknown as Comment

/** 一页真实形状的评论列表。 */
const onePage = (list: Comment[] = [aComment()], total = list.length): CommentPage => ({
  list,
  pagination: { page: 1, pageSize: 20, total, totalPages: 1 },
})

describe('评论接口：端点路径严格对齐契约', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('列表走 GET /admin/comments，取 data.list', async () => {
    const calls = setupFetch(onePage())
    const page = await listAdminComments({ page: 1, pageSize: 20, status: 'reviewing' })

    expect(page.list).toHaveLength(1)
    expect(page.pagination.total).toBe(1)
    const [call] = calls
    expect(call?.method).toBe('GET')
    expect(call?.url).toContain('/admin/comments')
    expect(call?.url).toContain('status=reviewing')
  })

  it('审核置位走 PATCH /comments/{id}/status，body 带 status 与 reason', async () => {
    const calls = setupFetch(aComment())
    await moderateComment(11, { status: 'rejected', reason: '含不当言论' })

    const [call] = calls
    expect(call?.method).toBe('PATCH')
    expect(call?.url).toContain('/comments/11/status')
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      status: 'rejected',
      reason: '含不当言论',
    })
  })

  /**
   * 计划文档写的是 POST /admin/comments，契约里没有这个端点。
   * 真实路径是与前台共用的发表接口，靠 parentId 表达"回复某楼"。
   */
  it('代回复走 POST /articles/{id}/comments（不是 /admin/comments）', async () => {
    const calls = setupFetch(aComment())
    await replyComment(22, { content: '感谢反馈', parentId: 11 })

    const [call] = calls
    expect(call?.method).toBe('POST')
    expect(call?.url).toContain('/articles/22/comments')
    expect(call?.url).not.toContain('/admin/comments')
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      content: '感谢反馈',
      parentId: 11,
    })
  })

  /**
   * 计划文档写的是 DELETE /admin/comments/{id}，契约里没有这个端点。
   * 真实路径带 ownerOverride（editor 或评论本人），且级联删除子回复。
   */
  it('删除走 DELETE /comments/{id}（不是 /admin/comments/{id}）', async () => {
    const calls = setupFetch(undefined)
    await deleteComment(11)

    const [call] = calls
    expect(call?.method).toBe('DELETE')
    expect(call?.url).toContain('/comments/11')
    expect(call?.url).not.toContain('/admin/comments')
  })

  it('分页仍是 { list, pagination }，不存在平铺的 items / total', async () => {
    setupFetch(onePage([], 0))
    const page = await listAdminComments()

    expect(page.list).toEqual([])
    expect((page as unknown as { total?: number }).total).toBeUndefined()
    expect((page as unknown as { items?: unknown }).items).toBeUndefined()
  })
})
