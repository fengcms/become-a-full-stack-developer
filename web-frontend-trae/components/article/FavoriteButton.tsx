/**
 * @file components/article/FavoriteButton.tsx
 * @description 文章收藏按钮：展示收藏态，点击切换收藏/取消收藏。
 *   客户端组件：需要鉴权请求。
 * @module web-frontend/components/article
 * @date 2026-09-18
 */

'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { addFavorite, getMyFavorites, removeFavorite } from '@/lib/api/me'
import { useAuthStore } from '@/store/auth'

interface FavoriteButtonProps {
  articleId: number
}

const FavoriteButton = ({ articleId }: FavoriteButtonProps) => {
  const [favorited, setFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()

  // 加载时检查是否已收藏
  useEffect(() => {
    if (!user) return
    getMyFavorites({ page: 1, pageSize: 100 })
      .then((page) => {
        const ids = page.list.map((a) => a.id)
        setFavorited(ids.includes(articleId))
      })
      .catch(() => {
        // 忽略错误
      })
  }, [articleId, user])

  const handleClick = async () => {
    if (!user) {
      toast('请先登录', 'info')
      return
    }
    setLoading(true)
    const prev = favorited
    setFavorited(!prev)
    try {
      if (prev) {
        await removeFavorite(articleId)
      } else {
        await addFavorite(articleId)
      }
    } catch {
      setFavorited(prev)
      toast('操作失败，请重试', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors ${
        favorited
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-line text-ink-soft hover:border-accent hover:text-accent'
      } disabled:opacity-60`}
      aria-pressed={favorited}
      aria-label={favorited ? '取消收藏' : '收藏'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={favorited ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      <span>{favorited ? '已收藏' : '收藏'}</span>
    </button>
  )
}

export default FavoriteButton
