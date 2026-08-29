/**
 * @file src/pages/profile/ProfileLayout.tsx
 * @description 个人中心外壳：左侧导航 + 右侧子路由出口。五个二级页（资料/密码/通知/点赞/收藏）
 *   都挂在 /profile 下，导航高亮由 NavLink 自动处理。member 即可访问（路由层 RequireAuth 保证）。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { Bell, Heart, KeyRound, ListChecks, UserCircle } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'

/** 二级导航项。 */
const NAV = [
  { to: '/profile', label: '个人资料', icon: UserCircle, end: true },
  { to: '/profile/password', label: '修改密码', icon: KeyRound, end: false },
  { to: '/profile/notifications', label: '通知', icon: Bell, end: false },
  { to: '/profile/likes', label: '我的点赞', icon: Heart, end: false },
  { to: '/profile/favorites', label: '我的收藏', icon: ListChecks, end: false },
] as const

/** 个人中心外壳。 */
export const ProfileLayout = () => (
  <div className="space-y-6">
    <PageHeader title="个人中心" description="管理你的资料、密码、通知与收藏。" />
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  </div>
)

export default ProfileLayout
