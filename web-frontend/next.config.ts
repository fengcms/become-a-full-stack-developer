/** @file Independent Next.js configuration; preserve the established Node/OpenNext runtime. */
import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  async rewrites() {
    // 浏览器端 NEXT_PUBLIC_API_BASE_URL 默认 /api/v1（同源）。本规则把它代理到后端 API_ORIGIN，
    // 既避免浏览器跨域，又与服务端 RSC 共用同一份后端地址配置。
    const origin = process.env.API_ORIGIN || 'http://127.0.0.1:11001'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${origin}/api/v1/:path*`,
      },
    ]
  },
}
export default config
