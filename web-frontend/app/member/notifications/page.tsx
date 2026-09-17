/**
 * @file app/member/notifications/page.tsx
 * @description 通知中心：通知列表（已读/未读筛选）+ 全部已读 + 单条已读。
 *   客户端组件：鉴权请求 + 交互。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  getMyNotifications,
  getUnreadCount,
  type NotificationPage,
  readAllNotifications,
  updateNotification,
} from '@/lib/api/me'

const PAGE_SIZE = 20

/** 通知类型标签。 */
const TYPE_LABEL: Record<string, string> = {
  article_published: '文章发布',
  comment_approved: '评论通过',
  system: '系统',
}

/** 格式化日期时间。 */
const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const NotificationsPage = () => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<NotificationPage | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number, f: 'all' | 'unread') => {
    setLoading(true)
    try {
      const result = await getMyNotifications({
        page: p,
        pageSize: PAGE_SIZE,
        isRead: f === 'unread' ? false : undefined,
      })
      setData(result)
    } catch {
      setData({ list: [], pagination: { page: p, pageSize: PAGE_SIZE, total: 0, totalPages: 0 } })
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await getUnreadCount()
      setUnreadCount(count)
    } catch {
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    load(page, filter)
    refreshUnread()
  }, [page, filter, load, refreshUnread])

  const handleReadAll = async () => {
    try {
      await readAllNotifications()
      load(page, filter)
      refreshUnread()
    } catch {
      // 忽略错误
    }
  }

  const handleToggleRead = async (id: number, current: boolean) => {
    try {
      await updateNotification(id, !current)
      load(page, filter)
      refreshUnread()
    } catch {
      // 忽略错误
    }
  }

  const list = data?.list ?? []
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          通知
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={handleReadAll}
          className="rounded border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          全部已读
        </button>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setFilter('all')
            setPage(1)
          }}
          className={`rounded px-3 py-1 ${
            filter === 'all' ? 'bg-accent text-surface' : 'text-ink-soft hover:bg-hover'
          }`}
        >
          全部
        </button>
        <button
          type="button"
          onClick={() => {
            setFilter('unread')
            setPage(1)
          }}
          className={`rounded px-3 py-1 ${
            filter === 'unread' ? 'bg-accent text-surface' : 'text-ink-soft hover:bg-hover'
          }`}
        >
          未读
        </button>
      </div>

      {loading ? (
        <p className="text-ink-faint">加载中…</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">暂无通知</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 py-4 ${!n.isRead ? 'bg-hover/30' : ''}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-hover px-1.5 py-0.5 text-xs text-ink-soft">
                    {TYPE_LABEL[n.type] ?? n.type}
                  </span>
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-accent" />}
                </div>
                <p className="mt-1 font-medium text-ink">{n.title}</p>
                {n.body && <p className="mt-1 text-sm text-ink-soft">{n.body}</p>}
                <p className="mt-1 text-xs text-ink-faint">{formatDateTime(n.createdAt)}</p>
              </div>
              <div className="flex flex-col gap-2">
                {n.link && (
                  <Link href={n.link} className="text-xs text-accent no-underline hover:underline">
                    查看
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleRead(n.id, n.isRead)}
                  className="text-xs text-ink-faint hover:text-accent"
                >
                  {n.isRead ? '标为未读' : '标为已读'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-2 text-sm text-ink-faint">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-accent disabled:opacity-40"
          >
            下一页
          </button>
        </nav>
      )}
    </div>
  )
}

export default NotificationsPage
