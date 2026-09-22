/** @file Paginated public comments and authenticated replies with moderation feedback. */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Failure, Skeleton } from '@/components/ui/Feedback'
import { type CommentPage, createComment, deleteComment } from '@/lib/api/comments'
import { request } from '@/lib/request'
import { dateLabel } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
/** Display only approved comments; rejected/reviewing writes receive explicit feedback. */
export const Comments = ({ id }: { id: number }) => {
  const user = useAuthStore((s) => s.user)
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [content, setContent] = useState('')
  const [reply, setReply] = useState<{ id: number; name: string } | null>(null)
  const [notice, setNotice] = useState('')
  const query = useQuery({
    queryKey: ['comments', id, page],
    queryFn: () =>
      request<CommentPage>(`/articles/${id}/comments`, {
        skipAuth: true,
        skipRefresh: true,
        query: { page, pageSize: 20 },
      }),
  })
  const post = useMutation({
    mutationFn: () => createComment(id, { content: content.trim(), parentId: reply?.id }),
    onSuccess: (comment) => {
      setContent('')
      setReply(null)
      setNotice(
        comment.status === 'approved'
          ? '评论已发布'
          : comment.status === 'reviewing'
            ? '评论已提交，等待审核'
            : `评论未通过审核${comment.rejectedReason ? `：${comment.rejectedReason}` : ''}`,
      )
      void client.invalidateQueries({ queryKey: ['comments', id] })
    },
    onError: (e) => setNotice(e.message),
  })
  const remove = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['comments', id] })
      setNotice('评论已删除')
    },
    onError: (e) => setNotice(e.message),
  })
  return (
    <section id="comments">
      <div className="sectionhead">
        <h2>评论 {query.data?.pagination.total ?? ''}</h2>
        <span className="muted">友善交流，分享思考</span>
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          if (content.trim()) post.mutate()
        }}
      >
        {reply && (
          <p className="hint">
            回复 {reply.name}{' '}
            <button className="textbutton" type="button" onClick={() => setReply(null)}>
              取消回复
            </button>
          </p>
        )}
        <label className="sr-only" htmlFor="comment-content">
          评论内容
        </label>
        <textarea
          id="comment-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          maxLength={2000}
          placeholder="写下你的想法，与作者交流……"
        />
        <div className="end">
          <small className="muted">{content.length} / 2000</small>
          {user ? (
            <button className="pbutton" type="submit" disabled={post.isPending || !content.trim()}>
              {post.isPending ? '正在发布…' : '发布评论'}
            </button>
          ) : (
            <Link className="pbutton" href={`/login?redirect=/articles/${id}%23comments`}>
              登录后评论
            </Link>
          )}
        </div>
      </form>
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <Skeleton />
      ) : query.isError ? (
        <Failure
          retry={() => {
            void query.refetch()
          }}
        />
      ) : query.data.list.length ? (
        query.data.list.map((c) => (
          <article className="comment" key={c.id}>
            <div className="avatar">{c.userName?.slice(0, 1) || '读'}</div>
            <div className="grow">
              <strong>{c.userName || '读者'}</strong>
              <div className="meta">
                {dateLabel(c.createdAt)}
                {c.parentId && <span>回复 #{c.parentId}</span>}
              </div>
              <p className="comment-body">{c.content}</p>
              <div className="comment-actions">
                <button
                  className="textbutton"
                  type="button"
                  onClick={() => {
                    setReply({ id: c.id, name: c.userName || '读者' })
                    document.getElementById('comment-content')?.focus()
                  }}
                >
                  回复
                </button>
                {user?.id === c.userId && (
                  <button
                    className="textbutton"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm('删除这条评论？')) remove.mutate(c.id)
                    }}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          </article>
        ))
      ) : (
        <p className="formnote">还没有评论，分享你的第一个想法吧。</p>
      )}
      {query.data && query.data.pagination.totalPages > 1 && (
        <nav className="pager" aria-label="评论分页">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            {page} / {query.data.pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= query.data.pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </nav>
      )}
    </section>
  )
}
