/** @file Bounded automatic pagination with explicit retry and no-JS archive access. */
'use client'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Empty, Failure, Skeleton } from '@/components/ui/Feedback'
import type { ArticlePage } from '@/lib/api/articles'
import { request } from '@/lib/request'
import type { Category } from '@/lib/utils'
/** Automatically fetch only two subsequent batches, then keep the footer reachable. */
export const Feed = ({ initial, categories }: { initial: ArticlePage; categories: Category[] }) => {
  const [category, setCategory] = useState('')
  const sentinel = useRef<HTMLDivElement>(null)
  const query = useInfiniteQuery({
    queryKey: ['public-feed', category],
    initialPageParam: 1,
    initialData: category ? undefined : { pages: [initial], pageParams: [1] },
    queryFn: ({ pageParam }) =>
      request<ArticlePage>('/articles', {
        skipAuth: true,
        skipRefresh: true,
        query: { page: pageParam, pageSize: 10, sort: '-publishedAt', category },
      }),
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
  const count = query.data?.pages.length || 0
  useEffect(() => {
    if (!sentinel.current || !hasNextPage || isFetchingNextPage || query.isError || count >= 3)
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void fetchNextPage()
      },
      { rootMargin: '100px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, count, query.isError])
  const items = Array.from(
    new Map((query.data?.pages.flatMap((p) => p.list) || []).map((a) => [a.id, a])).values(),
  )
  return (
    <section>
      <div className="sectionhead">
        <h2>发现好文章</h2>
        <Link className="muted" href="/articles">
          全部文章 →
        </Link>
      </div>
      <fieldset className="tabs">
        <legend className="sr-only">按分类浏览</legend>
        <button
          type="button"
          className={!category ? 'selected' : ''}
          onClick={() => setCategory('')}
        >
          全部
        </button>
        {categories.slice(0, 4).map((c) => (
          <button
            type="button"
            key={c.id || c.slug}
            className={category === c.slug ? 'selected' : ''}
            onClick={() => setCategory(c.slug || '')}
          >
            {c.name}
          </button>
        ))}
      </fieldset>
      {query.isPending ? (
        <Skeleton />
      ) : items.length ? (
        items.map((a) => <ArticleCard key={a.id} article={a} categories={categories} />)
      ) : (
        !query.isError && <Empty />
      )}
      <div ref={sentinel} />
      {query.isError && (
        <Failure
          retry={() => {
            void (query.isFetchNextPageError ? fetchNextPage() : query.refetch())
          }}
        />
      )}
      {hasNextPage && !query.isError && (
        <button
          className="sbutton full"
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => {
            void fetchNextPage()
          }}
        >
          {isFetchingNextPage ? '正在加载…' : '加载更多文章 ↓'}
        </button>
      )}
      {!hasNextPage && items.length > 0 && <p className="formnote">你已看完所有文章</p>}
      <p className="formnote">
        <Link href="/articles">按页浏览全部文章 →</Link>
      </p>
    </section>
  )
}
