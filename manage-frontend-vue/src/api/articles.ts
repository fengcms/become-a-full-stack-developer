/**
 * @file src/api/articles.ts
 * @description 文章相关接口。首波只落地后台列表所需的部分，其余端点随对应模块开发时补齐。
 *   api/ 层只把契约端点包成带类型的函数，不做状态/UI/toast。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { Article, ArticleCreate, ArticlePage, ArticleStatus, PageQuery } from '@/types/common'

/** 后台文章列表查询入参。见 PageQuery：查询入参一律用 type 别名，否则无法传给请求层的 query。 */
export type AdminArticleQuery = PageQuery & {
  /** 带符号排序：`-publishedAt` 表示倒序 */
  sort?: string
  category?: string
  tag?: string
  status?: ArticleStatus
  keyword?: string
}

/**
 * 后台文章列表。GET /admin/articles（editor+）
 * @param query - 分页与筛选条件。
 * @returns 分页结果 `{ list, pagination }`。
 */
export const listAdminArticles = (query: AdminArticleQuery = {}): Promise<ArticlePage> =>
  http.get<ArticlePage>('/admin/articles', { query })

/**
 * 文章详情。GET /articles/{idOrSlug}
 * @param idOrSlug - 文章 id 或 slug。
 * @returns 文章完整信息。
 */
export const getArticle = (idOrSlug: string | number): Promise<Article> =>
  http.get<Article>(`/articles/${idOrSlug}`)

/**
 * 创建文章。POST /articles（member+，member 只能产出 draft/pending）
 * @param payload - 文章创建字段。
 * @returns 新建的文章。
 */
export const createArticle = (payload: ArticleCreate): Promise<Article> =>
  http.post<Article>('/articles', payload)

/**
 * 更新文章。PUT /articles/{id}（editor 或作者本人）
 * @param id - 文章 id。
 * @param payload - 文章更新字段。
 * @returns 更新后的文章。
 */
export const updateArticle = (id: number, payload: ArticleCreate): Promise<Article> =>
  http.put<Article>(`/articles/${id}`, payload)

/**
 * 删除文章。DELETE /articles/{id}（editor 或作者本人）
 * @param id - 文章 id。
 */
export const deleteArticle = (id: number): Promise<void> => http.delete<void>(`/articles/${id}`)

/**
 * 过审。POST /admin/articles/{id}/approve（editor+）
 * @param id - 文章 id。
 * @returns 过审后的文章。
 */
export const approveArticle = (id: number): Promise<Article> =>
  http.post<Article>(`/admin/articles/${id}/approve`)

/**
 * 强改状态。POST /admin/articles/{id}/status（admin）
 * 与 approve 的区别见 lib/permission 里 canForceArticleStatus 的注释。
 * @param id - 文章 id。
 * @param status - 目标状态（admin 可任意指定）。
 * @returns 状态变更后的文章。
 */
export const setArticleStatus = (id: number, status: ArticleStatus): Promise<Article> =>
  http.post<Article>(`/admin/articles/${id}/status`, { status })
