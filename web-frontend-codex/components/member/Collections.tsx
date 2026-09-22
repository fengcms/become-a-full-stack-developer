/** @file Collection views share one paginated controller. Line-limit exception: keeping the four contract adapters together avoids duplicate mutation/cache behavior. */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Empty, Failure, Skeleton } from '@/components/ui/Feedback'
import { unlikeArticle } from '@/lib/api/likes'
import {
  getMyArticles,
  getMyFavorites,
  getMyHistory,
  getMyLikes,
  removeFavorite,
  removeHistoryItem,
} from '@/lib/api/me'
import { type ArticleSummary, dateLabel } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
export type CollectionKind = 'favorites' | 'history' | 'likes' | 'articles'
const labels = {
  favorites: ['我的收藏', '保存值得反复阅读的文章。'],
  history: ['阅读历史', '从上次停下的地方，继续阅读。'],
  likes: ['我的点赞', '那些你曾经赞同的思考与实践。'],
  articles: ['我的文章', '查看文章的发布状态与阅读情况。'],
}
interface PageData {
  items: { article: ArticleSummary; time?: string; progress?: number }[]
  totalPages: number
  total: number
}
/** Normalize each contract response without inventing collection timestamps. */
const fetchCollection = async (
  kind: CollectionKind,
  page: number,
  status: string,
): Promise<PageData> => {
  if (kind === 'likes') {
    const list = await getMyLikes()
    return {
      items: list.slice((page - 1) * 10, page * 10).map((article) => ({ article })),
      totalPages: Math.ceil(list.length / 10),
      total: list.length,
    }
  }
  if (kind === 'history') {
    const data = await getMyHistory({ page, pageSize: 10 })
    return {
      items: data.list.map((item) => ({
        article: item.article,
        time: item.lastReadAt,
        progress: item.progress,
      })),
      totalPages: data.pagination.totalPages,
      total: data.pagination.total,
    }
  }
  const data =
    kind === 'favorites'
      ? await getMyFavorites({ page, pageSize: 10 })
      : await getMyArticles({ page, pageSize: 10, ...(status ? { status } : {}) })
  return {
    items: data.list.map((article) => ({ article })),
    totalPages: data.pagination.totalPages,
    total: data.pagination.total,
  }
}
/** Mutations refresh related caches and retreat from an emptied last page. */
export const Collections = ({ kind }: { kind: CollectionKind }) => {
  const user = useAuthStore((s) => s.user)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['member', user?.id, kind, page, status],
    queryFn: () => fetchCollection(kind, page, status),
    enabled: !!user,
  })
  const mutation = useMutation({
    mutationFn: async (id: number) => {
      await (kind === 'favorites'
        ? removeFavorite(id)
        : kind === 'history'
          ? removeHistoryItem(id)
          : unlikeArticle(id))
    },
    onSuccess: () => {
      if (query.data?.items.length === 1 && page > 1) setPage(page - 1)
      void client.invalidateQueries({ queryKey: ['member'] })
      void client.invalidateQueries({ queryKey: ['favorite-ids'] })
      void client.invalidateQueries({ queryKey: ['like'] })
      setNotice('已更新')
    },
    onError: (e) => setNotice(e.message),
  })
  const [title, description] = labels[kind]
  return (
    <>
      <div className="intro">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {kind === 'articles' && (
        <div className="tabs">
          {[
            ['', '全部'],
            ['published', '已发布'],
            ['pending', '待审核'],
            ['draft', '草稿'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? 'selected' : ''}
              type="button"
              onClick={() => {
                setPage(1)
                setStatus(value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <Skeleton />
      ) : query.isError ? (
        <Failure
          retry={() => {
            void query.refetch()
          }}
          message={query.error.message}
        />
      ) : !query.data.items.length ? (
        <Empty
          title={
            kind === 'favorites'
              ? '还没有收藏文章'
              : kind === 'history'
                ? '还没有阅读记录'
                : kind === 'likes'
                  ? '还没有点赞文章'
                  : '暂无文章'
          }
          message={kind === 'articles' ? '此状态下还没有文章。' : '先去发现一些值得阅读的内容吧。'}
        />
      ) : (
        <>
          <p className="subtitle">共 {query.data.total} 篇</p>
          {query.data.items.map((item, i) => (
            <div key={item.article.id}>
              {kind === 'history' &&
                dateLabel(item.time) !== dateLabel(query.data.items[i - 1]?.time) && (
                  <div className="timelinehead">{dateLabel(item.time)}</div>
                )}
              <ArticleCard
                article={item.article}
                meta={
                  kind === 'history'
                    ? `阅读于 ${dateLabel(item.time)}${item.progress !== undefined ? ` · 进度 ${item.progress}%` : ''}`
                    : undefined
                }
                status={kind === 'articles'}
                action={
                  kind !== 'articles' ? (
                    <button
                      className="textbutton"
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(item.article.id)}
                    >
                      {kind === 'favorites'
                        ? '取消收藏'
                        : kind === 'likes'
                          ? '取消点赞'
                          : '移除记录'}
                    </button>
                  ) : undefined
                }
              />
            </div>
          ))}
          {query.data.totalPages > 1 && (
            <nav className="pager" aria-label="会员列表分页">
              <button disabled={page === 1} type="button" onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span>
                {page} / {query.data.totalPages}
              </span>
              <button
                disabled={page >= query.data.totalPages}
                type="button"
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </nav>
          )}
        </>
      )}
    </>
  )
}
