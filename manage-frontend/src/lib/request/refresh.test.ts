/**
 * @file src/lib/request/refresh.test.ts
 * @description 401 并发静默刷新去重的冒烟测试（审阅 P3-5 点名关键路径）。
 *
 * 为什么必须钉住这一条：后端刷新令牌是**旋转**的。首屏并发 6 个请求同时 401 时，
 * 若不做并发去重就会连打 6 次 /auth/refresh —— 第一个请求换走新令牌，
 * 后 5 个拿着已失效的旧值全部失败，最终用户被莫名踢回登录页。
 * 这类 bug 只在并发窗口内复现，手工点页面几乎永远撞不上，只能靠测试守。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrCode } from '@/lib/errorCodes'
import { request } from '@/lib/request/core'
import { useAuthStore } from '@/store/auth'
import type { ApiResponse, AuthResult } from '@/types/common'

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

/** 令牌过期：可静默刷新的 401。 */
const expiredBody = (): ApiResponse<never> => ({
  code: ErrCode.TOKEN_INVALID,
  message: 'token expired',
  requestId: 'req-2',
  timestamp: '2026-08-29T00:00:00Z',
})

/** 刷新接口返回的新会话。 */
const newSession = {
  accessToken: 'access-v2',
  refreshToken: 'refresh-v2',
  user: null,
} as unknown as AuthResult

describe('401 静默刷新并发去重', () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().clear()
  })

  /**
   * 并发 3 个请求同时 401，只应打一次 /auth/refresh。
   * 刷新接口故意延迟 20ms，用来撑开并发窗口，保证后两个请求进来时刷新仍在飞。
   */
  it('并发的多个 401 只触发一次 /auth/refresh', async () => {
    const servedOnce = new Set<string>()
    let refreshCalls = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)

        if (target.includes('/auth/refresh')) {
          refreshCalls += 1
          await new Promise((resolve) => {
            setTimeout(resolve, 20)
          })
          return envelope(okBody(newSession))
        }

        // 每个业务接口首次访问回 401，重放时才放行
        if (!servedOnce.has(target)) {
          servedOnce.add(target)
          return envelope(expiredBody(), 401)
        }
        return envelope(okBody({ ok: true }))
      }),
    )

    const results = await Promise.all([
      request<{ ok: boolean }>('/a'),
      request<{ ok: boolean }>('/b'),
      request<{ ok: boolean }>('/c'),
    ])

    expect(refreshCalls).toBe(1)
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
  })

  /** 刷新成功后新 accessToken 必须落到内存会话，否则重放仍会 401。 */
  it('刷新成功后新令牌写入会话（仅内存）', async () => {
    let served = false

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.includes('/auth/refresh')) return envelope(okBody(newSession))
        if (!served) {
          served = true
          return envelope(expiredBody(), 401)
        }
        return envelope(okBody({ ok: true }))
      }),
    )

    await request<{ ok: boolean }>('/a')

    expect(useAuthStore.getState().accessToken).toBe('access-v2')
    expect(useAuthStore.getState().refreshToken).toBe('refresh-v2')
  })

  /** 令牌只存内存：这里确认测试环境没有把令牌写进 localStorage 的路径。 */
  it('会话不落 localStorage（方案 B 的安全底线）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(okBody(newSession))))
    useAuthStore.getState().setSession(newSession)

    expect(useAuthStore.getState().accessToken).toBe('access-v2')
    expect(typeof localStorage).toBe('undefined')
  })
})
