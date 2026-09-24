/** @file Real notification lists, unread filters, and synchronized read state. */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Empty, Failure, Skeleton } from '@/components/ui/Feedback'
import {
  getMyNotifications,
  getUnreadCount,
  readAllNotifications,
  updateNotification,
} from '@/lib/api/me'
import { dateLabel, safeLink } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
/** Never invent notification types or links; display only contract-provided fields. */
export const Notifications = () => {
  const user = useAuthStore((s) => s.user)
  const client = useQueryClient()
  const [unread, setUnread] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['notifications', user?.id, unread, page],
    queryFn: () => getMyNotifications({ page, pageSize: 10, ...(unread ? { isRead: false } : {}) }),
    enabled: !!user,
  })
  const count = useQuery({
    queryKey: ['unread', user?.id],
    queryFn: getUnreadCount,
    enabled: !!user,
  })
  const mutation = useMutation({
    mutationFn: async (input: { id?: number; link?: string }) => {
      if (input.id) await updateNotification(input.id, true)
      else await readAllNotifications()
      return input.link
    },
    onSuccess: (link) => {
      void client.invalidateQueries({ queryKey: ['notifications'] })
      void client.invalidateQueries({ queryKey: ['unread'] })
      if (unread && !mutation.variables?.id) setPage(1)
      else if (page > 1 && query.data?.list.length === 1) setPage(page - 1)
      if (link) window.location.assign(link)
    },
    onError: (e) => setError(e.message),
  })
  return (
    <>
      <div className="intro">
        <h1>通知中心</h1>
        <p>评论与账号相关消息，都在这里。</p>
      </div>
      <div className="sectionhead">
        <div className="tabs">
          <button
            className={!unread ? 'selected' : ''}
            type="button"
            onClick={() => {
              setUnread(false)
              setPage(1)
            }}
          >
            全部通知
          </button>
          <button
            className={unread ? 'selected' : ''}
            type="button"
            onClick={() => {
              setUnread(true)
              setPage(1)
            }}
          >
            未读 {count.data?.count ?? ''}
          </button>
        </div>
        <button
          className="textbutton"
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({})}
        >
          全部标为已读
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
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
      ) : !query.data.list.length ? (
        <Empty title={unread ? '没有未读通知' : '暂时没有通知'} message="新的消息会出现在这里。" />
      ) : (
        <>
          {query.data.list.map((n) => (
            <article className={`notice ${!n.isRead ? 'notification-unread' : ''}`} key={n.id}>
              <div className="noticeicon">
                {n.type === 'article_published'
                  ? '文'
                  : n.type === 'comment_approved'
                    ? '评'
                    : '信'}
              </div>
              <div>
                <h3>
                  {n.title}
                  {!n.isRead && <span className="status">未读</span>}
                </h3>
                {n.body && <p>{n.body}</p>}
                <div className="meta">{dateLabel(n.createdAt)}</div>
                {(!n.isRead || safeLink(n.link)) && (
                  <button
                    className="textbutton"
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: n.id, link: safeLink(n.link) })}
                  >
                    {safeLink(n.link) ? '查看详情 →' : '标为已读'}
                  </button>
                )}
              </div>
            </article>
          ))}
          {query.data.pagination.totalPages > 1 && (
            <nav className="pager" aria-label="通知分页">
              <button disabled={page === 1} type="button" onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span>
                {page} / {query.data.pagination.totalPages}
              </span>
              <button
                disabled={page >= query.data.pagination.totalPages}
                type="button"
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </nav>
          )}
        </>
      )}
    </>
  )
}
