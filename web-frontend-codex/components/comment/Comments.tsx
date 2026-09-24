/** @file Paginated public comments and authenticated replies with moderation feedback. */
'use client'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Failure, Skeleton } from '@/components/ui/Feedback'
import { type Comment, type CommentPage, createComment, deleteComment } from '@/lib/api/comments'
import { commentThreads } from '@/lib/comment-threads'
import { request } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import { CommentThread } from './CommentThread'
/** Display only approved comments; rejected/reviewing writes receive explicit feedback. */
export const Comments = ({ id }: { id: number }) => <CommentSection key={id} id={id} />
const CommentSection = ({ id }: { id: number }) => {
  const user = useAuthStore((s) => s.user)
  const client = useQueryClient()
  const [posted, setPosted] = useState<Comment[]>([])
  const [content, setContent] = useState('')
  const [reply, setReply] = useState<{ id: number; name: string; excerpt: string } | null>(null)
  const [notice, setNotice] = useState('')
  const query = useInfiniteQuery({
    queryKey: ['comments', id],
    initialPageParam: 1,
    getNextPageParam: (last: CommentPage) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    queryFn: ({ pageParam }) =>
      request<CommentPage>(`/articles/${id}/comments`, {
        skipAuth: true,
        skipRefresh: true,
        query: { page: pageParam, pageSize: 20 },
      }),
  })
  const post = useMutation({
    mutationFn: () => createComment(id, { content: content.trim(), parentId: reply?.id }),
    onSuccess: (comment) => {
      if (comment.status === 'approved') setPosted((current) => [...current, comment])
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
      setPosted([])
      setReply(null)
      setNotice('评论已删除')
    },
    onError: (e) => setNotice(e.message),
  })
  const loaded = query.data?.pages.flatMap((page) => page.list) ?? []
  useEffect(() => {
    const confirmed = new Set(query.data?.pages.flatMap((page) => page.list.map((c) => c.id)))
    setPosted((current) => {
      const remaining = current.filter((c) => !confirmed.has(c.id))
      return remaining.length === current.length ? current : remaining
    })
  }, [query.data])
  const loadedIds = new Set(loaded.map((comment) => comment.id))
  const fresh = query.hasNextPage ? posted.filter((comment) => !loadedIds.has(comment.id)) : []
  const threads = commentThreads([...loaded, ...fresh])
  return (
    <section id="comments">
      <div className="sectionhead">
        <h2>评论 {query.data?.pages[0]?.pagination.total ?? ''}</h2>
        <span className="muted">友善交流，分享思考</span>
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          if (user && content.trim() && !post.isPending) post.mutate()
        }}
      >
        {reply && (
          <p className="hint">
            回复 {reply.name}
            <span className="reply-excerpt">{reply.excerpt}</span>{' '}
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
          disabled={post.isPending}
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
      ) : query.isError && !query.data ? (
        <Failure
          retry={() => {
            void query.refetch()
          }}
        />
      ) : threads.length ? (
        threads.map((node) => (
          <CommentThread
            key={node.comment.id}
            node={node}
            revealId={posted.at(-1)?.id}
            userId={user?.id}
            deleting={remove.isPending}
            onReply={(replyId, name, excerpt) => {
              setReply({ id: replyId, name, excerpt })
              document.getElementById('comment-content')?.focus()
            }}
            onDelete={(commentId) => remove.mutate(commentId)}
          />
        ))
      ) : (
        <p className="formnote">还没有评论，分享你的第一个想法吧。</p>
      )}
      {query.hasNextPage && (
        <div className="pager">
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => {
              void query.fetchNextPage()
            }}
          >
            {query.isFetching ? '正在加载…' : '加载更多评论与回复'}
          </button>
        </div>
      )}
      {query.isFetchNextPageError && (
        <p role="alert" className="hint">
          后续评论加载失败，已加载内容仍保留，请重试。
        </p>
      )}
    </section>
  )
}
