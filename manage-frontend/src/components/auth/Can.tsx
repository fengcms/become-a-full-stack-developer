/**
 * @file src/components/auth/Can.tsx
 * @description 按钮级权限组件（M2-12）。包裹需要能力判定的 UI（按钮/菜单项），
 *   无权限时渲染 fallback（默认 null）。组件只问能力，不看角色。
 * @module manage-frontend/components/auth
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'
import type { Actor } from '@/lib/permission'
import {
  canForceArticleStatus,
  canManageArticles,
  canManageAttachments,
  canManageCategories,
  canManageSiteSettings,
  canManageTags,
  canManageUsers,
  canModerateComments,
  canOperateOwned,
  canResetPassword,
} from '@/lib/permission'
import { useAuthStore } from '@/store/auth'
import type { UserRole } from '@/types/common'

/** 命名能力（admin/editor 域）。 */
type Capability =
  | 'manageArticles'
  | 'moderateComments'
  | 'manageCategories'
  | 'manageTags'
  | 'manageUsers'
  | 'resetPassword'
  | 'manageSiteSettings'
  | 'forceArticleStatus'
  | 'manageAttachments'

/** 能力 → 判定函数映射。 */
const CHECKERS: Record<Capability, (actor: Actor) => boolean> = {
  manageArticles: canManageArticles,
  moderateComments: canModerateComments,
  manageCategories: canManageCategories,
  manageTags: canManageTags,
  manageUsers: canManageUsers,
  resetPassword: canResetPassword,
  manageSiteSettings: canManageSiteSettings,
  forceArticleStatus: canForceArticleStatus,
  manageAttachments: canManageAttachments,
}

/**
 * 能力门控包裹组件。
 * @param name - 命名能力（admin/editor 域）。
 * @param ownerId - 资源所有者 id（配合 min 做归属判定）。
 * @param min - 操作非本人资源所需最低角色。
 * @param fallback - 无权限时的占位（默认不渲染）。
 * @param children - 有权限时渲染的内容。
 */
export const Can = ({
  name,
  ownerId,
  min,
  fallback = null,
  children,
}: {
  name?: Capability
  ownerId?: number
  min?: UserRole
  fallback?: ReactNode
  children: ReactNode
}) => {
  const user = useAuthStore((s) => s.user)
  const allowed = name ? CHECKERS[name](user) : min ? canOperateOwned(user, ownerId, min) : false
  return <>{allowed ? children : fallback}</>
}
