/**
 * @file app/(public)/layout.tsx
 * @description 公开内容路由组布局：共享 Header + Footer。
 *   所有无需登录即可访问的页面（首页、文章、分类、标签、搜索、会员公开主页）归在此组。
 * @module web-frontend/app/(public)
 * @date 2026-09-16
 */

import Footer from '@/components/layout/Footer'
import Header from '@/components/layout/Header'

interface PublicLayoutProps {
  children: React.ReactNode
}

const PublicLayout = ({ children }: PublicLayoutProps) => {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  )
}

export default PublicLayout
