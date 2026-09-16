/**
 * @file components/layout/Footer.tsx
 * @description 公开区页脚：版权信息。
 *   极简编辑风：顶部细分割线、居中窄栏、淡色文字。
 *   客户端组件：年份需运行时计算（Cache Components 模式下 new Date() 不可预渲染）。
 * @module web-frontend/components/layout
 * @date 2026-09-16
 */

'use client'

import { useEffect, useState } from 'react'

const Footer = () => {
  const [year, setYear] = useState(2026)

  useEffect(() => {
    setYear(new Date().getFullYear())
  }, [])

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-6 py-10 text-center text-sm text-ink-faint">
        <p>© {year} 成为全栈开发工程师 · 文章是产品，代码是素材</p>
      </div>
    </footer>
  )
}

export default Footer
