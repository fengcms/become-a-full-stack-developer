/**
 * @file app/(public)/categories/[slug]/page.tsx
 * @description 分类下文章列表页：按分类 slug 筛选文章。
 *   SSR（分类 slug 从路径读取，不可预生成全部分类组合）。
 * @module web-frontend/app/(public)/categories
 * @date 2026-09-16
 */

import ArticleCard from '@/components/article/ArticleCard'
import Pagination from '@/components/layout/Pagination'
import { listArticles } from '@/lib/api'

interface CategoryArticlesProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

const CategoryArticlesPage = async ({ params, searchParams }: CategoryArticlesProps) => {
  const { slug } = await params
  const sp = await searchParams
  const page = Number(sp.page) || 1
  const pageSize = 10

  const articlesPage = await listArticles({
    page,
    pageSize,
    sort: '-publishedAt',
    category: slug,
  }).catch(() => ({
    list: [],
    pagination: { page: 1, pageSize, total: 0, totalPages: 0 },
  }))

  const { list, pagination } = articlesPage

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <div className="mb-8 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">分类：{slug}</h1>
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
              basePath={`/categories/${slug}`}
            />
          )}
        </>
      ) : (
        <div className="py-16 text-center text-ink-faint">该分类下暂无文章</div>
      )}
    </div>
  )
}

export default CategoryArticlesPage
