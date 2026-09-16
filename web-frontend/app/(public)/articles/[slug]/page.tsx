/**
 * @file app/(public)/articles/[slug]/page.tsx
 * @description 文章详情页：展示标题、分类、作者、日期、正文。
 *   ISR（revalidate: 5min）。正文用 react-markdown + rehype-highlight 渲染。
 * @module web-frontend/app/(public)/articles
 * @date 2026-09-16
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Markdown from '@/components/article/Markdown'
import TableOfContents from '@/components/article/TableOfContents'
import {
  type Article,
  type ArticleAdjacent,
  type ArticleRelatedItem,
  type CategoryBreadcrumbItem,
  getArticle,
  getArticleAdjacent,
  getArticleRelated,
  getCategoryBreadcrumb,
} from '@/lib/api'

/** 文章详情缓存策略：5 分钟重新验证。 */
export const revalidate = 300

interface ArticleDetailProps {
  params: Promise<{ slug: string }>
}

/** 动态 metadata：根据文章内容生成 title / description。 */
export const generateMetadata = async ({ params }: ArticleDetailProps): Promise<Metadata> => {
  const { slug } = await params
  const article = await getArticle(slug).catch(() => undefined)

  if (!article) {
    return { title: '文章不存在' }
  }

  return {
    title: article.title,
    description: article.summary || `${article.title} - 成为全栈开发工程师`,
    keywords: article.tags,
    openGraph: {
      title: article.title,
      description: article.summary || undefined,
      type: 'article',
      publishedTime: article.publishedAt || undefined,
      authors: article.authorName ? [article.authorName] : undefined,
    },
  }
}

/** 生成 JSON-LD 结构化数据（BlogPosting）。 */
const buildJsonLd = (article: Article): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: article.title,
  description: article.summary || undefined,
  datePublished: article.publishedAt || article.createdAt,
  dateModified: article.updatedAt || article.createdAt,
  author: article.authorName ? { '@type': 'Person', name: article.authorName } : undefined,
  keywords: article.tags?.join(', '),
  wordCount: article.content ? article.content.length : undefined,
})

/** 格式化日期为 YYYY-MM-DD。 */
const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const ArticleDetailPage = async ({ params }: ArticleDetailProps) => {
  const { slug } = await params

  let article: Article | undefined
  try {
    article = await getArticle(slug)
  } catch {
    article = undefined
  }

  if (!article) {
    notFound()
  }

  const date = formatDate(article.publishedAt || article.createdAt)

  // 并发拉取面包屑 + 上下篇 + 相关文章（后端专用接口）
  const [breadcrumb, adjacent, relatedArticles] = await Promise.all([
    article.categoryId
      ? getCategoryBreadcrumb(article.categoryId).catch<CategoryBreadcrumbItem[]>(() => [])
      : Promise.resolve([]),
    getArticleAdjacent(article.id).catch<ArticleAdjacent | null>(() => null),
    getArticleRelated(article.id, 4).catch<ArticleRelatedItem[]>(() => []),
  ])

  const prevArticle = adjacent?.prev ?? null
  const nextArticle = adjacent?.next ?? null

  const jsonLd = buildJsonLd(article)

  return (
    <article className="mx-auto max-w-content px-6 py-12">
      {/* JSON-LD 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 面包屑 */}
      <nav className="mb-8 text-sm text-ink-faint">
        <Link href="/" className="no-underline hover:text-accent">
          首页
        </Link>
        <span className="mx-2">/</span>
        <Link href="/articles" className="no-underline hover:text-accent">
          文章
        </Link>
        {breadcrumb.map((item) => (
          <span key={item.id}>
            <span className="mx-2">/</span>
            <Link href={`/categories/${item.slug}`} className="no-underline hover:text-accent">
              {item.name}
            </Link>
          </span>
        ))}
      </nav>

      {/* 标题区 */}
      <header className="mb-10">
        {article.categoryName && (
          <Link
            href={`/categories/${article.categoryId}`}
            className="text-xs font-semibold uppercase tracking-wider text-accent no-underline"
          >
            {article.categoryName}
          </Link>
        )}
        <h1 className="mt-3 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
          {article.title}
        </h1>
        <div className="mt-4 flex items-center gap-4 text-sm text-ink-faint">
          {article.authorName && article.authorId && (
            <Link href={`/members/${article.authorId}`} className="no-underline hover:text-accent">
              {article.authorName}
            </Link>
          )}
          {date && <time dateTime={date}>{date}</time>}
          {article.viewCount !== undefined && article.viewCount > 0 && (
            <span>{article.viewCount} 次阅读</span>
          )}
          {article.likeCount !== undefined && article.likeCount > 0 && (
            <span>{article.likeCount} 赞</span>
          )}
        </div>
        {article.tags && article.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tags/${tag}`}
                className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft no-underline transition-colors hover:border-accent hover:text-accent"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* 摘要 */}
      {article.summary && (
        <p className="mb-8 border-l-4 border-line pl-4 text-lg text-ink-soft">{article.summary}</p>
      )}

      {/* 目录 */}
      <TableOfContents content={article.content} />

      {/* 正文（Markdown 渲染） */}
      <Markdown content={article.content} />

      {/* 上一篇 / 下一篇 */}
      {(prevArticle || nextArticle) && (
        <nav className="mt-12 grid grid-cols-1 gap-4 border-t border-line pt-8 sm:grid-cols-2">
          {prevArticle ? (
            <Link
              href={
                prevArticle.slug ? `/articles/${prevArticle.slug}` : `/articles/${prevArticle.id}`
              }
              className="group rounded-lg border border-line p-4 no-underline transition-colors hover:border-accent"
            >
              <div className="text-xs text-ink-faint">← 上一篇</div>
              <div className="mt-1 text-sm font-medium text-ink group-hover:text-accent line-clamp-2">
                {prevArticle.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextArticle ? (
            <Link
              href={
                nextArticle.slug ? `/articles/${nextArticle.slug}` : `/articles/${nextArticle.id}`
              }
              className="group rounded-lg border border-line p-4 text-right no-underline transition-colors hover:border-accent"
            >
              <div className="text-xs text-ink-faint">下一篇 →</div>
              <div className="mt-1 text-sm font-medium text-ink group-hover:text-accent line-clamp-2">
                {nextArticle.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}

      {/* 相关文章 */}
      {relatedArticles.length > 0 && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">相关文章</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {relatedArticles.map((a) => (
              <Link
                key={a.id}
                href={a.slug ? `/articles/${a.slug}` : `/articles/${a.id}`}
                className="group rounded-lg border border-line p-4 no-underline transition-colors hover:border-accent"
              >
                <h3 className="text-base font-medium text-ink group-hover:text-accent line-clamp-2">
                  {a.title}
                </h3>
                {a.viewCount !== undefined && a.viewCount > 0 && (
                  <p className="mt-2 text-xs text-ink-faint">{a.viewCount} 次阅读</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

export default ArticleDetailPage
