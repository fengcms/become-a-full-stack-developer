/**
 * @file src/hooks/useComments.ts
 * @description 评论审核数据层（Phase 2）。把 comments api 与 queryKey / 写操作绑定。
 *   读：useAdminComments（列表）；写：审核置位 / 代回复 / 删除。
 *   所有写操作成功后失效 ['comments'] 前缀缓存。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AdminCommentQuery,
  deleteComment,
  listAdminComments,
  moderateComment,
  replyComment,
} from '@/api/comments'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'
import type { CommentModerateRequest, CommentStatus } from '@/types/common'

/** 审核置位后的提示文案，按目标状态区分——统一说「已更新」等于什么都没说。 */
const MODERATE_TOAST: Record<CommentStatus, string> = {
  approved: '已通过审核',
  rejected: '已拒绝该评论',
  reviewing: '已标记为待人工复核',
}

/**
 * 后台评论列表。GET /admin/comments（editor+）
 * @param query - 分页与筛选条件。
 */
export const useAdminComments = (query: AdminCommentQuery) =>
  useQuery({ queryKey: qk.comments.list(query), queryFn: () => listAdminComments(query) })

/** 失效评论相关查询缓存。 */
const useInvalidateComments = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['comments'] })
}

/**
 * 审核置位。PATCH /comments/{id}/status（editor+）
 * 这是 reviewing 态的唯一进出路径。
 */
export const useModerateComment = () => {
  const invalidate = useInvalidateComments()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CommentModerateRequest }) =>
      moderateComment(id, payload),
    onSuccess: (_data, vars) => {
      toast.success(MODERATE_TOAST[vars.payload.status])
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/**
 * 代回复。POST /articles/{id}/comments（member+）
 *
 * ⚠️ 返回值可能带 rejected 状态（命中敏感词阈值）。这里不做乐观插入——
 * 直接把返回值塞进列表，会把一条实际不可见的评论显示出来。交给调用方按 status 分支提示。
 */
export const useReplyComment = () => {
  const invalidate = useInvalidateComments()
  const toast = useToast()
  return useMutation({
    mutationFn: ({
      articleId,
      content,
      parentId,
    }: {
      articleId: number
      content: string
      parentId?: number | null
    }) => replyComment(articleId, { content, parentId }),
    onSuccess: (comment) => {
      if (comment.status === 'rejected') {
        toast.success('回复已提交，但命中过滤规则未予展示')
      } else {
        toast.success('回复已发布')
      }
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 删除评论。DELETE /comments/{id}（editor 或本人；契约标注级联删除子回复）。 */
export const useDeleteComment = () => {
  const invalidate = useInvalidateComments()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      toast.success('评论已删除（含其下回复）')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}
