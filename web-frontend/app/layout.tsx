/**
 * @file app/layout.tsx
 * @description 根布局：全局 metadata、字体、HTML 结构。
 *   极简编辑风：衬线标题、系统无衬线正文、米白底。
 * @module web-frontend/app
 * @date 2026-09-16
 */

import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/components/auth/AuthProvider'
import { getSiteSettings } from '@/lib/api'

/** 默认兜底配置（后端不可达时使用）。 */
const DEFAULT_SITE = {
  siteName: '成为全栈开发工程师',
  siteDescription:
    '用一个真实可运行的多端文章系统，串起后端、前台、移动端全链路。七个子项目，一套 API 契约。',
  siteKeywords: '全栈开发,Next.js,Node.js,React,TypeScript,教程',
}

/** 动态 metadata：从站点配置读取标题/描述/关键词。 */
export const generateMetadata = async (): Promise<Metadata> => {
  const site = await getSiteSettings().catch(() => null)
  const siteName = site?.siteName ?? DEFAULT_SITE.siteName
  const title = site?.siteTitle || siteName
  const description = site?.siteDescription ?? DEFAULT_SITE.siteDescription
  const keywords = (site?.siteKeywords ?? DEFAULT_SITE.siteKeywords)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  return {
    title: {
      default: title,
      template: `%s · ${siteName}`,
    },
    description,
    keywords,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  }
}

interface RootLayoutProps {
  children: React.ReactNode
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}

export default RootLayout
