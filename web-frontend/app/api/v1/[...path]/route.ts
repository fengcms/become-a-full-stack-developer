/** @file Same-origin API proxy: preserves query parameters and separate cookie headers. */
import { type NextRequest, NextResponse } from 'next/server'
import { backendCookie, frontendCookie } from '@/lib/proxy-utils'

const blocked = [
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding',
]
/** Restrict proxy paths and forward only to the configured API origin. */
const proxy = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
  const origin = process.env.API_ORIGIN
  if (!origin)
    return NextResponse.json({ code: 5000, message: 'API_ORIGIN 尚未配置' }, { status: 503 })
  const { path } = await params
  if (path.some((part) => part === '..' || part === '.' || /[\\/]/.test(part)))
    return NextResponse.json({ code: 4000, message: '无效路径' }, { status: 400 })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const source = req.headers.get('origin')
    let sourceHost = ''
    try {
      sourceHost = source ? new URL(source).host : ''
    } catch {
      sourceHost = 'invalid'
    }
    if (
      req.headers.get('sec-fetch-site') === 'cross-site' ||
      (source && sourceHost !== req.headers.get('host'))
    )
      return NextResponse.json({ code: 4000, message: '请求来源无效' }, { status: 403 })
  }
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, origin)
  url.search = req.nextUrl.search
  const headers = new Headers()
  for (const key of ['accept', 'content-type', 'authorization', 'user-agent']) {
    const value = req.headers.get(key)
    if (value) headers.set(key, value)
  }
  headers.set('accept-encoding', 'identity')
  const cookie = backendCookie(req.headers.get('cookie') || '')
  if (cookie) headers.set('cookie', cookie)
  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    const out = new Headers()
    response.headers.forEach((value, key) => {
      if (!blocked.includes(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie')
        out.set(key, value)
    })
    for (const cookie of response.headers.getSetCookie())
      out.append('set-cookie', frontendCookie(cookie, req.nextUrl.hostname))
    out.set('cache-control', 'private, no-store')
    if (path[0] === 'auth' && ['login', 'register', 'refresh'].includes(path[1]) && response.ok) {
      const envelope = await response.json()
      if (envelope.data) delete envelope.data.refreshToken
      return NextResponse.json(envelope, { status: response.status, headers: out })
    }
    return new NextResponse(response.body, { status: response.status, headers: out })
  } catch {
    return NextResponse.json(
      { code: 5000, message: '内容服务暂时不可用，请稍后重试' },
      { status: 502 },
    )
  }
}
export const GET = proxy
export const HEAD = proxy
export const POST = proxy
export const PATCH = proxy
export const DELETE = proxy
export const PUT = proxy
export const dynamic = 'force-dynamic'
