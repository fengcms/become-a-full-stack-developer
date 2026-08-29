/**
 * @file src/hooks/useNotifications.ts
 * @description 通知数据层（Member）。列表、未读计数（轻轮询）、全部已读、单条已读。
 *   未读红点由 Topbar 用 useUnreadCount 配合 refetchInterval 驱动（非 WebSocket）。
 *   标记已读 / 全部已读后失效通知列表 + 未读计数，红点即时回落。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getUnreadCount,
  listMyNotifications,
  markNotificationRead,
  type NotificationQuery,
  readAllNotifications,
} from '@/api/notify'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'

/** 通知列表（GET /me/notifications，分页 + isRead 可选筛选）。 */
export const useNotifications = (query: NotificationQuery = {}) =>
  useQuery({ queryKey: qk.notifications.list(query), queryFn: () => listMyNotifications(query) })

/**
 * 未读计数（GET /me/notifications/unread-count）。
 * 轻轮询：默认 60s 拉一次（staleTime 同源，window focus 不刷避免抖动）。
 * @param enabled - 是否启用（默认 true；未登录可传 false）。
 */
export const useUnreadCount = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications.unreadCount,
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: 60_000,
    staleTime: 60_000,
  })

/** 全部已读 / 单条已读：写后失效列表 + 未读计数。 */
export const useNotificationActions = () => {
  const qc = useQueryClient()
  const toast = useToast()

  /** 失效通知相关缓存（列表 + 未读计数）。 */
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  /** 全部标记为已读。POST /me/notifications/read-all */
  const readAll = useMutation({
    mutationFn: () => readAllNotifications(),
    onSuccess: () => {
      invalidate()
      toast.success('已全部标记为已读')
    },
    onError: (e) => toast.error(e, '操作失败'),
  })

  /** 标记单条已读。PATCH /me/notifications/{id} */
  const markRead = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e, '标记失败'),
  })

  return { readAll, markRead }
}
