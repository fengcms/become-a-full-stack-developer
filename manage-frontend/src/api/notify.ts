/**
 * @file src/api/notify.ts
 * @description 通知接口（Member 组，登录即可用）。
 *
 * 端点对齐冻结契约 openapi.v1.yaml v1.11.0：
 *   - 列表       GET  /me/notifications         → NotificationPage（list + pagination，按创建时间倒序；isRead 可选筛选）
 *   - 未读计数   GET  /me/notifications/unread-count → { count: number }（顶栏红点轮询用）
 *   - 全部已读   POST /me/notifications/read-all
 *   - 单条已读   PATCH /me/notifications/{id}    → body { isRead: true }（x-authz ownerOverride：仅本人通知可操作）
 *
 * 未读红点由 Topbar 用 getUnreadCount + refetchInterval 轻轮询驱动（非 WebSocket）。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { Notification, NotificationPage } from '@/types/common'

/** 通知列表查询入参。 */
export type NotificationQuery = { isRead?: boolean; page?: number; pageSize?: number }

/** 未读计数响应（data 形状）。 */
export type UnreadCount = { count: number }

/**
 * 我的通知列表。GET /me/notifications（member）
 * @param query - 筛选（isRead 可选）+ 分页。
 * @returns 分页通知（NotificationPage）。
 */
export const listMyNotifications = (query: NotificationQuery = {}): Promise<NotificationPage> =>
  http.get<NotificationPage>('/me/notifications', { query })

/**
 * 未读通知数。GET /me/notifications/unread-count（member）
 * @returns `{ count }`。
 */
export const getUnreadCount = (): Promise<UnreadCount> =>
  http.get<UnreadCount>('/me/notifications/unread-count')

/**
 * 全部标记为已读。POST /me/notifications/read-all（member）
 */
export const readAllNotifications = (): Promise<unknown> =>
  http.post<unknown>('/me/notifications/read-all')

/**
 * 标记单条已读。PATCH /me/notifications/{id}（member，ownerOverride）
 * @param id - 通知 id。
 */
export const markNotificationRead = (id: number): Promise<Notification> =>
  http.patch<Notification>(`/me/notifications/${id}`, { isRead: true })
