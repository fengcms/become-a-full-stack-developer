/** @file Server-rendered pagination retaining filter/query parameters. */
import Link from 'next/link'
/** Keep previous/next links usable without client-side JavaScript. */
export const Pagination = ({
  page,
  totalPages,
  path,
  query = {},
}: {
  page: number
  totalPages: number
  path: string
  query?: Record<string, string>
}) => {
  if (totalPages <= 1) return null
  const url = (number: number) =>
    `${path}?${new URLSearchParams({ ...query, page: String(number) })}`
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((n) => n > 0 && n <= totalPages)
    .sort((a, b) => a - b)
  return (
    <nav className="pager" aria-label="分页">
      {page > 1 && <Link href={url(page - 1)}>← 上一页</Link>}
      {pages.map((n, i) => (
        <span key={n}>
          {i > 0 && n - pages[i - 1] > 1 && <span className="ellipsis">…</span>}
          <Link
            href={url(n)}
            className={n === page ? 'selected' : ''}
            aria-current={n === page ? 'page' : undefined}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < totalPages && <Link href={url(page + 1)}>下一页 →</Link>}
      <small>
        第 {page} / {totalPages} 页
      </small>
    </nav>
  )
}
