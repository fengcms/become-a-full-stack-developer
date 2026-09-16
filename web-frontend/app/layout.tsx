/**
 * @file app/layout.tsx
 * @description 根布局：全局 metadata、字体、HTML 结构。
 *   极简编辑风：衬线标题、系统无衬线正文、米白底。
 * @module web-frontend/app
 * @date 2026-09-16
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '成为全栈开发工程师',
    template: '%s · 成为全栈开发工程师',
  },
  description:
    '用一个真实可运行的多端文章系统，串起后端、前台、移动端全链路。七个子项目，一套 API 契约。',
  keywords: ['全栈开发', 'Next.js', 'Node.js', 'React', 'TypeScript', '教程'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
}

interface RootLayoutProps {
  children: React.ReactNode
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  )
}

export default RootLayout
