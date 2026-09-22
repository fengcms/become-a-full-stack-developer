'use client'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { renderMarkdown } from '@/components/article/Markdown'
import { Failure, Skeleton } from '@/components/ui/Feedback'
import { readManuscript } from '@/lib/api/contributions'
import { statusLabel } from '@/lib/contribution-model'
import { useAuthStore } from '@/store/auth'
export function Preview({ id }: { id: number }) {
  const user = useAuthStore((s) => s.user)
  const valid = Number.isSafeInteger(id) && id > 0
  const query = useQuery({
    queryKey: ['manuscript', user?.id, id],
    queryFn: () => readManuscript(id),
    enabled: valid && !!user,
    retry: false,
  })
  if (!valid) return <p role="alert">文章地址无效</p>
  if (query.isPending) return <Skeleton />
  if (query.isError)
    return (
      <Failure
        message={query.error.message}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  const article = query.data
  if (article.authorId !== user?.id) return <p role="alert">只能预览自己的稿件。</p>
  return (
    <article className="writing-preview">
      <div className="writing-heading">
        <Link href="/member/articles">← 我的文章</Link>
        <Link className="sbutton" href={`/member/articles/${id}/edit`}>
          编辑文章
        </Link>
      </div>
      <p className="subtitle">私人预览 · {statusLabel[article.status]}</p>
      <h1>{article.title}</h1>
      <p className="subtitle">
        {article.authorName} · {article.categoryName || '未分类'}
      </p>
      {article.summary && <p className="intro">{article.summary}</p>}
      {article.coverImage && (
        <Image
          unoptimized
          width={880}
          height={495}
          className="writing-cover"
          src={article.coverImage}
          alt="文章封面"
        />
      )}
      {renderMarkdown(article.content).body}
    </article>
  )
}
