/**
 * @file app/member/history/page.tsx
 * @description 阅读历史：分页展示阅读过的文章，支持删除单条。
 *   客户端组件：鉴权请求 + 交互。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { getMyHistory, type HistoryPage, removeHistoryItem } from '@/lib/api/me'

const PAGE_SIZE = 10

/** 格式化日期时间。 */
const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const HistoryPage_ = () => {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await getMyHistory({ page: p, pageSize: PAGE_SIZE })
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

  const handleRemove = async (articleId: number) => {
    try {
      await removeHistoryItem(articleId)
      load(page)
    } catch {
      // 忽略错误
    }
  }

  const list = data?.list ?? []
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">阅读历史</h1>

      {loading ? (
        <p className="text-ink-faint">加载中…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">暂无阅读历史</p>
      ) : (
        <div className="divide-y divide-line">
          {list.map((item) => {
            const article = item.article
            const href = article.slug ? `/articles/${article.slug}` : `/articles/${article.id}`
            return (
              <div key={article.id} className="group relative py-6">
                <Link href={href} className="block no-underline">
                  <h2 className="text-lg font-medium text-ink transition-colors hover:text-accent">
                    {article.title}
                  </h2>
                  <div className="mt-2 flex items-center gap-3 text-sm text-ink-faint">
                    {item.lastReadAt && <span>上次阅读：{formatDateTime(item.lastReadAt)}</span>}
                    {item.progress !== undefined && item.progress > 0 && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-ink-faint" />
                        <span>进度 {item.progress}%</span>
                      </>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(article.id)}
                  className="absolute right-0 top-6 text-xs text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  删除
                </button>
              </div>
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

export default HistoryPage_
