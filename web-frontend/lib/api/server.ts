/**
 * @file lib/api/server.ts
 * @description 服务端（RSC / Route Handler）请求封装。
 *   与客户端 lib/request/core.ts 的区别：
 *   - 直连后端（不走浏览器同源反代），用 API_ORIGIN 环境变量拼绝对 URL；
 *   - 不带 Authorization（公开接口为主，会员数据由客户端请求层处理）；
 *   - 不做 401 刷新（服务端无登录态概念）。
 *   所有响应遵循统一信封 { code, message, data }，code !== 0 抛 ApiError。
 * @module web-frontend/lib/api
 * @date 2026-09-16
 */

import { ErrCode } from '@/lib/errorCodes'
import { ApiError, type ApiResponse } from '@/lib/request/errors'

/**
 * 后端 API 基础地址。
 * Workers 运行时从 process.env.API_ORIGIN 读取（.dev.vars 注入）；
 * 兜底用同源反代路径（Next.js dev 下相对路径可解析）。
 */
const API_ORIGIN = process.env.API_ORIGIN || ''
const SERVER_API_BASE = API_ORIGIN ? `${API_ORIGIN}/api/v1` : '/api/v1'

/** 查询参数值类型。 */
type QueryValue = string | number | boolean | null | undefined

/** 查询参数对象类型。 */
type QueryParams = Record<string, QueryValue>

/**
 * 拼接最终 URL：base + path + query。
 *
 * @param path - 接口路径（如 /articles）。
 * @param query - 查询参数。
 */
const buildUrl = (path: string, query?: QueryParams): string => {
  const base = `${SERVER_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * 服务端 fetch：拆统一信封，失败抛 ApiError。
 *
 * @param path - 接口路径。
 * @param options - fetch 选项 + query。
 * @param options.query - 查询参数。
 * @param options.cache - 缓存策略（默认 'force-cache'，配合 ISR）。
 * @param options.next - Next.js fetch 扩展（revalidate / tags）。
 * @returns 信封内已解包的 data。
 */
export const serverFetch = async <T>(
  path: string,
  options: {
    query?: QueryParams
    cache?: RequestCache
    next?: { revalidate?: number; tags?: string[] }
    headers?: HeadersInit
  } = {},
): Promise<T> => {
  // 构建时无 API_ORIGIN：直连 fetch 会超时，直接返回空数据让 SSG 构建通过；
  // 运行时（wrangler dev / 生产）API_ORIGIN 由 .dev.vars / wrangler secret 注入，正常请求。
  if (!API_ORIGIN) {
    return undefined as T
  }

  const { query, cache = 'force-cache', next, headers } = options

  const response = await fetch(buildUrl(path, query), {
    cache,
    next,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  })

  const text = await response.text()
  if (!text) {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: response.ok ? '服务无响应内容' : `请求失败（HTTP ${response.status}）`,
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

  if (envelope.code !== ErrCode.OK) {
    throw new ApiError({
      code: envelope.code as never,
      status: response.status,
      message: envelope.message,
      requestId: envelope.requestId,
      data: envelope.data,
    })
  }

  return envelope.data as T
}
