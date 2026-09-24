/**
 * @file app/member/favorites/page.tsx
 * @description 我的收藏：分页展示收藏的文章，支持取消收藏。
 *   客户端组件：鉴权请求 + 交互。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import ArticleCard from '@/components/article/ArticleCard'
import { type ArticlePage, getMyFavorites, removeFavorite } from '@/lib/api/me'

const PAGE_SIZE = 10

const FavoritesPage = () => {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ArticlePage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const result = await getMyFavorites({ page: p, pageSize: PAGE_SIZE })
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
      await removeFavorite(articleId)
      load(page)
    } catch {
      // 忽略错误
    }
  }

  const list = data?.list ?? []
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">我的收藏</h1>

      {loading ? (
        <p className="text-ink-faint">加载中…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">还没有收藏任何文章</p>
      ) : (
        <div className="divide-y divide-line">
          {list.map((article) => (
            <div key={article.id} className="group relative">
              <ArticleCard article={article} />
              <button
                type="button"
                onClick={() => handleRemove(article.id)}
                className="absolute right-0 top-8 text-xs text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                取消收藏
              </button>
            </div>
          ))}
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

export default FavoritesPage
