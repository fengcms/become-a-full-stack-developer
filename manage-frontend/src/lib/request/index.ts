/**
 * @file src/lib/request/index.ts
 * @description 请求层公共出口。业务代码统一从 `@/lib/request` 引入，
 *   不直接依赖 errors / session / core / helpers 任一子模块。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

export { bootstrapSession, type RequestOptions, request } from '@/lib/request/core'
export { API_BASE, ApiError, isApiError } from '@/lib/request/errors'
export { fileUrl, http } from '@/lib/request/helpers'
export { setUnauthorizedHandler } from '@/lib/request/session'
