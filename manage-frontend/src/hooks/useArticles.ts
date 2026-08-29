/**
 * @file src/hooks/useArticles.ts
 * @description 文章管理数据层（Phase 1）。把 articles api 与 queryKey / 写操作绑定。
 *   读：useAdminArticles（列表）/ useArticle（详情）；写：增删改 / 过审 / 强改状态。
 *   所有写操作成功后失效 ['articles'] 前缀缓存，列表与详情一起刷新。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AdminArticleQuery,
  approveArticle,
  createArticle,
  deleteArticle,
  getArticle,
  listAdminArticles,
  setArticleStatus,
  updateArticle,
} from '@/api/articles'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'
import type { ArticleCreate, ArticleStatus } from '@/types/common'

/**
 * 后台文章列表。GET /admin/articles（editor+）
 * @param query - 分页 / 排序 / 筛选条件。
 */
export const useAdminArticles = (query: AdminArticleQuery) =>
  useQuery({ queryKey: qk.articles.list(query), queryFn: () => listAdminArticles(query) })

/**
 * 文章详情。GET /articles/{id}（可选鉴权；未发布仅作者 / admin 可见）
 * @param id - 文章 id；非法 id 时不发请求。
 */
export const useArticle = (id: number) =>
  useQuery({
    queryKey: qk.articles.detail(id),
    queryFn: () => getArticle(id),
    enabled: Number.isFinite(id) && id > 0,
  })

/** 失效文章相关查询缓存（列表 + 详情）。 */
const useInvalidateArticles = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['articles'] })
}

/** 新建文章。POST /articles（member+；editor/admin 可置 published）。 */
export const useCreateArticle = () => {
  const invalidate = useInvalidateArticles()
  const toast = useToast()
  return useMutation({
    mutationFn: (payload: ArticleCreate) => createArticle(payload),
    onSuccess: () => {
      toast.success('文章已创建')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 更新文章。PUT /articles/{id}（editor 或作者本人）。 */
export const useUpdateArticle = () => {
  const invalidate = useInvalidateArticles()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ArticleCreate }) =>
      updateArticle(id, payload),
    onSuccess: () => {
      toast.success('文章已保存')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 删除文章。DELETE /articles/{id}（软删除，editor 或作者本人）。 */
export const useDeleteArticle = () => {
  const invalidate = useInvalidateArticles()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: number) => deleteArticle(id),
    onSuccess: () => {
      toast.success('文章已删除')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 过审。POST /admin/articles/{id}/approve（editor+，pending → published）。 */
export const useApproveArticle = () => {
  const invalidate = useInvalidateArticles()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: number) => approveArticle(id),
    onSuccess: () => {
      toast.success('已通过审核并发布')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 强改状态。POST /admin/articles/{id}/status（admin 专用，三态任意转移）。 */
export const useSetArticleStatus = () => {
  const invalidate = useInvalidateArticles()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ArticleStatus }) =>
      setArticleStatus(id, status),
    onSuccess: () => {
      toast.success('状态已更新')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}
