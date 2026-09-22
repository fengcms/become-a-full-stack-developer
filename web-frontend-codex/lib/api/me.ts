/**
 * @file lib/api/me.ts
 * @description 会员中心端点（需鉴权）。走 lib/request 内核，带 access token。
 *   个人资料、修改密码、收藏、阅读历史、我的文章、我的点赞。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { request } from '@/lib/request'
import type { components } from '@/types/api.gen'

/** 当前用户资料。 */
export type User = components['schemas']['User']
/** 更新资料入参。 */
export type ProfileUpdateRequest = components['schemas']['ProfileUpdateRequest']
/** 修改密码入参。 */
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest']
/** 文章摘要。 */
export type ArticleSummary = components['schemas']['ArticleSummary']
/** 阅读历史项。 */
export type ReadingHistoryItem = components['schemas']['ReadingHistoryItem']
/** 分页。 */
export type Pagination = components['schemas']['Pagination']
/** 历史分页。 */
export type HistoryPage = components['schemas']['HistoryPage']
/** 文章分页。 */
export type ArticlePage = components['schemas']['ArticlePage']
/** 通知。 */
export type Notification = components['schemas']['Notification']
/** 通知分页。 */
export type NotificationPage = components['schemas']['NotificationPage']

/** 列表查询参数。 */
type ListQuery = Record<string, string | number | boolean | null | undefined>

/**
 * 获取当前用户资料。
 */
export const getMeProfile = (): Promise<User> => request<User>('/me/profile')

/**
 * 更新当前用户资料。
 *
 * @param data - 可更新字段（nickname/avatar/email）。
 */
export const updateMeProfile = (data: ProfileUpdateRequest): Promise<User> =>
  request<User>('/me/profile', { method: 'PATCH', body: data })

/**
 * 修改密码。
 *
 * @param data - oldPassword + newPassword。
 */
export const changePassword = (data: ChangePasswordRequest): Promise<void> =>
  request<void>('/me/change-password', { method: 'POST', body: data })

/**
 * 我的收藏列表（分页）。
 */
export const getMyFavorites = (q?: ListQuery): Promise<ArticlePage> =>
  request<ArticlePage>('/me/favorites', { query: q })

/**
 * 取消收藏。
 *
 * @param articleId - 文章 id。
 */
export const removeFavorite = (articleId: number): Promise<void> =>
  request<void>(`/me/favorites/${articleId}`, { method: 'DELETE' })

/**
 * 添加收藏（幂等：重复收藏返回 200）。
 *
 * @param articleId - 文章 id。
 */
export const addFavorite = (articleId: number): Promise<void> =>
  request<void>('/me/favorites', { method: 'POST', body: { articleId } })

/**
 * 我的阅读历史。
 */
export const getMyHistory = (q?: ListQuery): Promise<HistoryPage> =>
  request<HistoryPage>('/me/history', { query: q })

/**
 * 删除单条阅读历史。
 *
 * @param articleId - 文章 id。
 */
export const removeHistoryItem = (articleId: number): Promise<void> =>
  request<void>(`/me/history/${articleId}`, { method: 'DELETE' })

/**
 * 上报阅读进度（写入/更新 ReadingLog）。
 *
 * @param articleId - 文章 id。
 * @param progress - 阅读进度百分比 0-100，可选。
 */
export const reportReadingProgress = (articleId: number, progress?: number): Promise<void> =>
  request<void>('/me/history', { method: 'POST', body: { articleId, progress } })

/**
 * 我的文章（含全部状态）。
 */
export const getMyArticles = (q?: ListQuery): Promise<ArticlePage> =>
  request<ArticlePage>('/me/articles', { query: q })

/**
 * 我的点赞列表（数组，不分页）。
 */
export const getMyLikes = (): Promise<ArticleSummary[]> => request<ArticleSummary[]>('/me/likes')

/* ---------------- 通知 ---------------- */

/** 通知列表查询参数。 */
interface NotificationQuery extends ListQuery {
  isRead?: boolean
}

/**
 * 我的通知列表（支持已读筛选、分页）。
 *
 * @param q - 查询参数（isRead/page/pageSize）。
 */
export const getMyNotifications = (q?: NotificationQuery): Promise<NotificationPage> =>
  request<NotificationPage>('/me/notifications', { query: q })

/**
 * 未读通知数。
 */
export const getUnreadCount = (): Promise<{ count: number }> =>
  request<{ count: number }>('/me/notifications/unread-count')

/**
 * 全部标记为已读。
 */
export const readAllNotifications = (): Promise<void> =>
  request<void>('/me/notifications/read-all', { method: 'POST' })

/**
 * 标记单条通知已读/未读。
 *
 * @param id - 通知 id。
 * @param isRead - 是否已读。
 */
export const updateNotification = (id: number, isRead: boolean): Promise<void> =>
  request<void>(`/me/notifications/${id}`, { method: 'PATCH', body: { isRead } })
