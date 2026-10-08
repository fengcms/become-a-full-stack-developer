import { pinia } from '@/app/pinia'
import { ErrCode, isRefreshable, resolveErrorMessage, shouldForceLogout } from '@/lib/errorCodes'
import { API_BASE, ApiError } from '@/lib/request/errors'
import { forceLogout } from '@/lib/request/session'
import { useAuthStore } from '@/stores/auth'
import type { ApiResponse, AuthResult } from '@/types/common'

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  skipAuth?: boolean
  skipAuthRedirect?: boolean
  skipRefresh?: boolean
}

interface InternalFlags {
  isRefreshCall?: boolean
  retried?: boolean
}
let refreshInFlight: Promise<string> | null = null

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const base = /^https?:\/\//.test(path)
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `${base}${base.includes('?') ? '&' : '?'}${serialized}` : base
}

const rawRequest = async <T>(
  path: string,
  options: RequestOptions = {},
  flags: InternalFlags = {},
): Promise<T> => {
  const { body, query, skipAuth, skipAuthRedirect, skipRefresh, headers, ...init } = options
  const auth = useAuthStore(pinia)
  const formData = typeof FormData !== 'undefined' && body instanceof FormData
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  if (body !== undefined && !formData && !requestHeaders.has('Content-Type'))
    requestHeaders.set('Content-Type', 'application/json')
  if (!skipAuth && auth.accessToken)
    requestHeaders.set('Authorization', `Bearer ${auth.accessToken}`)

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      credentials: 'include',
      body: formData ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: 0,
      message: '网络连接失败，请检查网络后重试',
      data: cause,
    })
  }

  const text = await response.text()
  if (!text) {
    if (response.ok) return undefined as T
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: `服务无响应内容（HTTP ${response.status}）`,
    })
  }

  let envelope: ApiResponse<T>
  try {
    envelope = JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: `响应格式异常（HTTP ${response.status}）`,
      data: text.slice(0, 200),
    })
  }
  if (typeof envelope?.code !== 'number') {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: '响应未遵循统一信封格式',
      data: envelope,
    })
  }
  if (envelope.code === ErrCode.OK) return envelope.data as T

  const code = envelope.code
  if (response.status === 401) {
    if (shouldForceLogout(code)) {
      if (!skipAuthRedirect) forceLogout(code === ErrCode.ACCOUNT_DISABLED ? 'disabled' : 'expired')
    } else if (isRefreshable(code) && !skipRefresh && !flags.isRefreshCall && !flags.retried) {
      try {
        await refreshOnce()
      } catch (error) {
        if (!skipAuthRedirect) forceLogout('expired')
        throw error
      }
      return rawRequest<T>(path, options, { ...flags, retried: true })
    } else if (!skipAuthRedirect && !flags.isRefreshCall) {
      forceLogout('expired')
    }
  }
  throw new ApiError({
    code,
    status: response.status,
    message: resolveErrorMessage(code, envelope.message),
    requestId: envelope.requestId,
    data: envelope.data,
  })
}

const performRefresh = async () => {
  const authStore = useAuthStore(pinia)
  const auth = await rawRequest<AuthResult>(
    '/auth/refresh',
    {
      method: 'POST',
      body: authStore.refreshToken ? { refreshToken: authStore.refreshToken } : {},
      skipAuth: true,
      skipAuthRedirect: true,
      skipRefresh: true,
    },
    { isRefreshCall: true },
  )
  authStore.setSession(auth)
  return auth.accessToken
}

const refreshOnce = () => {
  if (!refreshInFlight)
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

export const request = <T>(path: string, options?: RequestOptions) => rawRequest<T>(path, options)
export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

export const bootstrapSession = async () => {
  const auth = useAuthStore(pinia)
  if (auth.bootStatus !== 'idle') return Boolean(auth.accessToken)
  auth.setBootStatus('booting')
  try {
    await refreshOnce()
    return true
  } catch {
    auth.clear()
    return false
  }
}

export { ApiError, isApiError } from '@/lib/request/errors'
