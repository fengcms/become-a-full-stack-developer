/**
 * @file app/robots.ts
 * @description 动态生成 robots.txt。
 * @module web-frontend/app
 * @date 2026-09-16
 */

import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:13000'

const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
  ],
  sitemap: `${SITE_URL}/sitemap.xml`,
})

export default robots
