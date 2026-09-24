/**
 * @file app/not-found.tsx
 * @description 全局 404 页面。
 *   极简编辑风：居中提示 + 返回首页链接。
 * @module web-frontend/app
 * @date 2026-09-18
 */

import Link from 'next/link'

const NotFound = () => {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-serif text-6xl font-semibold text-ink">404</p>
      <h1 className="mt-4 text-xl font-semibold text-ink">页面不存在</h1>
      <p className="mt-2 text-ink-soft">你访问的页面可能已被移动或删除。</p>
      <Link
        href="/"
        className="mt-8 rounded border border-accent px-5 py-2 text-accent no-underline transition-colors hover:bg-accent hover:text-surface"
      >
        返回首页
      </Link>
    </main>
  )
}

export default NotFound
