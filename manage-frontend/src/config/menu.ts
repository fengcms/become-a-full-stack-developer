/**
 * @file src/config/menu.ts
 * @description 侧边栏菜单的单一事实源。
 *   每一项都挂一个 `can(actor)` 判定，直接复用 lib/permission 的能力函数——
 *   于是「菜单显什么」和「路由守卫放不放」共用同一套判据，不会出现
 *   菜单里能点、点进去 403 的分裂。
 * @module manage-frontend/config
 * @date 2026-08-29
 */

import {
  FileText,
  FolderTree,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Settings,
  Tags,
  UserCircle,
  Users,
} from 'lucide-react'
import {
  canManageArticles,
  canManageCategories,
  canManageSiteSettings,
  canManageTags,
  canManageUsers,
  canModerateComments,
} from '@/lib/permission'
import type { User } from '@/types/common'

/** 当前操作者的简版身份（只要 id 与 role）。 */
type Actor = Pick<User, 'id' | 'role'> | null | undefined

/** 菜单项。 */
export interface MenuItem {
  /** 路由 path，与 router 表一一对应 */
  to: string
  label: string
  icon: LucideIcon
  /** 可见性判定；不给则所有登录用户可见 */
  can?: (actor: Actor) => boolean
  /** 精确匹配高亮（默认前缀匹配，仪表盘这类根路径需要精确） */
  exact?: boolean
}

/** 菜单分组（带分组标题）。 */
export interface MenuGroup {
  key: string
  label: string
  items: MenuItem[]
}

/** 侧边栏菜单定义。每项 `can` 直接复用 lib/permission 的能力函数。 */
export const MENU: MenuGroup[] = [
  {
    key: 'overview',
    label: '概览',
    items: [{ to: '/dashboard', label: '仪表盘', icon: LayoutDashboard, exact: true }],
  },
  {
    key: 'content',
    label: '内容',
    items: [
      { to: '/articles', label: '文章管理', icon: FileText, can: canManageArticles },
      { to: '/comments', label: '评论审核', icon: MessageSquare, can: canModerateComments },
      { to: '/categories', label: '分类管理', icon: FolderTree, can: canManageCategories },
      { to: '/tags', label: '标签管理', icon: Tags, can: canManageTags },
    ],
  },
  {
    key: 'system',
    label: '系统',
    items: [
      { to: '/users', label: '用户管理', icon: Users, can: canManageUsers },
      { to: '/settings/site', label: '站点设置', icon: Settings, can: canManageSiteSettings },
    ],
  },
  {
    key: 'personal',
    label: '个人',
    items: [{ to: '/profile', label: '个人资料', icon: UserCircle }],
  },
]

/**
 * 按当前用户过滤出可见菜单；整组不可见时连分组标题一起去掉。
 * @param actor - 当前用户（取 id / role）。
 * @returns 过滤后的菜单分组列表。
 */
export const visibleMenu = (actor: Actor): MenuGroup[] =>
  MENU.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.can || item.can(actor)),
  })).filter((group) => group.items.length > 0)
