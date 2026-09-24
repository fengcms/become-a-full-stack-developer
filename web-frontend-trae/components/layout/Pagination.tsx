/**
 * @file components/layout/Pagination.tsx
 * @description 分页导航：上一页/下一页 + 页码。保留现有 searchParams 筛选条件。
 * @module web-frontend/components/layout
 * @date 2026-09-16
 */

import Link from 'next/link'

interface PaginationProps {
  /** 当前页码（从 1 开始）。 */
  page: number
  /** 总页数。 */
  totalPages: number
  /** 基础路径（如 /articles）。 */
  basePath: string
  /** 现有搜索参数（用于保留 category/tag/keyword 等筛选条件）。 */
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * 构建分页链接的 query 字符串。
 *
 * @param page - 目标页码。
 * @param searchParams - 现有搜索参数。
 */
const buildHref = (
  page: number,
  basePath: string,
  searchParams?: Record<string, string | string[] | undefined>,
): string => {
  const params = new URLSearchParams()
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'page' || value === undefined) continue
      if (Array.isArray(value)) {
        value.forEach((v) => {
          params.append(key, v)
        })
      } else {
        params.set(key, value)
      }
    }
  }
  params.set('page', String(page))
  return `${basePath}?${params.toString()}`
}

/**
 * 生成分页页码列表（含省略号）。
 *
 * @param current - 当前页。
 * @param total - 总页数。
 */
const getPageNumbers = (current: number, total: number): (number | '...')[] => {
  const pages: (number | '...')[] = []
  const delta = 1
  const range: number[] = []

  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i)
    }
  }

  let prev = 0
  for (const p of range) {
    if (p - prev > 1) pages.push('...')
    pages.push(p)
    prev = p
  }

  return pages
}

/**
 * 分页组件。
 */
const Pagination = ({ page, totalPages, basePath, searchParams }: PaginationProps) => {
  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="分页">
      {page > 1 && (
        <Link
          href={buildHref(page - 1, basePath, searchParams)}
          className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent"
        >
          上一页
        </Link>
      )}

      {pageNumbers.map((p, idx) =>
        p === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-ink-faint">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p, basePath, searchParams)}
            className={`rounded px-3 py-2 text-sm transition-colors ${
              p === page
                ? 'bg-accent text-surface'
                : 'text-ink-soft hover:bg-hover hover:text-accent'
            }`}
          >
            {p}
          </Link>
        ),
      )}

      {page < totalPages && (
        <Link
          href={buildHref(page + 1, basePath, searchParams)}
          className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent"
        >
          下一页
        </Link>
      )}
    </nav>
  )
}

export default Pagination
