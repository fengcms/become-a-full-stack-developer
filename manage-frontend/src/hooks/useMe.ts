/**
 * @file src/hooks/useMe.ts
 * @description 个人中心数据层（Member）。资料读写、改密码、我的点赞、我的收藏。
 *   写操作失效对应前缀缓存，保证列表回到最新态。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addFavorite,
  changePassword,
  getMyProfile,
  type LikeQuery,
  listMyFavorites,
  listMyLikes,
  removeFavorite,
  updateMyProfile,
} from '@/api/me'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'
import type { ChangePasswordRequest, ProfileUpdateRequest } from '@/types/common'

/** 我的资料（GET /me/profile）。 */
export const useMyProfile = () => useQuery({ queryKey: qk.me.profile, queryFn: getMyProfile })

/** 更新资料（昵称/头像/邮箱）。PATCH /me/profile */
export const useUpdateProfile = () => {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (payload: ProfileUpdateRequest) => updateMyProfile(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me.profile })
      toast.success('资料已更新')
    },
    // 邮箱冲突 409 / code 3002 由 toast 显式提示（不静默）
    onError: (e) => toast.error(e, '更新失败：邮箱可能已被占用'),
  })
}

/** 修改密码。POST /me/change-password */
export const useChangePassword = () => {
  const toast = useToast()
  return useMutation({
    mutationFn: (payload: ChangePasswordRequest) => changePassword(payload),
    onSuccess: () => toast.success('密码已修改，其它设备已退出登录'),
    onError: (e) => toast.error(e, '修改失败：旧密码错误或新密码不足 8 位'),
  })
}

/** 我的点赞（GET /me/likes，裸数组）。 */
export const useLikes = (query: LikeQuery = {}) =>
  useQuery({ queryKey: qk.me.likes(query), queryFn: () => listMyLikes(query) })

/** 我的收藏（GET /me/favorites，分页）。 */
export const useFavorites = (query: { page?: number; pageSize?: number } = {}) =>
  useQuery({ queryKey: qk.me.favorites(query), queryFn: () => listMyFavorites(query) })

/** 添加/取消收藏（幂等）。写后失效收藏列表。 */
export const useToggleFavorite = () => {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ articleId, add }: { articleId: number; add: boolean }) =>
      add ? addFavorite(articleId) : removeFavorite(articleId),
    onSuccess: (_d, { add }) => {
      void qc.invalidateQueries({ queryKey: qk.me.favorites({}) })
      toast.success(add ? '已收藏' : '已取消收藏')
    },
    onError: (e) => toast.error(e, '操作失败'),
  })
}
