/**
 * @file components/article/ArticleCard.tsx
 * @description 文章卡片：列表/首页复用。展示分类、标题、摘要、日期、阅读量。
 *   极简编辑风：无卡片边框，靠分割线与留白区分。
 * @module web-frontend/components/article
 * @date 2026-09-16
 */

import Link from 'next/link'
import type { ArticleSummary } from '@/lib/api'

interface ArticleCardProps {
  article: ArticleSummary
}

/** 格式化日期为 YYYY-MM-DD。 */
const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/**
 * 文章卡片组件。
 *
 * @param article - 文章摘要数据。
 */
const ArticleCard = ({ article }: ArticleCardProps) => {
  const href = article.slug ? `/articles/${article.slug}` : `/articles/${article.id}`
  const date = formatDate(article.publishedAt || article.createdAt)

  return (
    <article className="py-8">
      {article.categoryName && (
        <Link
          href={`/categories/${article.categoryId}`}
          className="text-xs font-semibold uppercase tracking-wider text-accent no-underline"
        >
          {article.categoryName}
        </Link>
      )}
      <h2 className="mt-2 text-2xl leading-snug tracking-tight">
        <Link href={href} className="text-ink no-underline transition-colors hover:text-accent">
          {article.title}
        </Link>
      </h2>
      {article.summary && <p className="mt-3 text-base text-ink-soft">{article.summary}</p>}
      <div className="mt-4 flex items-center gap-3 text-sm text-ink-faint">
        {date && <time dateTime={date}>{date}</time>}
        {article.viewCount !== undefined && article.viewCount > 0 && (
          <>
            <span className="h-1 w-1 rounded-full bg-ink-faint" />
            <span>{article.viewCount} 次阅读</span>
          </>
        )}
      </div>
    </article>
  )
}

export default ArticleCard
