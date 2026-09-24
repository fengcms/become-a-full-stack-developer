/**
 * @file components/article/LikeButton.tsx
 * @description 文章点赞按钮：展示点赞数，点击切换点赞态。
 *   客户端组件：需要鉴权请求。
 * @module web-frontend/components/article
 * @date 2026-09-17
 */

'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { getArticleLikeStatus, likeArticle, unlikeArticle } from '@/lib/api/likes'
import { useAuthStore } from '@/store/auth'

interface LikeButtonProps {
  articleId: number
  initialLiked?: boolean
  initialCount?: number
}

const LikeButton = ({ articleId, initialLiked = false, initialCount = 0 }: LikeButtonProps) => {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()

  // 拉取真实点赞状态（覆盖服务端默认值）
  useEffect(() => {
    getArticleLikeStatus(articleId)
      .then((s) => {
        setLiked(s.liked)
        setCount(s.likeCount)
      })
      .catch(() => {
        // 忽略错误，保持初始值
      })
  }, [articleId])

  const handleClick = async () => {
    if (!user) {
      toast('请先登录', 'info')
      return
    }
    setLoading(true)
    const prevLiked = liked
    const prevCount = count
    // 乐观更新
    setLiked(!liked)
    setCount(liked ? count - 1 : count + 1)
    try {
      const status = liked ? await unlikeArticle(articleId) : await likeArticle(articleId)
      setLiked(status.liked)
      setCount(status.likeCount)
    } catch {
      setLiked(prevLiked)
      setCount(prevCount)
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
        liked
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-line text-ink-soft hover:border-accent hover:text-accent'
      } disabled:opacity-60`}
      aria-pressed={liked}
      aria-label={liked ? '取消点赞' : '点赞'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span>{count}</span>
    </button>
  )
}

export default LikeButton
