/**
 * @file lib/request/index.ts
 * @description 请求层统一出口。业务代码从此处 import request / ApiError / isApiError。
 * @module web-frontend/lib/request
 * @date 2026-09-16
 */

export { bootstrapSession, type RequestOptions, request } from '@/lib/request/core'
export { API_BASE, ApiError, type ApiResponse, isApiError } from '@/lib/request/errors'
export { forceLogout, setUnauthorizedHandler } from '@/lib/request/session'
