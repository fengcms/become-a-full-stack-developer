/**
 * @file src/layouts/Sidebar.tsx
 * @description 后台侧边栏内容：品牌区 + 按角色过滤的导航树。
 *   纯展示组件，不持有折叠/浮层状态，由 AdminLayout 传入 collapsed 与点击回调。
 * @module manage-frontend/layouts
 * @date 2026-08-29
 */

import { NavLink } from 'react-router-dom'
import { visibleMenu } from '@/config/menu'
import { usePublicSiteSettings } from '@/hooks/useSite'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'

/**
 * 侧边栏导航内容（品牌 + 菜单）。被 AdminLayout 在「桌面侧栏」与「移动浮层」两处复用。
 *
 * @param collapsed - 是否折叠（折叠态只显示图标）。
 * @param onNavClick - 菜单项点击回调（移动端用于点击后关闭浮层）。
 */
export const SidebarContent = ({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean
  onNavClick: () => void
}) => {
  const user = useAuthStore((s) => s.user)
  const { data: site } = usePublicSiteSettings()
  if (!user) return null

  const brand = site?.siteName ?? '全栈后台'

  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border/50 px-4">
        <div className="gradient-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-bold text-white shadow-lift">
          {brand.slice(0, 1)}
        </div>
        {!collapsed ? <span className="truncate font-semibold tracking-tight">{brand}</span> : null}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {visibleMenu(user).map((group) => (
          <div key={group.key} className="mb-2">
            {!collapsed ? (
              <div className="px-4 py-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/35">
                {group.label}
              </div>
            ) : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={onNavClick}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group relative mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                    collapsed && 'justify-center',
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-indigo-400"
                        aria-hidden
                      />
                    ) : null}
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  )
}
