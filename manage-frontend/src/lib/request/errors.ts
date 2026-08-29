/**
 * @file src/lib/request/errors.ts
 * @description 请求层错误类型与接口前缀。定义统一业务异常 ApiError 及类型守卫。
 *   本文件不依赖其他请求子模块，是整条依赖链的根。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import type { ErrorCode } from '@/types/common'

/**
 * 接口前缀。开发期是相对路径，命中 vite.config.ts 的同源代理（方案 B，免 CORS）；
 * 部署时可用 VITE_API_BASE 指向真实域名。
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE || '/api/v1'

/**
 * 统一业务异常。凡是「服务器给了明确结论但结论是失败」，都抛这个。
 * 调用方用 `err.code === ErrCode.CONFLICT` 这类判断做分支，而不是去 match 文案。
 */
export class ApiError extends Error {
  /** 契约业务码（数字）。网络层面失败时为 5000。 */
  readonly code: ErrorCode
  /** HTTP 状态码。网络不可达 / 响应不可解析时为 0。 */
  readonly status: number
  /** 服务端请求 ID，排查线上问题时贴给后端。 */
  readonly requestId?: string
  /** 失败响应的 data。4001 时是 ValidationErrorList，可用于表单字段级回填。 */
  readonly data?: unknown

  constructor(params: {
    code: ErrorCode
    status: number
    message: string
    requestId?: string
    data?: unknown
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.requestId = params.requestId
    this.data = params.data
  }
}

/**
 * 类型守卫：判断未知错误是否为 ApiError，并收窄出 code/status 等字段。
 *
 * @param err - 待判断的任意错误对象。
 * @returns 为 ApiError 时附带类型收窄，可直接读取 code。
 */
export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError
