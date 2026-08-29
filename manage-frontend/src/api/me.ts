/**
 * @file src/api/me.ts
 * @description 个人中心接口（Member 组，登录即可用）。
 *
 * 端点对齐冻结契约 openapi.v1.yaml v1.11.0：
 *   - 资料   GET  /me/profile  → User；PATCH /me/profile → User（ProfileUpdateRequest：nickname/avatar/email 全可选）
 *   - 密码   POST /me/change-password（ChangePasswordRequest：oldPassword + newPassword，均 ≥8 位）
 *   - 点赞   GET  /me/likes    → ⚠️ **裸数组 ArticleSummary[]**（非分页！计划 / 路线图写的是 page，
 *            但契约 §R5 内部矛盾——契约实际返回裸数组，前端按数组消费，已钉进 me.test.ts）
 *   - 收藏   GET  /me/favorites → ArticlePage（分页）；POST /me/favorites（幂等）；DELETE /me/favorites/{articleId}（幂等）
 *
 * 邮箱唯一：PATCH 改 email 若冲突后端返 409 / code 3002，由页面 toast 提示，不静默吞。
 * v1 无邮箱验证流程（Non-goal）：改 email 立即生效，教程须点明这在真实产品需要验证链路。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type {
  ArticlePage,
  ArticleSummary,
  ChangePasswordRequest,
  ProfileUpdateRequest,
  User,
} from '@/types/common'

/** 我的点赞查询入参（仅分页，契约无筛选）。 */
export type LikeQuery = { page?: number; pageSize?: number }

/**
 * 个人资料。GET /me/profile（member）
 * @returns 当前登录用户的完整资料（含 email——仅本人可见）。
 */
export const getMyProfile = (): Promise<User> => http.get<User>('/me/profile')

/**
 * 更新资料（昵称 / 头像 / 邮箱）。PATCH /me/profile（member）
 *
 * 局部更新：ProfileUpdateRequest 全可选，只传要改的字段。
 * 邮箱冲突后端返 409 / code 3002（由页面 toast，不静默）。
 *
 * @param payload - 要更新的字段子集。
 * @returns 更新后的用户。
 */
export const updateMyProfile = (payload: ProfileUpdateRequest): Promise<User> =>
  http.patch<User>('/me/profile', payload)

/**
 * 修改密码。POST /me/change-password（member）
 *
 * 需校验 oldPassword，更新后作废该用户全部 refreshToken（强制其它设备重登）。
 * 遗忘旧密码时 v1 唯一兜底是 admin 重置（`POST /admin/users/{id}/reset-password`）。
 *
 * @param payload - 旧密码 + 新密码（均 ≥8 位）。
 */
export const changePassword = (payload: ChangePasswordRequest): Promise<unknown> =>
  http.post<unknown>('/me/change-password', payload)

/**
 * 我的点赞列表。GET /me/likes（member）
 *
 * ⚠️ 返回 **裸数组** `ArticleSummary[]`，不是分页对象——契约 §R5 内部矛盾。
 * 前端按数组消费，已钉进 me.test.ts 反向断言非 `{ list, pagination }`。
 *
 * @param query - 分页（page / pageSize，可选）。
 * @returns 点赞过的文章数组（published，按点赞时间倒序）。
 */
export const listMyLikes = (query: LikeQuery = {}): Promise<ArticleSummary[]> =>
  http.get<ArticleSummary[]>('/me/likes', { query })

/**
 * 我的收藏列表。GET /me/favorites（member）
 * @param query - 分页（page / pageSize）。
 * @returns 分页收藏文章（ArticlePage）。
 */
export const listMyFavorites = (
  query: { page?: number; pageSize?: number } = {},
): Promise<ArticlePage> => http.get<ArticlePage>('/me/favorites', { query })

/**
 * 添加收藏。POST /me/favorites（member，幂等）
 * @param articleId - 文章 id（须已发布，否则 404 / code 3001）。
 */
export const addFavorite = (articleId: number): Promise<unknown> =>
  http.post<unknown>('/me/favorites', { articleId })

/**
 * 取消收藏。DELETE /me/favorites/{articleId}（member，幂等）
 * @param articleId - 文章 id。
 */
export const removeFavorite = (articleId: number): Promise<unknown> =>
  http.delete<unknown>(`/me/favorites/${articleId}`)
