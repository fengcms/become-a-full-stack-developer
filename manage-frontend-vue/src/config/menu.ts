import {
  AlbumsOutline,
  BarChartOutline,
  ChatbubblesOutline,
  FolderOpenOutline,
  PeopleOutline,
  PersonCircleOutline,
  PricetagsOutline,
  SettingsOutline,
} from '@vicons/ionicons5'
import type { Component } from 'vue'
import {
  canManageArticles,
  canManageCategories,
  canManageSiteSettings,
  canManageTags,
  canManageUsers,
  canModerateComments,
} from '@/lib/permission'
import type { User } from '@/types/common'

type Actor = Pick<User, 'id' | 'role'> | null
type MenuItem = { path: string; label: string; icon: Component; can?: (actor: Actor) => boolean }
type MenuGroup = { label: string; items: MenuItem[] }

export const menuGroups: MenuGroup[] = [
  { label: '概览', items: [{ path: '/dashboard', label: '仪表盘', icon: BarChartOutline }] },
  {
    label: '内容',
    items: [
      { path: '/articles', label: '文章管理', icon: AlbumsOutline, can: canManageArticles },
      { path: '/comments', label: '评论审核', icon: ChatbubblesOutline, can: canModerateComments },
      { path: '/categories', label: '分类管理', icon: FolderOpenOutline, can: canManageCategories },
      { path: '/tags', label: '标签管理', icon: PricetagsOutline, can: canManageTags },
    ],
  },
  {
    label: '系统',
    items: [
      { path: '/users', label: '用户管理', icon: PeopleOutline, can: canManageUsers },
      {
        path: '/settings/site',
        label: '站点设置',
        icon: SettingsOutline,
        can: canManageSiteSettings,
      },
    ],
  },
  { label: '个人', items: [{ path: '/profile', label: '个人资料', icon: PersonCircleOutline }] },
]

export const visibleMenuGroups = (actor: Actor) =>
  menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.can || item.can(actor)),
    }))
    .filter((group) => group.items.length)
