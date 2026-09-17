/**
 * @file app/member/articles/page.tsx
 * @description 我的文章：分页展示本人所有文章（含草稿/待审/已发布）。
 *   客户端组件：鉴权请求。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { type ArticlePage, getMyArticles } from '@/lib/api/me'

const PAGE_SIZE = 10

/** 状态标签样式映射。 */
const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
}

/** 格式化日期。 */
const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const MyArticlesPage = () => {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ArticlePage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await getMyArticles({ page: p, pageSize: PAGE_SIZE })
      setData(result)
    } catch {
      setData({ list: [], pagination: { page: p, pageSize: PAGE_SIZE, total: 0, totalPages: 0 } })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page)
  }, [page, load])

  const list = data?.list ?? []
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">我的文章</h1>

      {loading ? (
        <p className="text-ink-faint">加载中…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">还没有发布任何文章</p>
      ) : (
        <div className="divide-y divide-line">
          {list.map((article) => {
            const href = article.slug ? `/articles/${article.slug}` : `/articles/${article.id}`
            const date = formatDate(article.publishedAt || article.createdAt)
            return (
              <article key={article.id} className="py-6">
                <div className="flex items-center gap-2">
                  {article.status && (
                    <span className="rounded bg-hover px-2 py-0.5 text-xs text-ink-soft">
                      {STATUS_LABEL[article.status] ?? article.status}
                    </span>
                  )}
                  {article.categoryName && (
                    <span className="text-xs text-ink-faint">{article.categoryName}</span>
                  )}
                </div>
                <h2 className="mt-2 text-lg font-medium">
                  <Link
                    href={href}
                    className="text-ink no-underline transition-colors hover:text-accent"
                  >
                    {article.title}
                  </Link>
                </h2>
                {article.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{article.summary}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-sm text-ink-faint">
                  {date && <time dateTime={date}>{date}</time>}
                  {article.viewCount !== undefined && article.viewCount > 0 && (
                    <span>{article.viewCount} 次阅读</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-2 text-sm text-ink-faint">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent disabled:opacity-40"
          >
            下一页
          </button>
        </nav>
      )}
    </div>
  )
}

export default MyArticlesPage
