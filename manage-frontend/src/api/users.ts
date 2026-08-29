/**
 * @file src/api/users.ts
 * @description 用户管理接口（契约 User / Admin 组）。Phase 4(admin 专属)。
 *
 * ⚠️ 与计划文档的差异：`docs/manage-frontend/M2-开发计划.md` §7 把列表/详情/改角色写成
 *   `GET/GET/PATCH /admin/users/{id}`，但契约里这三个端点在 **`/users` 下**（admin 鉴权，路径不含 admin）：
 *   - 列表   `GET  /users`（query: role / status / keyword / page / pageSize）
 *   - 详情   `GET  /users/{id}`
 *   - 改角色 `PATCH /users/{id}`（body: role / status / level，全部可选）
 *   只有「重置密码」在 `POST /admin/users/{id}/reset-password`——路径带 admin。
 *   实现以契约(openapi.v1.yaml)为唯一真相，差异已钉进 users.test.ts。
 *
 * ⚠️ 另一条差异：计划写「重置后返回一次性凭证」，但契约 `AdminResetPasswordRequest`
 *   **要求 admin 主动提供 newPassword**（minLength 8），响应不返回任何凭证——
 *   新密码由 admin 线下告知用户。故 ResetPasswordDialog 是输入新密码，不是展示一次性凭证。
 *
 * 角色三角：member(普通会员) / editor(内容编辑) / admin(后台管理员)。
 * status：active / disabled（disabled=封号，无法登录/刷新，公开主页 404）。
 * level：会员等级，仅展示用，admin 可上调。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { User, UserPage, UserRole, UserStatus } from '@/types/common'

/** 用户列表查询入参。 */
export type UserListQuery = {
  page?: number
  pageSize?: number
  role?: UserRole
  status?: UserStatus
  keyword?: string
}

/** 用户变更入参（PATCH /users/{id}）。role/status/level 全部可选，局部更新。 */
export type UserUpdate = {
  role?: UserRole
  status?: UserStatus
  level?: number
}

/**
 * 用户列表（分页 + 筛选）。GET /users（admin）
 * @param query - 分页与筛选条件（role / status / keyword）。
 * @returns 分页结果 `{ list, pagination }`。
 */
export const listUsers = (query: UserListQuery = {}): Promise<UserPage> =>
  http.get<UserPage>('/users', { query })

/**
 * 用户详情。GET /users/{id}（admin）
 * @param id - 用户 id。
 * @returns 用户完整信息。
 */
export const getUser = (id: number): Promise<User> => http.get<User>(`/users/${id}`)

/**
 * 变更角色 / 状态 / 等级。PATCH /users/{id}（admin）
 *
 * 局部更新：只传要改的字段即可。
 * - 角色：member → editor（晋升）；admin 亦可将 editor 降回 member。
 * - 状态：active ↔ disabled（disabled=封号）。
 * - 等级：仅展示用，默认 1。
 *
 * @param id - 用户 id。
 * @param payload - 要变更的字段子集。
 * @returns 更新后的用户。
 */
export const updateUser = (id: number, payload: UserUpdate): Promise<User> =>
  http.patch<User>(`/users/${id}`, payload)

/**
 * 管理员重置用户密码。POST /admin/users/{id}/reset-password（admin）
 *
 * 契约要求 admin **主动提供** newPassword（minLength 8）；响应不返回凭证，
 * 新密码由 admin 线下告知用户。重置后作废该用户全部 refreshToken。
 *
 * @param id - 用户 id。
 * @param newPassword - 新密码（≥8 位）。
 * @returns 后端返回 ApiResponse（data 通常为空）。
 */
export const adminResetPassword = (id: number, newPassword: string): Promise<unknown> =>
  http.post<unknown>(`/admin/users/${id}/reset-password`, { newPassword })
