/**
 * @file Next.js 配置
 * 配置 Cloudflare 部署相关选项。
 *
 * 注意：Cache Components（Next 16 显式缓存）当前在 Cloudflare Workers runtime 下
 * 因 setTimeout 实现差异导致请求挂起（500 Internal Server Error），
 * 暂不启用，待 @opennextjs/cloudflare 适配后再开启。
 */
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 图片优化走 Cloudflare Images（Workers 不支持 sharp 原生模块）
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    formats: ['image/avif', 'image/webp'],
  },
}

export default nextConfig
