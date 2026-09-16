/**
 * @file components/layout/Header.tsx
 * @description 公开区页头：站点名（衬线）+ 导航链接（含分类下拉）。
 *   极简编辑风：白色底、底部细分割线、居中窄栏。
 *   RSC：获取分类树传给客户端下拉组件。
 * @module web-frontend/components/layout
 * @date 2026-09-16
 */

import Link from 'next/link'
import CategoryDropdown from '@/components/layout/CategoryDropdown'
import { getCategoryTree } from '@/lib/api'

const NAV_ITEMS = [
  { href: '/articles', label: '文章' },
  { href: '/tags', label: '标签' },
  { href: '/about', label: '关于' },
]

const Header = async () => {
  const categories = await getCategoryTree().catch(() => [])

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-ink no-underline font-serif"
        >
          成为全栈开发工程师
        </Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-ink-soft transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
          <CategoryDropdown categories={categories} />
        </nav>
      </div>
    </header>
  )
}

export default Header
