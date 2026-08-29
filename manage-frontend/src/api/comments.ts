/**
 * @file src/api/comments.ts
 * @description 评论相关接口，端点严格对齐冻结契约 v1.11.0。
 *
 * ⚠️ 与 `docs/manage-frontend/M2-开发计划.md` §5 的差异（**以契约为准**）：
 *   计划写的是 `POST /admin/comments`（代回复）与 `DELETE /admin/comments/{id}`，
 *   但契约里 `/api/v1/admin/comments` **只有 GET**，这两个端点并不存在。
 *   - 代回复 → `POST /articles/{idOrSlug}/comments`（member+；传 parentId 即为回复某楼）
 *   - 删除 → `DELETE /comments/{id}`（editor+，且 ownerOverride 允许本人删自己的评论）
 *
 * 另一处契约要点：`reviewing` 态**只能**由 `PATCH /comments/{id}/status` 置位与移出，
 * 自动流（发表评论）只产出 approved / rejected。所以这个端点是该状态的唯一进出路径。
 *
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type {
  Comment,
  CommentModerateRequest,
  CommentPage,
  CommentStatus,
  PageQuery,
} from '@/types/common'

/** 后台评论列表查询入参。查询入参一律用 type 别名，否则无法传给请求层的 query。 */
export type AdminCommentQuery = PageQuery & {
  /** 按状态筛选；不传返回全部三态 */
  status?: CommentStatus
  /** 只看某篇文章下的评论 */
  articleId?: number
}

/** 代回复入参。content 契约上限 2000 字符（发表时后端做敏感词过滤）。 */
export type ReplyPayload = {
  content: string
  /** 回复某条评论时传其 id；直接评论文章则不传 */
  parentId?: number | null
}

/**
 * 后台评论列表。GET /admin/comments（editor+）
 *
 * 这是 reviewing / rejected 评论的**唯一读取路径**——公开列表只返回 approved。
 *
 * @param query - 分页与筛选条件。
 * @returns 分页结果 `{ list, pagination }`。
 */
export const listAdminComments = (query: AdminCommentQuery = {}): Promise<CommentPage> =>
  http.get<CommentPage>('/admin/comments', { query })

/**
 * 审核置位。PATCH /comments/{id}/status（editor+）
 *
 * 三态任意转移；置为当前同一状态时幂等返回 200；置为 approved 时后端清空 rejectedReason。
 *
 * @param id - 评论 id。
 * @param payload - 目标状态与可选的拒绝理由。
 * @returns 更新后的评论。
 */
export const moderateComment = (id: number, payload: CommentModerateRequest): Promise<Comment> =>
  http.patch<Comment>(`/comments/${id}/status`, payload)

/**
 * 代回复。POST /articles/{idOrSlug}/comments（member+）
 *
 * 官方回复走的是和普通用户同一条发表路径，只是由 editor/admin 身份发出。
 * 注意返回体的 status 可能是 rejected（命中敏感词阈值），前端须就地提示而非直接插入列表。
 *
 * @param articleId - 目标文章 id。
 * @param payload - 回复内容与可选的父楼 id。
 * @returns 新评论（含后端判定出的 status）。
 */
export const replyComment = (articleId: number, payload: ReplyPayload): Promise<Comment> =>
  http.post<Comment>(`/articles/${articleId}/comments`, payload)

/**
 * 删除评论。DELETE /comments/{id}（editor 或评论本人）
 *
 * 契约标注 `x-cascade: children`——删除时会**级联删除其所有子回复**，不是留孤儿。
 * 弹确认文案里必须说清这一点，否则用户以为只删了一条。
 *
 * @param id - 评论 id。
 */
export const deleteComment = (id: number): Promise<void> => http.delete<void>(`/comments/${id}`)
