/**
 * @file app/(public)/articles/page.tsx
 * @description 文章列表页：分页展示所有 published 文章，支持分类/标签/关键词筛选。
 *   搜索参数从 URL searchParams 读取，SSR（动态渲染，因为筛选参数不可预生成）。
 * @module web-frontend/app/(public)/articles
 * @date 2026-09-16
 */

import ArticleCard from '@/components/article/ArticleCard'
import Pagination from '@/components/layout/Pagination'
import { listArticles } from '@/lib/api'

interface ArticlesPageProps {
  searchParams: Promise<{
    page?: string
    category?: string
    tag?: string
    keyword?: string
  }>
}

const ArticlesPage = async ({ searchParams }: ArticlesPageProps) => {
  const sp = await searchParams
  const page = Number(sp.page) || 1
  const pageSize = 10

  const articlesPage = await listArticles({
    page,
    pageSize,
    sort: '-publishedAt',
    category: sp.category,
    tag: sp.tag,
    keyword: sp.keyword,
  }).catch(() => ({
    list: [],
    pagination: { page: 1, pageSize, total: 0, totalPages: 0 },
  }))

  const { list, pagination } = articlesPage

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      <div className="mb-8 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">文章</h1>
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
              basePath="/articles"
              searchParams={sp}
            />
          )}
        </>
      ) : (
        <div className="py-16 text-center text-ink-faint">暂无文章</div>
      )}
    </div>
  )
}

export default ArticlesPage
