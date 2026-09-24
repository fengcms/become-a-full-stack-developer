/**
 * @file lib/api/comments.ts
 * @description 评论端点。列表走 serverFetch（RSC），发表/删除走 request（客户端）。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { serverFetch } from '@/lib/api/server'
import { request } from '@/lib/request'
import type { components } from '@/types/api.gen'

/** 评论。 */
export type Comment = components['schemas']['Comment']
/** 评论分页。 */
export type CommentPage = components['schemas']['CommentPage']

/** 发表评论入参。 */
export interface CreateCommentInput {
  content: string
  parentId?: number | null
}

/**
 * 获取文章评论列表（仅 approved，扁平含 parentId）。
 *
 * @param idOrSlug - 文章 id 或 slug。
 * @param page - 页码。
 * @param pageSize - 每页条数。
 */
export const listArticleComments = (
  idOrSlug: string | number,
  page = 1,
  pageSize = 50,
): Promise<CommentPage> =>
  serverFetch<CommentPage>(`/articles/${idOrSlug}/comments`, {
    query: { page, pageSize },
    cache: 'no-store',
  })

/**
 * 发表评论（自动敏感词过滤）。
 * 返回的 comment.status 若为 rejected，前端不应插入列表。
 *
 * @param idOrSlug - 文章 id 或 slug。
 * @param input - 评论内容 + 可选父评论 id。
 */
export const createComment = (
  idOrSlug: string | number,
  input: CreateCommentInput,
): Promise<Comment> =>
  request<Comment>(`/articles/${idOrSlug}/comments`, { method: 'POST', body: input })

/**
 * 删除评论（作者本人）。
 *
 * @param id - 评论 id。
 */
export const deleteComment = (id: number): Promise<void> =>
  request<void>(`/comments/${id}`, { method: 'DELETE' })
