import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pinia } from '@/app/pinia'
import { http, request } from '@/lib/request'
import { useAuthStore } from '@/stores/auth'
import type { AuthResult } from '@/types/common'

const envelope = (code: number, data: unknown, message = 'ok') =>
  JSON.stringify({
    code,
    data,
    message,
    requestId: 'test-request',
    timestamp: new Date().toISOString(),
  })

const authResult = {
  accessToken: 'fresh-access',
  refreshToken: 'fresh-refresh',
  expiresIn: 900,
  user: {
    id: 1,
    username: 'admin',
    nickname: '管理员',
    role: 'admin',
    status: 'active',
    level: 1,
  },
} as AuthResult

describe('request client', () => {
  const auth = useAuthStore(pinia)

  beforeEach(() => {
    auth.clear()
    auth.setSession({ ...authResult, accessToken: 'expired-access', refreshToken: 'old-refresh' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    auth.clear()
  })

  it('unwraps successful API envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(envelope(0, { value: 42 }), { status: 200 })),
    )

    await expect(request<{ value: number }>('/example')).resolves.toEqual({ value: 42 })
  })

  it('shares one token refresh across concurrent expired requests and retries them', async () => {
    let refreshCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1
        await Promise.resolve()
        return new Response(envelope(0, authResult), { status: 200 })
      }
      const authorization = new Headers(init?.headers).get('Authorization')
      if (authorization === 'Bearer expired-access') {
        return new Response(envelope(1002, null, 'expired'), { status: 401 })
      }
      return new Response(envelope(0, { authorization }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      request<{ authorization: string }>('/protected/a'),
      request<{ authorization: string }>('/protected/b'),
    ])

    expect(refreshCount).toBe(1)
    expect(results).toEqual([
      { authorization: 'Bearer fresh-access' },
      { authorization: 'Bearer fresh-access' },
    ])
    expect(auth.accessToken).toBe('fresh-access')
  })

  it('leaves multipart content type to the browser', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(envelope(0, { id: 9 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const body = new FormData()
    body.set('file', new Blob(['file contents']), 'sample.txt')

    await http.post('/attachments', body)

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
    expect(init.body).toBe(body)
  })
})
