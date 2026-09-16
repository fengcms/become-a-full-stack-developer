/**
 * @file app/(public)/articles/[slug]/page.tsx
 * @description 文章详情页：展示标题、分类、作者、日期、正文。
 *   ISR（revalidate: 5min）。Markdown 渲染在 Phase 3.5 完善，当前先纯文本展示正文。
 * @module web-frontend/app/(public)/articles
 * @date 2026-09-16
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { type Article, getArticle } from '@/lib/api'

/** 文章详情缓存策略：5 分钟重新验证。 */
export const revalidate = 300

interface ArticleDetailProps {
  params: Promise<{ slug: string }>
}

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

  return (
    <article className="mx-auto max-w-content px-6 py-12">
      {/* 面包屑 */}
      <nav className="mb-8 text-sm text-ink-faint">
        <Link href="/" className="no-underline hover:text-accent">
          首页
        </Link>
        <span className="mx-2">/</span>
        <Link href="/articles" className="no-underline hover:text-accent">
          文章
        </Link>
        {article.categoryName && (
          <>
            <span className="mx-2">/</span>
            <span>{article.categoryName}</span>
          </>
        )}
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
          {article.authorName && <span>{article.authorName}</span>}
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

      {/* 正文（Phase 3.5 将替换为 Markdown 渲染） */}
      <div className="whitespace-pre-wrap text-base leading-relaxed text-ink">
        {article.content}
      </div>
    </article>
  )
}

export default ArticleDetailPage
