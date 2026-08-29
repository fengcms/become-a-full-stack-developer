/**
 * @file src/lib/request/helpers.ts
 * @description 请求层语法糖：http 动词快捷方法 + 附件 URL 修正。
 *   不碰令牌与信封，纯粹是 request() 的薄封装与 URL 工具。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { type RequestOptions, request } from '@/lib/request/core'

/**
 * HTTP 动词快捷方法。业务代码优先用 http.get/post/... 而非裸 request。
 * 各方法自动填入 method，post/put/patch 透传 body，delete 无 body。
 */
export const http = {
  /**
   * GET 请求。
   * @param path - 接口路径。
   * @param options - 不含 method/body 的请求选项（query 等）。
   */
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  /**
   * POST 请求。
   * @param path - 接口路径。
   * @param body - 请求体（对象或 FormData）。
   * @param options - 不含 method/body 的请求选项。
   */
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  /**
   * PUT 请求。
   * @param path - 接口路径。
   * @param body - 请求体。
   * @param options - 不含 method/body 的请求选项。
   */
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  /**
   * PATCH 请求。
   * @param path - 接口路径。
   * @param body - 请求体。
   * @param options - 不含 method/body 的请求选项。
   */
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  /**
   * DELETE 请求。
   * @param path - 接口路径。
   * @param options - 不含 method/body 的请求选项。
   */
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

/**
 * 把契约返回的 attachment.url（形如 `/files/{key}`）转成可直接放进 src 的地址。
 *
 * ⚠️ 坑：`/files` 挂在后端**根路径**，不在 `/api/v1` 下。
 * 想当然地拼 `${API_BASE}${url}` 会得到 `/api/v1/files/xxx` → 稳定 404。
 *
 * @param url - 后端返回的相对/绝对地址；空值返回空串。
 * @returns 浏览器可直接使用的地址（相对根路径或绝对地址）。
 */
export const fileUrl = (url: string | null | undefined): string => {
  if (!url) return ''
  if (/^(https?:)?\/\//.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}
