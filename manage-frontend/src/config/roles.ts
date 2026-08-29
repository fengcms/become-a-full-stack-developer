/**
 * @file src/config/roles.ts
 * @description 角色模型。数据来自契约 §User.role 与各端点的 x-authz.minRole，不是拍脑袋定的。
 *
 * 三角色语义（契约原文）：
 *   member — 普通会员，只能读 + 评论 + 管自己的东西（/me/*）
 *   editor — 内容编辑，管全站文章/评论/分类/标签；**不可**管用户、角色、站点配置
 *   admin  — 后台管理员，含用户与站点配置
 * @module manage-frontend/config
 * @date 2026-08-29
 */

import type { UserRole } from '@/types/common'

/** 角色等级。数值越大权限越高，用于 roleAtLeast 比较。 */
export const ROLE_LEVEL: Record<UserRole, number> = {
  member: 1,
  editor: 2,
  admin: 3,
}

/** 角色中文标签。 */
export const ROLE_LABELS: Record<UserRole, string> = {
  member: '会员',
  editor: '编辑',
  admin: '管理员',
}

/** 角色徽章配色（Tailwind 类名片段），列表页展示用。 */
export const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  member: 'bg-muted text-muted-foreground',
  editor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  admin: 'bg-primary/15 text-primary',
}

/**
 * 禁止进入管理后台的角色。
 * member 在契约里一个管理端点都碰不到（全是 minRole: editor 以上），
 * 让它登进来只会看到满屏 403。与其如此，不如在门口讲清楚。
 *
 * ⚠️ 这是**体验优化**，不是安全边界。真正的闸门在后端 x-authz，前端拦截只是省一次白跑的往返。
 */
export const CONSOLE_BLOCKED_ROLES: readonly UserRole[] = ['member']

/** 登录后各角色的默认落地页。 */
export const ROLE_HOME: Record<UserRole, string> = {
  member: '/no-access',
  editor: '/dashboard',
  admin: '/dashboard',
}

/**
 * a 的权限是否 >= min。
 * @param role - 待判断角色（可空）。
 * @param min - 最低要求角色。
 * @returns 达到或超过 min 时为真。
 */
export const roleAtLeast = (role: UserRole | undefined | null, min: UserRole): boolean => {
  if (!role) return false
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min]
}

/**
 * 当前角色能否进入管理后台（member 被拦截）。
 * @param role - 待判断角色（可空）。
 * @returns 非 member 且有角色时为真。
 */
export const canEnterConsole = (role: UserRole | undefined | null): boolean => {
  if (!role) return false
  return !CONSOLE_BLOCKED_ROLES.includes(role)
}
