/**
 * @file lib/api/likes.ts
 * @description 文章点赞端点。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { request } from '@/lib/request'
import type { components } from '@/types/api.gen'

/** 点赞状态。 */
export type LikeStatus = components['schemas']['LikeStatus']

/**
 * 获取文章点赞状态（当前用户是否已赞 + 总赞数）。
 *
 * @param articleId - 文章 id。
 */
export const getArticleLikeStatus = (articleId: number): Promise<LikeStatus> =>
  request<LikeStatus>(`/articles/${articleId}/like`)

/**
 * 点赞文章。
 *
 * @param articleId - 文章 id。
 */
export const likeArticle = (articleId: number): Promise<LikeStatus> =>
  request<LikeStatus>(`/articles/${articleId}/like`, { method: 'POST' })

/**
 * 取消点赞。
 *
 * @param articleId - 文章 id。
 */
export const unlikeArticle = (articleId: number): Promise<LikeStatus> =>
  request<LikeStatus>(`/articles/${articleId}/like`, { method: 'DELETE' })
