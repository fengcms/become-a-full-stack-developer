/**
 * @file src/api/tags.test.ts
 * @description 标签接口的契约守卫测试（Phase 3）。
 *
 * 两点值得守：
 *   1. 四个端点的路径与方法。
 *   2. `GET /tags` 返回的是**裸数组**而非分页对象——标签量通常不大，
 *      契约刻意不做分页。若哪天有人"顺手"给列表组件接上 `data.list`，页面会直接空白。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTag, deleteTag, listTags, updateTag } from '@/api/tags'
import type { ApiResponse, Tag } from '@/types/common'

/** 成功信封。 */
const okBody = <T>(data: T): ApiResponse<T> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 记录调用并统一返回成功信封。 */
const setupFetch = (data: unknown) => {
  const calls: { method: string; url: string; body?: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
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
    }),
  )
  return calls
}

/** 一个真实形状的标签。 */
const aTag = (): Tag => ({ id: 7, name: 'React', slug: 'react', articleCount: 3 }) as unknown as Tag

describe('标签接口：端点路径与返回形状', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 契约刻意不分页，这里把"是数组"这件事钉死。 */
  it('GET /tags 返回裸数组（非分页对象）', async () => {
    setupFetch([aTag()])
    const tags = await listTags()

    expect(Array.isArray(tags)).toBe(true)
    expect(tags).toHaveLength(1)
    expect(tags[0]?.articleCount).toBe(3)
  })

  it('POST /tags 带 name 与 slug', async () => {
    const calls = setupFetch(aTag())
    await createTag({ name: 'React', slug: 'react' })

    const [call] = calls
    expect(call?.method).toBe('POST')
    expect(call?.url).toContain('/tags')
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({ name: 'React', slug: 'react' })
  })

  it('PUT /tags/{id} 支持改名（有文章引用时也能改）', async () => {
    const calls = setupFetch(aTag())
    await updateTag(7, { name: 'React 框架', slug: 'react' })

    const [call] = calls
    expect(call?.method).toBe('PUT')
    expect(call?.url).toContain('/tags/7')
  })

  it('DELETE /tags/{id}', async () => {
    const calls = setupFetch(undefined)
    await deleteTag(7)

    const [call] = calls
    expect(call?.method).toBe('DELETE')
    expect(call?.url).toContain('/tags/7')
  })
})
