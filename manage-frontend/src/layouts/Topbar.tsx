/**
 * @file src/layouts/Topbar.tsx
 * @description 后台顶栏：折叠按钮 + 移动端菜单按钮 + 主题切换 + 用户菜单。
 *   主题切换与用户菜单作为内部组件放本文件，保持「顶栏 = 单文件单职责」。
 * @module manage-frontend/layouts
 * @date 2026-08-29
 */

import { KeyRound, LogOut, Menu, Moon, PanelLeft, Sun, UserCircle } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLE_LABELS } from '@/config/roles'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types/common'

/**
 * 主题切换：点一下直切亮/暗，跳过「跟随系统」这个中间态——后台用户要的是确定性。
 */
const ThemeToggle = () => {
  const { theme, setTheme, resolvedTheme } = useTheme()

  /** 在当前主题与反色之间切换。 */
  const toggle = () => {
    const current = theme === 'system' ? resolvedTheme : theme
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button variant="ghost" size="icon" className="relative" aria-label="切换主题" onClick={toggle}>
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}

/**
 * 用户菜单：头像 + 昵称 + 角色，下拉含个人资料 / 修改密码 / 退出登录。
 *
 * @param user - 当前登录用户（取昵称与角色）。
 * @param onLogout - 退出登录回调（由 AdminLayout 注入，负责清态 + 跳登录）。
 */
const UserMenu = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const initial = (user.nickname || user.username).slice(0, 1)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="用户菜单">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium leading-tight">
              {user.nickname || user.username}
            </div>
            <div className="text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </div>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email || user.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserCircle />
            个人资料
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile/password">
            <KeyRound />
            修改密码
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 后台顶栏。
 *
 * @param onToggleSidebar - 折叠/展开桌面侧栏。
 * @param onOpenMobile - 打开移动端浮层侧栏。
 * @param onLogout - 退出登录回调。
 */
export const Topbar = ({
  onToggleSidebar,
  onOpenMobile,
  onLogout,
}: {
  onToggleSidebar: () => void
  onOpenMobile: () => void
  onLogout: () => void
}) => {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  return (
    <header className="glass flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label="折叠侧边栏"
        className="hidden lg:inline-flex"
      >
        <PanelLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobile}
        aria-label="打开菜单"
        className="lg:hidden"
      >
        <Menu />
      </Button>

      <div className="ml-1 hidden items-center gap-2 sm:flex">
        <span className="h-2 w-2 rounded-full bg-gradient-to-br from-primary to-indigo-400" />
        <span className="text-sm font-medium text-foreground/80">管理控制台</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
