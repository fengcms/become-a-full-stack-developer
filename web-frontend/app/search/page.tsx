/** @file Full-text article/member search; uses q rather than archive keyword filtering. */
import Link from 'next/link'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Pagination } from '@/components/layout/Pagination'
import { Sidebar } from '@/components/layout/Sidebar'
import { Empty } from '@/components/ui/Feedback'
import { search } from '@/lib/api/search'
import { categories } from '@/lib/public'
import { pageNumber } from '@/lib/utils'
export const metadata = { title: '搜索', robots: { index: false, follow: true } }
const Page = async ({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}) => {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const type = sp.type === 'member' ? 'member' : 'article'
  const response = q ? await search({ q, type, page: pageNumber(sp.page) }) : null
  const result = type === 'article' ? response?.articles : response?.members
  const tree = await categories().catch(() => [])
  return (
    <>
      <div className="intro">
        <h1>搜索</h1>
        <p>找到需要的内容，再继续深入。</p>
      </div>
      <form className="bigsearch" action="/search">
        <input
          aria-label="关键词"
          name="q"
          defaultValue={q}
          placeholder="搜索文章或会员"
          required
        />
        <input type="hidden" name="type" value={type} />
        <button className="pbutton" type="submit">
          搜索
        </button>
      </form>
      <nav className="tabs" aria-label="搜索类型">
        {(['article', 'member'] as const).map((t) => (
          <Link
            key={t}
            className={type === t ? 'selected' : ''}
            href={`/search?${new URLSearchParams({ q, type: t })}`}
          >
            {t === 'article' ? '文章' : '会员'}
          </Link>
        ))}
      </nav>
      <div className="columns">
        <section>
          {!q ? (
            <Empty
              title="你想了解什么？"
              message="输入一个关键词，查找相关文章或作者。"
              href="/categories"
              action="浏览分类"
            />
          ) : (
            <>
              <p className="subtitle">
                “{q}”的搜索结果 · {result?.pagination.total || 0} 条
              </p>
              {result?.list.length ? (
                result.list.map((item) =>
                  'title' in item ? (
                    <ArticleCard key={item.id} article={item} categories={tree} />
                  ) : (
                    <div className="authorrow" key={item.id}>
                      <div className="avatar">{item.nickname?.slice(0, 1) || '读'}</div>
                      <div className="grow">
                        <h3>
                          <Link href={`/members/${item.id}`}>{item.nickname}</Link>
                        </h3>
                        <p className="muted">{item.articleCount} 篇公开文章</p>
                      </div>
                      <Link href={`/members/${item.id}`}>查看主页 →</Link>
                    </div>
                  ),
                )
              ) : (
                <Empty
                  title="没有找到相关内容"
                  message="试试更简短的关键词，或从分类中查找。"
                  href="/categories"
                  action="浏览分类"
                />
              )}
              {result && (
                <Pagination
                  page={result.pagination.page}
                  totalPages={result.pagination.totalPages}
                  path="/search"
                  query={{ q, type }}
                />
              )}
            </>
          )}
        </section>
        <Sidebar />
      </div>
    </>
  )
}
export default Page
