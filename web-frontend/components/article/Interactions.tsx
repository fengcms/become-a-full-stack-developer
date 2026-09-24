/** @file Authenticated article actions, cached per identity and reflecting server state. */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { getArticleLikeStatus, likeArticle, unlikeArticle } from '@/lib/api/likes'
import { addFavorite, getMyFavorites, removeFavorite } from '@/lib/api/me'
import { useAuthStore } from '@/store/auth'
/** Resolve all favorite pages because the contract has no dedicated favorite-status endpoint. */
export const favoriteIds = async () => {
  const ids: number[] = []
  let page = 1
  let total = 1
  do {
    const result = await getMyFavorites({ page, pageSize: 100 })
    ids.push(...result.list.map((a) => a.id))
    total = result.pagination.totalPages
    page++
  } while (page <= total)
  return ids
}
/** Public counts are visible to guests; mutations require an authenticated account. */
export const Interactions = ({ id, count }: { id: number; count: number }) => {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.bootStatus === 'ready')
  const client = useQueryClient()
  const [notice, setNotice] = useState('')
  const like = useQuery({
    queryKey: ['like', user?.id, id],
    queryFn: () => getArticleLikeStatus(id),
    enabled: ready,
  })
  const favorite = useQuery({
    queryKey: ['favorite-ids', user?.id],
    queryFn: favoriteIds,
    enabled: !!user,
  })
  const liked = like.data?.liked || false
  const saved = favorite.data?.includes(id) || false
  const mutation = useMutation({
    mutationFn: async (kind: 'like' | 'favorite') => {
      if (kind === 'like') return liked ? unlikeArticle(id) : likeArticle(id)
      return saved ? removeFavorite(id) : addFavorite(id)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['like'] })
      void client.invalidateQueries({ queryKey: ['favorite-ids'] })
      void client.invalidateQueries({ queryKey: ['member'] })
      setNotice('操作已完成')
    },
    onError: (e) => setNotice(e.message),
  })
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('文章链接已复制')
    } catch {
      setNotice('请复制浏览器地址栏中的文章链接')
    }
  }
  return (
    <>
      <div className="actionrow">
        {user ? (
          <>
            <button
              className="sbutton"
              type="button"
              aria-pressed={liked}
              disabled={mutation.isPending || !like.data}
              onClick={() => mutation.mutate('like')}
            >
              {liked ? '已赞同' : '赞同'} · {like.data?.likeCount ?? count}
            </button>
            <button
              className="sbutton"
              type="button"
              aria-pressed={saved}
              disabled={mutation.isPending || !favorite.data}
              onClick={() => mutation.mutate('favorite')}
            >
              {saved ? '已收藏' : '收藏文章'}
            </button>
          </>
        ) : (
          <>
            <Link className="sbutton" href={`/login?redirect=/articles/${id}`}>
              登录后点赞 · {like.data?.likeCount ?? count}
            </Link>
            <Link className="sbutton" href={`/login?redirect=/articles/${id}`}>
              登录后收藏
            </Link>
          </>
        )}
        <button className="sbutton" type="button" onClick={share}>
          分享
        </button>
      </div>
      {(like.isError || favorite.isError) && (
        <p role="alert" className="formnote">
          互动状态加载失败，
          <button
            type="button"
            className="textbutton"
            onClick={() => {
              void like.refetch()
              if (user) void favorite.refetch()
            }}
          >
            重新加载
          </button>
        </p>
      )}
      {notice && (
        <p className="formnote" role="status">
          {notice}
        </p>
      )}
    </>
  )
}
