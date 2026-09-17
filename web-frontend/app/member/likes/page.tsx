/**
 * @file app/member/likes/page.tsx
 * @description 我的点赞：展示点过赞的文章列表（数组，不分页）。
 *   客户端组件：鉴权请求。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import { useEffect, useState } from 'react'
import ArticleCard from '@/components/article/ArticleCard'
import { type ArticleSummary, getMyLikes } from '@/lib/api/me'

const LikesPage = () => {
  const [list, setList] = useState<ArticleSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyLikes()
      .then((result) => setList(result))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">我的点赞</h1>

      {loading ? (
        <p className="text-ink-faint">加载中…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">还没有点赞任何文章</p>
      ) : (
        <div className="divide-y divide-line">
          {list.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}

export default LikesPage
