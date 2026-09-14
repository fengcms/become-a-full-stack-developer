/**
 * @file pages/articles/ArticlePreviewPage.tsx
 * @description 后台只读阅读入口；使用已有文章详情接口，不进入编辑表单。
 */
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useArticle } from '@/hooks/useArticles'

/** 阅读入口在后台内可用，接口仍负责未公开内容的访问控制。 */
const ArticlePreviewPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const article = useArticle(Number(id))
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
    return <QueryErrorState title="文章地址无效" />
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button
        variant="outline"
        onClick={() => (location.key === 'default' ? navigate('/articles') : navigate(-1))}
      >
        返回
      </Button>
      {article.isPending ? (
        <p role="status">正在加载文章…</p>
      ) : article.isError ? (
        <QueryErrorState
          title="文章暂不可读"
          description="文章可能已下架、删除，或当前账号无权查看。"
          onRetry={() => article.refetch()}
        />
      ) : (
        article.data && (
          <>
            <PageHeader
              title={article.data.title}
              description={article.data.summary ?? undefined}
            />
            <MarkdownEditor value={article.data.content} onChange={() => {}} disabled />
          </>
        )
      )}
    </div>
  )
}
export default ArticlePreviewPage
