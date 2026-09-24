/** @file Crawler policy complements private-page noindex metadata. */
import type { MetadataRoute } from 'next'

const robots = (): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    allow: '/',
    disallow: ['/member/', '/api/', '/login', '/register', '/search'],
  },
  sitemap: new URL('/sitemap.xml', process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:13001')
    .href,
})
export default robots
