/**
 * @file app/(public)/page.tsx
 * @description 首页：系列介绍 + 最新文章列表。
 *   极简编辑风：居中窄栏、大量留白、衬线大标题。
 *   RSC 直连后端，SSG + ISR（revalidate: 1h）。
 * @module web-frontend/app/(public)
 * @date 2026-09-16
 */

import ArticleCard from '@/components/article/ArticleCard'
import { getCategoryTree, listArticles, listTags } from '@/lib/api'

/** 首页缓存策略：1 小时重新验证。 */
export const revalidate = 3600

const Home = async () => {
  // 并发拉取：最新文章 + 分类树 + 标签
  // 构建时后端可能不可达，统一 catch 降级为空数据，运行时 ISR 会重新拉取
  const [articlesPage, categories, tags] = await Promise.all([
    listArticles({ sort: '-publishedAt', pageSize: 10 }, ['articles']).catch(() => ({
      list: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    })),
    getCategoryTree().catch(() => []),
    listTags().catch(() => []),
  ])

  const articles = articlesPage?.list ?? []
  const categoryCount = (categories ?? []).length
  const tagCount = (tags ?? []).length

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-content px-6 py-16 text-center sm:py-20">
        <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-accent">
          系列教程 · 持续更新
        </div>
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          用一个真实系统，
          <br />
          把前端工程师托到全栈
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg text-ink-soft">
          从只会调接口，到能设计、实现、部署一整套系统。七个子项目，一套 API 契约，波次串行推进。
        </p>
        <div className="mt-7 flex items-center justify-center gap-4 text-sm text-ink-faint">
          {articlesPage?.pagination?.total !== undefined && (
            <span>已发布 {articlesPage.pagination.total} 篇</span>
          )}
          {categoryCount > 0 && <span>· {categoryCount} 个分类</span>}
          {tagCount > 0 && <span>· {tagCount} 个标签</span>}
        </div>
      </section>

      {/* 最新文章列表 */}
      <section className="mx-auto max-w-content px-6 pb-20">
        <div className="mb-8 border-b border-line pb-3 text-xs uppercase tracking-wider text-ink-faint">
          最新文章
        </div>

        {articles.length > 0 ? (
          <div className="divide-y divide-line">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-ink-faint">暂无文章</div>
        )}
      </section>
    </>
  )
}

export default Home
