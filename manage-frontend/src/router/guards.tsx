/**
 * @file src/router/guards.tsx
 * @description 路由守卫。三层，各管一件事，不要混：
 *
 *   RequireAuth    —— 有没有登录
 *   RequireConsole —— 登录了，但这个角色该不该进管理后台
 *   RequireCan     —— 能进后台，但这个页面它有没有对应能力
 *
 * 分开的好处是失败去向不同：未登录去 /login（带 from 回跳），
 * 角色不该进后台去 /no-access（讲清原因），能力不足去 /403（可返回上一页）。
 * 混在一个守卫里就只能给一个笼统的「无权限」。
 * @module manage-frontend/router
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { FullPageLoading } from '@/components/feedback/FullPageLoading'
import { canEnterConsole, ROLE_HOME } from '@/config/roles'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types/common'

/** 当前操作者的简版身份（只要 id 与 role）。 */
type Actor = Pick<User, 'id' | 'role'> | null | undefined

/**
 * 登录闸门。bootStatus 未落定时必须等，否则会把正在静默恢复的会话误判为未登录。
 * @param children - 已登录时渲染的内容。
 */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const bootStatus = useAuthStore((s) => s.bootStatus)
  const authed = useAuthStore((s) => Boolean(s.accessToken && s.user))

  if (bootStatus !== 'ready') return <FullPageLoading label="正在恢复登录状态" />

  if (!authed) {
    // from 存在 state 里而不是 query 里：回跳地址不该出现在地址栏，也不该被分享出去
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

/**
 * 角色闸门：member 进来只会满屏 403，直接在门口拦下并说明。
 * @param children - 通过角色校验时渲染的内容。
 */
export const RequireConsole = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user)
  if (!canEnterConsole(user?.role)) return <Navigate to="/no-access" replace />
  return <>{children}</>
}

/**
 * 能力闸门：判据直接传 lib/permission 里的函数，与菜单同源。
 * @param can - 权限判据（actor → boolean）。
 * @param children - 通过能力校验时渲染的内容。
 */
export const RequireCan = ({
  can,
  children,
}: {
  can: (actor: Actor) => boolean
  children: ReactNode
}) => {
  const user = useAuthStore((s) => s.user)
  if (!can(user)) return <Navigate to="/403" replace />
  return <>{children}</>
}

/**
 * 已登录用户不该再看到登录页（跳转其角色默认落地页）。
 * @param children - 未登录时渲染的登录内容。
 */
export const GuestOnly = ({ children }: { children: ReactNode }) => {
  const bootStatus = useAuthStore((s) => s.bootStatus)
  const user = useAuthStore((s) => s.user)
  const authed = useAuthStore((s) => Boolean(s.accessToken && s.user))

  if (bootStatus !== 'ready') return <FullPageLoading label="正在恢复登录状态" />
  if (authed && user) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <>{children}</>
}

/**
 * 根路径分流：按角色决定落地页。
 */
export const DefaultHome = () => {
  const user = useAuthStore((s) => s.user)
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}
