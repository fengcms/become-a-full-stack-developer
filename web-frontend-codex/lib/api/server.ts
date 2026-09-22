/** @file Public server API transport; explicit caching, validation and configuration failures. */
import { type BizErrorCode, ErrCode } from '@/lib/errorCodes'
import { ApiError, type ApiResponse } from '@/lib/request/errors'
/** Fetch a public endpoint. Private data never uses this transport. */
export const serverFetch = async <T>(
  path: string,
  options: {
    query?: Record<string, string | number | boolean | null | undefined>
    cache?: RequestCache
    next?: { revalidate?: number; tags?: string[] }
    headers?: HeadersInit
  } = {},
): Promise<T> => {
  const origin = process.env.API_ORIGIN
  if (!origin) throw new Error('请配置 API_ORIGIN 后启动网站。')
  const url = new URL(`/api/v1${path.startsWith('/') ? path : `/${path}`}`, origin)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value))
  }
  const response = await fetch(url, {
    cache: options.cache || 'force-cache',
    ...(options.cache === 'no-store' ? {} : { next: { revalidate: 60, ...options.next } }),
    headers: { Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(12000),
  })
  let envelope: ApiResponse<T>
  try {
    envelope = await response.json()
  } catch {
    throw new ApiError({
      code: ErrCode.INTERNAL,
      status: response.status,
      message: '内容服务返回了无法识别的数据',
    })
  }
  if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
    throw new ApiError({
      code: (envelope.code || ErrCode.INTERNAL) as BizErrorCode,
      status: response.status,
      message: envelope.message || '内容暂时无法加载',
    })
  }
  return envelope.data
}
