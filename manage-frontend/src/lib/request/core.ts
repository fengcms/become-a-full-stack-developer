/**
 * @file src/lib/request/core.ts
 * @description 请求内核：拼 URL、带令牌、拆统一信封 `{ code, message, data }`、401 静默刷新与重放。
 *
 * ⚠️ 特殊情况（开发规范 §4）：本文件是请求层的高内聚核心，约 210 行超过 200 行上限。
 * 把它再拆碎会让「rawRequest ↔ 刷新逻辑 ↔ 401 分流」形成循环依赖，反而更难维护，
 * 故整体保留在此，仅把错误类型（errors.ts）、会话副作用（session.ts）、语法糖（helpers.ts）外移。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { ErrCode, isRefreshable, resolveErrorMessage, shouldForceLogout } from '@/lib/errorCodes'
import { API_BASE, ApiError } from '@/lib/request/errors'
import { forceLogout } from '@/lib/request/session'
import { useAuthStore } from '@/store/auth'
import type { ApiResponse, AuthResult } from '@/types/common'

/** 请求选项。在原生 RequestInit 基础上扩展 body / query / 三个 skip 开关。 */
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** 请求体。普通对象自动 JSON 序列化；FormData 原样透传（不设 Content-Type，交给浏览器带 boundary）。 */
  body?: unknown
  /** query 参数。undefined / null / '' 的键自动丢弃，不会拼出 `?a=undefined`。 */
  query?: Record<string, string | number | boolean | null | undefined>
  /** 不携带 Authorization（公开接口 / 登录接口）。 */
  skipAuth?: boolean
  /** 401 时不触发全局跳登录（登录页自身、boot 探测）。 */
  skipAuthRedirect?: boolean
  /** 401 时不尝试静默刷新。 */
  skipRefresh?: boolean
}

/** 内部标记，防止刷新请求自身触发刷新、以及重放请求被二次重放。 */
interface InternalFlags {
  isRefreshCall?: boolean
  retried?: boolean
}

/**
 * 拼接最终请求 URL：BASE + path + 已清理的 query 串；绝对 http(s) URL 直接透传。
 * 空值键（undefined / null / ''）一律跳过，避免污染查询串。
 *
 * @param path - 接口路径（相对）或完整 URL。
 * @param query - 查询参数；为空则原样返回 base。
 * @returns 可直接传给 fetch 的完整地址。
 */
const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const base = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base
}

/**
 * 同一时刻只允许一次刷新在飞。
 * 不做去重的后果：页面首屏并发 6 个请求同时 401，就会打 6 次 /auth/refresh，
 * 而后端刷新令牌是**旋转**的——第一个换走令牌，后 5 个拿着旧值全部失败，用户被莫名踢出。
 */
let refreshInFlight: Promise<string> | null = null

/**
 * 执行一次真正的刷新：用内存 refreshToken（或空体借 HttpOnly Cookie）打 /auth/refresh，
 * 写回会话并返回新 accessToken。
 *
 * @returns 刷新得到的新 access 令牌。
 */
const performRefresh = async (): Promise<string> => {
  const { refreshToken } = useAuthStore.getState()
  // 内存里有 refreshToken 就走请求体；没有则空体依赖后端 HttpOnly Cookie（同源代理下浏览器自动带）。
  const payload = refreshToken ? { refreshToken } : {}
  const auth = await rawRequest<AuthResult>(
    '/auth/refresh',
    { method: 'POST', body: payload, skipAuth: true, skipAuthRedirect: true, skipRefresh: true },
    { isRefreshCall: true },
  )
  useAuthStore.getState().setSession(auth)
  return auth.accessToken
}

/**
 * 并发安全的刷新入口：复用同一在飞 Promise，避免旋转令牌被并发刷新打穿。
 *
 * @returns 刷新后得到的新 access 令牌（多个并发调用共享同一次结果）。
 */
const refreshOnce = (): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * 核心请求实现：带令牌 → 拆信封 → 失败抛 ApiError → 401 分流（刷新 / 踢登录）。
 *
 * @param path - 接口路径或完整 URL。
 * @param options - 请求选项（见 RequestOptions）。
 * @param flags - 内部标记（刷新调用 / 是否已重放），防止无限递归。
 * @returns 信封内已解包的 data。
 */
const rawRequest = async <T>(
  path: string,
  options: RequestOptions = {},
  flags: InternalFlags = {},
): Promise<T> => {
  const { body, query, skipAuth, skipAuthRedirect, skipRefresh, headers, ...rest } = options

  const isFormData = body instanceof FormData
  const finalHeaders = new Headers(headers)

  if (!isFormData && body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (!finalHeaders.has('Accept')) {
    finalHeaders.set('Accept', 'application/json')
  }
  if (!skipAuth) {
    const token = useAuthStore.getState().accessToken
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // 断网 / DNS / 代理挂了。给一个能看懂的错，而不是 "Failed to fetch"。
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: 0,
      message: '网络连接失败，请检查网络后重试',
      data: cause,
    })
  }

  // 204 / 空体：契约里删除类接口也返回信封，但留一手兜底
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
    // 非 JSON：通常是代理返回的 HTML 错误页 / 网关超时页
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: `响应格式异常（HTTP ${response.status}）`,
      data: text.slice(0, 200),
    })
  }

  // 信封形状缺失（不该发生，但发生了要能定位到是网关而非业务）
  if (typeof envelope?.code !== 'number') {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: '响应未遵循统一信封格式',
      data: envelope,
    })
  }

  if (envelope.code === ErrCode.OK) {
    return envelope.data as T
  }

  const code = envelope.code

  /* --- 401 分流：能刷的刷，不能刷的踢 --- */
  if (response.status === 401) {
    if (shouldForceLogout(code)) {
      if (!skipAuthRedirect) {
        forceLogout(code === ErrCode.ACCOUNT_DISABLED ? 'disabled' : 'expired')
      }
      throw new ApiError({
        code,
        status: response.status,
        message: resolveErrorMessage(code, envelope.message),
        requestId: envelope.requestId,
        data: envelope.data,
      })
    }

    const canRetry = isRefreshable(code) && !skipRefresh && !flags.isRefreshCall && !flags.retried
    if (canRetry) {
      try {
        await refreshOnce()
      } catch (refreshErr) {
        if (!skipAuthRedirect) forceLogout('expired')
        throw refreshErr
      }
      // 重放：flags.retried 保证只重放一次，避免死循环
      return rawRequest<T>(path, options, { ...flags, retried: true })
    }

    if (!skipAuthRedirect && !flags.isRefreshCall) {
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

/**
 * 对外的请求入口。业务代码一律走它，不直接调 fetch。
 *
 * @param path - 接口路径或完整 URL。
 * @param options - 请求选项。
 * @returns 信封内已解包的 data。
 */
export const request = <T>(path: string, options?: RequestOptions): Promise<T> =>
  rawRequest<T>(path, options)

/**
 * 应用启动时尝试静默恢复会话。
 * 内存令牌在刷新页面后必然丢失，但后端登录时写过 HttpOnly Cookie，
 * 同源代理下这个 Cookie 会被自动带上 —— 于是空体打一次 /auth/refresh 就有机会白捡回会话。
 * 失败是完全正常的路径（首次访问 / Cookie 过期），不弹错、不跳转，只把 bootStatus 置为 ready。
 *
 * @returns 是否成功恢复会话。
 */
export const bootstrapSession = async (): Promise<boolean> => {
  const store = useAuthStore.getState()
  if (store.bootStatus !== 'idle') return Boolean(store.accessToken)

  store.setBootStatus('booting')
  try {
    await refreshOnce()
    return true
  } catch {
    useAuthStore.getState().clear() // clear 内部会把 bootStatus 置 ready
    return false
  }
}
