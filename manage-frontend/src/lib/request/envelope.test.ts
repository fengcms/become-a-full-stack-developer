/**
 * @file src/lib/request/envelope.test.ts
 * @description 统一信封解析的冒烟测试（审阅 P3-5 点名关键路径）。
 *
 * 信封 `{ code, message, data, requestId, timestamp }` 是前后端唯一的线协议。
 * 它解析错的表现五花八门：白屏、静默无数据、错误文案变成 undefined，
 * 而且每一处的报错都长得跟真正的 bug 无关，排查成本极高。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrCode } from '@/lib/errorCodes'
import { request } from '@/lib/request/core'
import { isApiError } from '@/lib/request/errors'
import type { ApiResponse } from '@/types/common'

/** 构造一个返回契约信封的响应。 */
const envelope = <T>(body: ApiResponse<T>, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as Response

/** 成功信封。 */
const okBody = <T>(data: T): ApiResponse<T> => ({
  code: 0,
  message: 'ok',
  data,
  requestId: 'req-1',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 失败信封。HTTP 状态由 envelope() 单独传，两者不必绑定。 */
const errBody = (code: number): ApiResponse<never> => ({
  code: code as ApiResponse<never>['code'],
  message: 'backend raw message',
  requestId: 'req-2',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 捕获被拒绝的 Promise，便于断言错误对象本身。 */
const captureError = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (err: unknown) => err,
  )

describe('统一信封解析', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 成功路径：只把 data 交给业务，信封其余部分不泄漏。 */
  it('code 为 0 时返回解包后的 data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(okBody({ id: 42 }))))
    await expect(request<{ id: number }>('/x')).resolves.toEqual({ id: 42 })
  })

  /** 失败路径：必须抛 ApiError 而不是静默返回 undefined。 */
  it('业务码非 0 时抛 ApiError，携带契约错误码与 HTTP 状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(errBody(ErrCode.FORBIDDEN), 403)))
    await expect(request('/x')).rejects.toMatchObject({
      code: ErrCode.FORBIDDEN,
      status: 403,
    })
  })

  /** 文案走前端码表，不能直接把后端 message 甩给用户。 */
  it('错误文案取前端码表，而非原样透出后端 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(errBody(ErrCode.NOT_FOUND), 404)))
    const error = await captureError(request('/x'))
    expect(isApiError(error)).toBe(true)
    if (isApiError(error)) {
      expect(error.message).toContain('不存在')
      expect(error.message).not.toBe('backend raw message')
    }
  })

  /** 网关串味：返回 HTML 错误页而非 JSON。 */
  it('响应体不是 JSON 时归类为 5000，而不是抛出原始 SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html>502 Bad Gateway</html>',
      } as unknown as Response),
    )
    await expect(request('/x')).rejects.toMatchObject({ code: ErrCode.INTERNAL, status: 502 })
  })

  /** 信封形状缺失：说明请求没打到我们的后端（多半是代理/网关层串了）。 */
  it('缺少 code 字段时识别为信封缺失', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"data":{"id":1}}',
      } as unknown as Response),
    )
    await expect(request('/x')).rejects.toMatchObject({ code: ErrCode.INTERNAL })
  })

  /** 断网：给用户能看懂的中文，而不是浏览器原生的 "Failed to fetch"。 */
  it('fetch 抛错（断网）时转成可读错误且状态为 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(request('/x')).rejects.toMatchObject({ status: 0 })
  })

  /** query 清洗：空值不能拼进 URL，否则后端收到字符串 "undefined"。 */
  it('query 中的空值键被丢弃，不会拼出 undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(okBody(null)))
    vi.stubGlobal('fetch', fetchMock)
    await request('/x', { query: { page: 1, keyword: '', status: undefined, tag: null } })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('page=1')
    expect(url).not.toContain('keyword')
    expect(url).not.toContain('status')
    expect(url).not.toContain('tag')
  })
})
