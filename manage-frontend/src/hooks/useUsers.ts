/**
 * @file src/hooks/useUsers.ts
 * @description 用户管理数据层（admin 专属）。读：分页筛选列表；写：改角色/状态/等级、重置密码。
 *   所有写操作成功后失效 ['users'] 前缀缓存，让列表回到最新态。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminResetPassword,
  listUsers,
  type UserListQuery,
  type UserUpdate,
  updateUser,
} from '@/api/users'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'

/** 用户列表（分页 + 角色/状态/关键词筛选）。 */
export const useUsers = (query: UserListQuery = {}) =>
  useQuery({ queryKey: qk.users.list(query), queryFn: () => listUsers(query) })

/** 失效用户相关查询缓存。 */
const useInvalidateUsers = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['users'] })
}

/** 变更角色 / 状态 / 等级。PATCH /users/{id}（admin） */
export const useUpdateUser = () => {
  const invalidate = useInvalidateUsers()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdate }) => updateUser(id, payload),
    onSuccess: () => {
      toast.success('用户已更新')
      invalidate()
    },
    onError: (e) => toast.error(e, '更新失败，请检查角色/状态是否合法'),
  })
}

/**
 * 管理员重置密码。POST /admin/users/{id}/reset-password（admin）
 *
 * 契约要求 admin 提供新密码，响应不返回凭证——成功即视为已重置，新密码由 admin 线下告知用户。
 */
export const useResetPassword = () => {
  const invalidate = useInvalidateUsers()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      adminResetPassword(id, newPassword),
    onSuccess: () => {
      toast.success('密码已重置，请线下将新密码告知该用户')
      invalidate()
    },
    onError: (e) => toast.error(e, '重置失败：新密码至少 8 位'),
  })
}
