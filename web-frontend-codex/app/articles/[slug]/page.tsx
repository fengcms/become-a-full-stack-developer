/** @file Full article reading experience with safe metadata and resilient auxiliary modules. */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Interactions } from '@/components/article/Interactions'
import { renderMarkdown } from '@/components/article/Markdown'
import { ReadingTracker } from '@/components/article/ReadingTracker'
import { Toc } from '@/components/article/Toc'
import { Comments } from '@/components/comment/Comments'
import { getArticle, getArticleAdjacent, getArticleRelated } from '@/lib/api/articles'
import { getCategoryBreadcrumb } from '@/lib/api/categories'
import { categories, tags } from '@/lib/public'
import { ApiError } from '@/lib/request/errors'
import { articleUrl, dateLabel, flattenCategories, jsonLd } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}
const load = cache(async (slug: string) =>
  getArticle(slug).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }),
)
/** Actual absence is distinct from transport errors, including in metadata generation. */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const a = await load((await params).slug)
  return {
    title: a.title,
    description: a.summary || undefined,
    alternates: { canonical: articleUrl(a) },
    openGraph: {
      title: a.title,
      description: a.summary || undefined,
      type: 'article',
      publishedTime: a.publishedAt || undefined,
      images: a.coverImage ? [a.coverImage] : undefined,
    },
  }
}
const Page = async ({ params }: Props) => {
  const article = await load((await params).slug)
  const [adjacent, related, tree, allTags, breadcrumb] = await Promise.all([
    getArticleAdjacent(article.id).catch(() => null),
    getArticleRelated(article.id, 4).catch(() => []),
    categories().catch(() => []),
    tags().catch(() => []),
    article.categoryId
      ? getCategoryBreadcrumb(article.categoryId).catch(() => [])
      : Promise.resolve([]),
  ])
  const category = flattenCategories(tree).find((c) => c.id === article.categoryId)
  const { body, headings } = renderMarkdown(article.content)
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: article.title,
            datePublished: article.publishedAt || undefined,
            dateModified: article.updatedAt,
            author: { '@type': 'Person', name: article.authorName || '作者' },
            description: article.summary || undefined,
          }),
        }}
      />
      <nav className="breadcrumb" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href="/articles">文章</Link>
        {breadcrumb.map((c) => (
          <span key={c.id}>
            {' '}
            / <Link href={`/categories/${c.slug}`}>{c.name}</Link>
          </span>
        ))}
      </nav>
      <header className="articlehead">
        {category && (
          <Link className="eyebrow" href={`/categories/${category.slug}`}>
            {category.name}
          </Link>
        )}
        <h1>{article.title}</h1>
        <div className="meta">
          <Link href={`/members/${article.authorId}`}>{article.authorName || '查看作者'}</Link>
          <time dateTime={article.publishedAt || undefined}>
            {dateLabel(article.publishedAt || article.createdAt)}
          </time>
          <span>{article.viewCount || 0} 次阅读</span>
          <span>{article.likeCount || 0} 人点赞</span>
        </div>
        <div>
          {article.tags?.map((name) => {
            const t = allTags.find((t) => t.name === name || t.slug === name)
            return t ? (
              <Link className="tag" key={name} href={`/tags/${t.slug}`}>
                {t.name}
              </Link>
            ) : (
              <span className="tag" key={name}>
                {name}
              </span>
            )
          })}
        </div>
      </header>
      <div className="columns articlecolumns">
        <div>
          {headings.length > 0 && (
            <details className="mobiletoc">
              <summary>本文目录 · {headings.length} 个章节 ▾</summary>
              <Toc headings={headings} />
            </details>
          )}
          {article.summary && <p className="hint">{article.summary}</p>}
          {body}
          <Interactions id={article.id} count={article.likeCount || 0} />
          {adjacent && (
            <nav className="adjacent" aria-label="相邻文章">
              {adjacent.prev ? (
                <Link href={articleUrl(adjacent.prev)}>
                  <small>← 上一篇</small>
                  {adjacent.prev.title}
                </Link>
              ) : (
                <span />
              )}
              {adjacent.next && (
                <Link href={articleUrl(adjacent.next)}>
                  <small>下一篇 →</small>
                  {adjacent.next.title}
                </Link>
              )}
            </nav>
          )}
          {related.length > 0 && (
            <section>
              <div className="sectionhead">
                <h2>继续阅读</h2>
              </div>
              {related.map((a) => (
                <div className="rank" key={a.id}>
                  <Link href={articleUrl(a)}>{a.title}</Link>
                </div>
              ))}
            </section>
          )}
          <Comments id={article.id} />
          <ReadingTracker id={article.id} />
        </div>
        <aside className="side">
          {headings.length > 0 && (
            <section className="box">
              <h3>本文目录</h3>
              <Toc headings={headings} />
            </section>
          )}
          <section className="box">
            <div className="authorrow">
              <div className="avatar">{article.authorName?.slice(0, 1) || '作'}</div>
              <h3>{article.authorName || '本文作者'}</h3>
            </div>
            <p className="muted">阅读作者的其他文章，继续深入了解。</p>
            <Link href={`/members/${article.authorId}`}>查看作者主页 →</Link>
          </section>
        </aside>
      </div>
    </>
  )
}
export default Page
