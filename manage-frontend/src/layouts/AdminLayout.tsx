/**
 * @file src/layouts/AdminLayout.tsx
 * @description 管理后台主框架（壳）：组合桌面侧栏、移动浮层侧栏、顶栏与内容区。
 *   自身不渲染业务 UI，具体导航/用户菜单在 Sidebar.tsx / Topbar.tsx。
 *
 * 布局形状沿用参考项目里已验证过的那套（响应式三档：≥1280 展开 / 1024–1279 自动折叠 /
 * <1024 汉堡浮层），菜单与权限判据换成本项目契约的三角色模型。
 * @module manage-frontend/layouts
 * @date 2026-08-29
 */

import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { logout as logoutApi } from '@/api/auth'
import { SidebarContent } from '@/layouts/Sidebar'
import { Topbar } from '@/layouts/Topbar'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useUiStore } from '@/store/ui'

/**
 * 后台主框架。负责响应式折叠策略与登出编排，业务展示委托给子组件。
 */
const AdminLayout = () => {
  const user = useAuthStore((s) => s.user)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  const [mobileOpen, setMobileOpen] = useState(false)

  // 响应式：<1280 自动折叠侧栏；回到大屏关掉移动浮层，避免浮层挂在大屏上挡内容
  useEffect(() => {
    const mqCollapse = window.matchMedia('(max-width: 1279px)')
    const mqMobile = window.matchMedia('(max-width: 1023px)')

    const onCollapse = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) useUiStore.getState().setSidebar(true)
    }
    const onMobile = (e: MediaQueryListEvent | MediaQueryList) => {
      if (!e.matches) setMobileOpen(false)
    }

    onCollapse(mqCollapse)
    onMobile(mqMobile)
    mqCollapse.addEventListener('change', onCollapse)
    mqMobile.addEventListener('change', onMobile)
    return () => {
      mqCollapse.removeEventListener('change', onCollapse)
      mqMobile.removeEventListener('change', onMobile)
    }
  }, [])

  const navigate = useNavigate()

  if (!user) return null

  /** 登出：清本地会话（api 内部保证无论成败都清），再跳登录页。 */
  const handleLogout = async () => {
    await logoutApi()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 桌面侧栏（≥1024） */}
      <aside
        className={cn(
          'hidden flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[64px]' : 'w-[210px]',
        )}
      >
        <SidebarContent collapsed={collapsed} onNavClick={() => {}} />
      </aside>

      {/* 移动端浮层侧栏（<1024） */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-black/30 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="animate-rise relative flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground shadow-2xl"
            style={{ animationDuration: '0.2s' }}
          >
            <SidebarContent collapsed={false} onNavClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* 主区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onToggleSidebar={toggle}
          onOpenMobile={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="app-bg flex-1 overflow-y-auto p-6">
          <div className="animate-rise mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
