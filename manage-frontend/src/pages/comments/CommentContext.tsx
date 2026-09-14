/**
 * @file pages/comments/CommentContext.tsx
 * @description 审核/回复时按需展示文章名称，不在列表中逐行发请求。
 */
import { Link } from 'react-router-dom'
import { useArticle } from '@/hooks/useArticles'
/** 打开弹窗时才挂载，详情失败仍保留编号与评论正文。 */
export const CommentContext = ({
  articleId,
  parentId,
}: {
  articleId: number
  parentId?: number | null
}) => {
  const article = useArticle(articleId)
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>
        所属文章：
        <Link className="underline" to={`/articles/${articleId}/preview`}>
          {article.data?.title ?? `文章 #${articleId}`}
        </Link>
      </p>
      {parentId && <p>这是一条对评论 #{parentId} 的回复</p>}
    </div>
  )
}
