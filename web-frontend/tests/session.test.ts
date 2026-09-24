/** Concurrent authentication requests must never resurrect or overwrite a session. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logout } from '@/lib/api/auth'
import { bootstrapSession, request } from '@/lib/request/core'
import { useAuthStore } from '@/store/auth'

const user = { id: 1, username: 'reader', nickname: 'Reader', role: 'member' as const }
const envelope = (data: unknown, status = 200, code = 0) =>
  Response.json({ code, data }, { status })
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 10))

test('parallel expired requests share one refresh and replay once', async () => {
  const original = globalThis.fetch
  let refreshes = 0
  useAuthStore.getState().clear()
  useAuthStore.getState().setSession({ accessToken: 'old', user })
  globalThis.fetch = async (_url, options) => {
    if (String(_url).endsWith('/auth/refresh')) {
      refreshes++
      await wait()
      return envelope({ accessToken: 'fresh', user })
    }
    return new Headers(options?.headers).get('authorization') === 'Bearer fresh'
      ? envelope('private-data')
      : envelope(null, 401, 1002)
  }
  try {
    assert.deepEqual(
      await Promise.all([request('/me/profile'), request('/me/favorites'), request('/me/history')]),
      ['private-data', 'private-data', 'private-data'],
    )
    assert.equal(refreshes, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('StrictMode bootstrap callers wait on the same promise', async () => {
  const original = globalThis.fetch
  let refreshes = 0
  useAuthStore.getState().clear()
  useAuthStore.getState().setBootStatus('idle')
  globalThis.fetch = async () => {
    refreshes++
    await wait()
    return envelope({ accessToken: 'boot', user })
  }
  try {
    assert.deepEqual(await Promise.all([bootstrapSession(), bootstrapSession()]), [true, true])
    assert.equal(refreshes, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('logout during refresh cannot restore the old account', async () => {
  const original = globalThis.fetch
  useAuthStore.getState().clear()
  useAuthStore.getState().setSession({ accessToken: 'old', user })
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/refresh')) {
      useAuthStore.getState().clear()
      return envelope({ accessToken: 'too-late', user })
    }
    return envelope(null, 401, 1002)
  }
  try {
    await assert.rejects(request('/me/profile'))
    assert.equal(useAuthStore.getState().accessToken, null)
  } finally {
    globalThis.fetch = original
  }
})

test('late response from an old account is discarded after an account switch', async () => {
  const original = globalThis.fetch
  useAuthStore.getState().clear()
  useAuthStore.getState().setSession({ accessToken: 'old', user })
  globalThis.fetch = async () => {
    useAuthStore.getState().clear()
    useAuthStore.getState().setSession({ accessToken: 'new-account', user: { ...user, id: 2 } })
    return envelope('old-private-data')
  }
  try {
    await assert.rejects(request('/me/profile'), /会话已切换/)
    assert.equal(useAuthStore.getState().user?.id, 2)
  } finally {
    globalThis.fetch = original
  }
})

test('logout adapter sends the access token required by the backend', async () => {
  const original = globalThis.fetch
  useAuthStore.getState().clear()
  useAuthStore.getState().setSession({ accessToken: 'logout-token', user })
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/auth/logout'))
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer logout-token')
    return envelope({ success: true })
  }
  try {
    await logout()
  } finally {
    globalThis.fetch = original
  }
})
