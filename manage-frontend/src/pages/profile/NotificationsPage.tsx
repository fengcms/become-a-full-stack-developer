/**
 * @file src/pages/profile/NotificationsPage.tsx
 * @description 我的通知（member）。GET /me/notifications 列表（分页），「全部已读」一键清，
 *   单条点击标记已读并跳 link。未读红点由 Topbar 的 useUnreadCount 驱动，本页读操作后即时回落。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TablePagination } from '@/components/data/TablePagination'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNotificationActions, useNotifications } from '@/hooks/useNotifications'
import { isApiError } from '@/lib/request'
import type { Notification } from '@/types/common'

/** 通知类型中文标签。 */
const TYPE_LABEL: Record<Notification['type'], string> = {
  article_published: '文章发布',
  comment_approved: '评论审核',
  system: '系统',
}

/** 单条通知行。 */
const NotificationRow = ({ n, onRead }: { n: Notification; onRead: (id: number) => void }) => {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        if (!n.isRead) onRead(n.id)
        if (n.link) navigate(n.link)
      }}
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted ${
        n.isRead ? 'opacity-70' : 'bg-primary/5'
      }`}
    >
      <span className="mt-0.5 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {TYPE_LABEL[n.type]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{n.title}</span>
          {!n.isRead ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
        </div>
        {n.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {format(new Date(n.createdAt), 'yyyy-MM-dd HH:mm')}
        </p>
      </div>
    </button>
  )
}

/** 通知页。 */
const NotificationsPage = () => {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error, refetch } = useNotifications({ page, pageSize: 10 })
  const { readAll, markRead } = useNotificationActions()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>通知</CardTitle>
        <Button
          variant="outline"
          size="sm"
          disabled={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          全部已读
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : isError ? (
          <QueryErrorState
            description={isApiError(error) ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : data && data.list.length > 0 ? (
          <>
            <div className="space-y-2">
              {data.list.map((n) => (
                <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
              ))}
            </div>
            <TablePagination
              page={data.pagination.page}
              pageSize={data.pagination.pageSize}
              total={data.pagination.total}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">暂无通知</p>
        )}
      </CardContent>
    </Card>
  )
}

export default NotificationsPage
