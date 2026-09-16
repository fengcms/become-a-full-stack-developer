/**
 * @file components/layout/CategoryDropdown.tsx
 * @description 分类下拉菜单：鼠标悬停展开，展示分类树（顶级 + 子分类）。
 *   客户端组件（需要交互状态），分类数据由服务端 Header 传入。
 * @module web-frontend/components/layout
 * @date 2026-09-16
 */

'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { CategoryNode } from '@/lib/api'

interface CategoryDropdownProps {
  /** 分类树数据。 */
  categories: CategoryNode[]
}

/**
 * 分类下拉菜单组件。
 *
 * @param categories - 分类树。
 */
const CategoryDropdown = ({ categories }: CategoryDropdownProps) => {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 鼠标进入：清除收起定时器，展开菜单。 */
  const handleEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOpen(true)
  }

  /** 鼠标离开：延迟收起，给用户移动到菜单的时间。 */
  const handleLeave = () => {
    timerRef.current = setTimeout(() => setOpen(false), 150)
  }

  if (categories.length === 0) {
    return (
      <Link
        href="/categories"
        className="text-sm text-ink-soft transition-colors hover:text-accent"
      >
        分类
      </Link>
    )
  }

  return (
    <div className="relative" role="menu" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-ink-soft transition-colors hover:text-accent"
        onClick={() => setOpen((v) => !v)}
      >
        分类
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-lg border border-line bg-surface p-2 shadow-lg">
          {categories.map((node) => (
            <div key={node.id} className="py-0.5">
              <Link
                href={`/categories/${node.slug}`}
                className="block rounded px-3 py-1.5 text-sm text-ink no-underline transition-colors hover:bg-hover hover:text-accent"
              >
                {node.name}
              </Link>
              {node.children && node.children.length > 0 && (
                <div className="ml-3 border-l border-line pl-2">
                  {node.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.slug}`}
                      className="block rounded px-3 py-1 text-xs text-ink-soft no-underline transition-colors hover:bg-hover hover:text-accent"
                    >
                      {child.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              href="/categories"
              className="block rounded px-3 py-1.5 text-xs text-ink-faint no-underline transition-colors hover:text-accent"
            >
              全部分类 →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoryDropdown
