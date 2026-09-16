/**
 * @file app/(public)/tags/[slug]/page.tsx
 * @description 标签下文章列表页：按标签 slug 筛选文章。
 *   SSR（标签 slug 从路径读取）。
 * @module web-frontend/app/(public)/tags
 * @date 2026-09-16
 */

import ArticleCard from '@/components/article/ArticleCard'
import Pagination from '@/components/layout/Pagination'
import { listArticles } from '@/lib/api'

interface TagArticlesProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

const TagArticlesPage = async ({ params, searchParams }: TagArticlesProps) => {
  const { slug } = await params
  const sp = await searchParams
  const page = Number(sp.page) || 1
  const pageSize = 10

  const articlesPage = await listArticles({
    page,
    pageSize,
    sort: '-publishedAt',
    tag: slug,
  }).catch(() => ({
    list: [],
    pagination: { page: 1, pageSize, total: 0, totalPages: 0 },
  }))

  const { list, pagination } = articlesPage

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <div className="mb-8 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">标签：#{slug}</h1>
        <p className="mt-1 text-sm text-ink-faint">
          共 {pagination.total} 篇文章
          {pagination.totalPages > 1 ? `，第 ${page}/${pagination.totalPages} 页` : ''}
        </p>
      </div>

      {list.length > 0 ? (
        <>
          <div className="divide-y divide-line">
            {list.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              basePath={`/tags/${slug}`}
            />
          )}
        </>
      ) : (
        <div className="py-16 text-center text-ink-faint">该标签下暂无文章</div>
      )}
    </div>
  )
}

export default TagArticlesPage
