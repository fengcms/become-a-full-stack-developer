/** @file Responsive category navigation with accessible native disclosures. */
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Category } from '@/lib/utils'

/** A recursive tree respecting the contract's four-level depth. */
const CategoryItem = ({ node, depth = 0 }: { node: Category; depth?: number }) =>
  node.children?.length ? (
    <details className={`nav-branch depth-${depth}`}>
      <summary>
        {node.name}
        <span aria-hidden="true"> ▾</span>
      </summary>
      <div className="drop">
        <Link href={`/categories/${node.slug}`}>{node.name} · 全部</Link>
        {node.children.map((child) => (
          <CategoryItem key={child.id || child.slug} node={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  ) : (
    <Link href={`/categories/${node.slug}`}>{node.name}</Link>
  )
/** Collapses at narrow widths and closes menus on navigation, outside click and Escape. */
export const Navigation = ({ categories }: { categories: Category[] }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname) return
    setOpen(false)
    ref.current?.querySelectorAll('details').forEach((el) => {
      el.open = false
    })
  }, [pathname])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const active = document.activeElement
        ref.current?.querySelectorAll('details[open]').forEach((el) => {
          ;(el as HTMLDetailsElement).open = false
        })
        if (active instanceof HTMLElement)
          active.closest('details')?.querySelector('summary')?.focus()
        setOpen(false)
      }
    }
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node))
        ref.current?.querySelectorAll('details').forEach((el) => {
          el.open = false
        })
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', outside)
    }
  }, [])
  return (
    <div className="navigation" ref={ref}>
      <button
        type="button"
        className="mobilemenu"
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen(!open)}
      >
        栏目 ☰
      </button>
      <nav id="site-navigation" className={`headnav ${open ? 'open' : ''}`} aria-label="主导航">
        <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          首页
        </Link>
        {categories.slice(0, 3).map((node) => (
          <CategoryItem node={node} key={node.id || node.slug} />
        ))}
        {categories.length > 3 ? (
          <details className="nav-branch depth-0">
            <summary>
              更多栏目 <span aria-hidden="true">▾</span>
            </summary>
            <div className="drop">
              <Link href="/categories">全部栏目</Link>
              {categories.slice(3).map((node) => (
                <CategoryItem key={node.id || node.slug} node={node} depth={1} />
              ))}
            </div>
          </details>
        ) : (
          <Link href="/categories">全部栏目</Link>
        )}
      </nav>
    </div>
  )
}
