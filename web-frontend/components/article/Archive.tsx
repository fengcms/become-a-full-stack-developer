/** @file Shared archive content retains category-specific labels and URL filters. */
import Link from 'next/link'
import { Pagination } from '@/components/layout/Pagination'
import { Sidebar } from '@/components/layout/Sidebar'
import { Empty } from '@/components/ui/Feedback'
import { listArticles } from '@/lib/api/articles'
import { categories } from '@/lib/public'
import { type Category, pageNumber } from '@/lib/utils'
import { ArticleCard } from './ArticleCard'
export type ArchiveParams = { page?: string; sort?: string; category?: string }
/** Public archives retain SSR pagination rather than depending on infinite scrolling. */
export const Archive = async ({
  title,
  description,
  path,
  params,
  category,
  tag,
  subcategories = [],
}: {
  title: string
  description?: string | null
  path: string
  params: ArchiveParams
  category?: string
  tag?: string
  subcategories?: Category[]
}) => {
  const tree = await categories()
  const selectedCategory = category || params.category
  const sort = params.sort === '-viewCount' ? '-viewCount' : '-publishedAt'
  const page = await listArticles({
    page: pageNumber(params.page),
    pageSize: 10,
    sort,
    category: selectedCategory,
    tag,
  })
  const q: Record<string, string> = {
    sort,
    ...(path === '/articles' && selectedCategory ? { category: selectedCategory } : {}),
  }
  const url = (extra: Record<string, string>) =>
    `${path}?${new URLSearchParams({ ...q, ...extra })}`
  const tabs = category ? subcategories : tree
  return (
    <>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>{title}</span>
      </div>
      <div className="intro">
        <span className="eyebrow">{page.pagination.total} 篇文章</span>
        <h1>{title}</h1>
        <p>{description || '从实践出发，发现值得深入阅读的内容。'}</p>
      </div>
      <div className="columns">
        <section>
          {!tag && (
            <div className="filterline">
              <span className="muted">{category ? '子栏目' : '分类'}</span>
              <Link className={!params.category ? 'tag' : ''} href={path}>
                全部
              </Link>
              {tabs.map((c) => (
                <Link
                  className="tag"
                  href={category ? `/categories/${c.slug}` : url({ category: c.slug || '' })}
                  key={c.id || c.slug}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
          <nav className="tabs" aria-label="排序">
            <Link
              href={url({ sort: '-publishedAt' })}
              className={sort === '-publishedAt' ? 'selected' : ''}
            >
              最新发布
            </Link>
            <Link
              href={url({ sort: '-viewCount' })}
              className={sort === '-viewCount' ? 'selected' : ''}
            >
              最多阅读
            </Link>
          </nav>
          {page.list.length ? (
            page.list.map((a) => <ArticleCard key={a.id} article={a} categories={tree} />)
          ) : (
            <Empty
              title={page.pagination.total ? '这一页没有文章' : '暂无文章'}
              message="你可以尝试其他分类，或回到文章列表。"
            />
          )}
          <Pagination
            page={page.pagination.page}
            totalPages={page.pagination.totalPages}
            path={path}
            query={q}
          />
        </section>
        <Sidebar />
      </div>
    </>
  )
}
