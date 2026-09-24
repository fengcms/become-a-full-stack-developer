/** @file Approved A-style article row, with genuine category and author links. */
import Link from 'next/link'
import { Picture } from '@/components/ui/Picture'
import {
  type ArticleSummary,
  articleUrl,
  type Category,
  dateLabel,
  flattenCategories,
} from '@/lib/utils'
/** Missing covers produce a clean text-only row instead of repetitive mock artwork. */
export const ArticleCard = ({
  article,
  categories = [],
  action,
  meta,
  status = false,
}: {
  article: ArticleSummary
  categories?: Category[]
  action?: React.ReactNode
  meta?: string
  status?: boolean
}) => {
  const category = flattenCategories(categories).find((item) => item.id === article.categoryId)
  return (
    <article className={`entry ${!article.coverImage ? 'without-image' : ''}`}>
      {article.coverImage && status && article.status !== 'published' ? (
        <Picture src={article.coverImage} alt="" />
      ) : (
        article.coverImage && (
          <Link href={articleUrl(article)} aria-label={article.title}>
            <Picture src={article.coverImage} alt="" />
          </Link>
        )
      )}
      <div className="entrybody">
        <h3>
          {status && article.status !== 'published' ? (
            <span>{article.title}</span>
          ) : (
            <Link href={articleUrl(article)}>{article.title}</Link>
          )}
          {status && (
            <span
              className={`status ${article.status === 'pending' ? 'pending' : article.status === 'draft' ? 'draft' : ''}`}
            >
              {article.status === 'published'
                ? '已发布'
                : article.status === 'pending'
                  ? '待审核'
                  : '草稿'}
            </span>
          )}
        </h3>
        {article.summary && <p>{article.summary}</p>}
        <div className="meta">
          {meta ? (
            <span>{meta}</span>
          ) : (
            <>
              <Link href={`/members/${article.authorId}`}>{article.authorName || '查看作者'}</Link>
              <time dateTime={article.publishedAt || article.createdAt || undefined}>
                {dateLabel(article.publishedAt || article.createdAt)}
              </time>
            </>
          )}
          {category?.slug ? (
            <Link href={`/categories/${category.slug}`}>{category.name}</Link>
          ) : (
            article.categoryName && <span>{article.categoryName}</span>
          )}
          {article.viewCount !== undefined && (
            <span>{article.viewCount.toLocaleString('zh-CN')} 阅读</span>
          )}
        </div>
      </div>
      {action && <div className="entryaction">{action}</div>}
    </article>
  )
}
