/**
 * @file app/api/v1/[...path]/route.ts
 * @description 同源反代：浏览器端所有 /api/v1/* 请求经过此 Route Handler 转发到后端。
 *   好处：
 *   1. 规避浏览器 CORS（同源请求）；
 *   2. 后端地址不暴露给前端；
 *   3. refresh token 的 HttpOnly Cookie 在同源下自动携带，前端不触碰。
 *
 * 运行在 Node.js runtime（Cloudflare Workers 经 OpenNext 适配后仍为 Node 兼容模式）。
 * @module web-frontend/app/api/v1
 * @date 2026-09-16
 */

import { type NextRequest, NextResponse } from 'next/server'

/** 后端实际地址。本地用 .dev.vars 的 API_ORIGIN，生产用 wrangler secret。 */
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8787'

/** 不转发给后端的请求头（hop-by-hop + 主机相关）。 */
const HOP_BY_HOP_HEADERS = [
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

/**
 * 把前端 /api/v1/* 路径拼到后端。
 * 例如 path=['articles','123'] → ${API_ORIGIN}/api/v1/articles/123
 */
const buildBackendUrl = (path: string[]): string => {
  const subPath = path.join('/')
  return `${API_ORIGIN}/api/v1/${subPath}`
}

/**
 * 通用转发逻辑：复制请求头（剔除 hop-by-hop）、转发 body、回写响应。
 */
const proxy = async (
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> => {
  const { path } = await params
  const backendUrl = buildBackendUrl(path)

  // 构造转发头
  const headers = new Headers(req.headers)
  for (const hop of HOP_BY_HOP_HEADERS) {
    headers.delete(hop)
  }
  // 后端需要真实的 host 用于日志/限流，用 X-Forwarded-Host 传递
  headers.set('X-Forwarded-Host', req.headers.get('host') || '')
  headers.set('X-Forwarded-Proto', 'https')

  // 转发请求（注意：credentials 让 Cookie 透传）
  const backendRes = await fetch(backendUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
    // 不缓存反代响应
    cache: 'no-store',
  })

  // 构造响应头：剔除 hop-by-hop，保留 Set-Cookie（让浏览器写入 refresh token Cookie）
  const resHeaders = new Headers()
  backendRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
      resHeaders.append(key, value)
    }
  })

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: resHeaders,
  })
}

/** 支持的 HTTP 方法。 */
export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy

/** 关闭此路由的缓存（反代必须实时）。 */
export const dynamic = 'force-dynamic'

