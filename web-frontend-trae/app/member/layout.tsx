/**
 * @file app/(member)/layout.tsx
 * @description 会员中心路由组布局：登录守卫 + 会员中心导航。
 *   未登录自动跳转登录页。
 * @module web-frontend/app/(member)
 * @date 2026-09-17
 */

import Link from 'next/link'
import AuthGuard from '@/components/auth/AuthGuard'

interface MemberLayoutProps {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/member/profile', label: '个人资料' },
  { href: '/member/favorites', label: '我的收藏' },
  { href: '/member/history', label: '阅读历史' },
  { href: '/member/articles', label: '我的文章' },
  { href: '/member/likes', label: '我的点赞' },
  { href: '/member/notifications', label: '通知' },
]

const MemberLayout = ({ children }: MemberLayoutProps) => {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-content px-6 py-12">
        <nav className="mb-8 flex flex-wrap gap-4 border-b border-line pb-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-soft no-underline transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </AuthGuard>
  )
}

export default MemberLayout
