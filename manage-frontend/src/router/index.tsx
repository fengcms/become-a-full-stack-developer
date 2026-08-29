/**
 * @file src/router/index.tsx
 * @description 路由表（目录式声明，按开发规范 §4 允许较长——它只声明路由与守卫组合，不含页面逻辑）。
 *
 * 结构上分两层壳：
 *   /login、/no-access —— 裸页，不套后台布局（未登录或没资格进后台的人不该看到侧栏）
 *   其余             —— RequireAuth → RequireConsole → AdminLayout
 *
 * 每个业务路由外面再套 RequireCan，判据直接引用 lib/permission，
 * 与菜单可见性同源。这样「菜单里看不见」和「硬敲地址进不去」永远一致。
 * @module manage-frontend/router
 * @date 2026-08-29
 */

import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { FullPageLoading } from '@/components/feedback/FullPageLoading'
import AdminLayout from '@/layouts/AdminLayout'
import {
  canManageArticles,
  canManageCategories,
  canManageSiteSettings,
  canManageTags,
  canManageUsers,
  canModerateComments,
} from '@/lib/permission'
import { ForbiddenPage, NoAccessPage, NotFoundPage } from '@/pages/errors'
import ChangePasswordPage from '@/pages/profile/ChangePasswordPage'
import FavoritesPage from '@/pages/profile/FavoritesPage'
import LikesPage from '@/pages/profile/LikesPage'
import NotificationsPage from '@/pages/profile/NotificationsPage'
import ProfileLayout from '@/pages/profile/ProfileLayout'
import ProfilePage from '@/pages/profile/ProfilePage'
import { DefaultHome, GuestOnly, RequireAuth, RequireCan, RequireConsole } from '@/router/guards'

// 登录页与仪表盘会被首屏立刻用到，但仍走懒加载：
// 登录后的用户永远不会加载登录页的代码，反之亦然，各省一份
const LoginPage = lazy(() => import('@/pages/login/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ArticleListPage = lazy(() => import('@/pages/articles/ArticleListPage'))
const ArticleFormPage = lazy(() => import('@/pages/articles/ArticleFormPage'))
const CommentListPage = lazy(() => import('@/pages/comments/CommentListPage'))
const CategoryTreePage = lazy(() => import('@/pages/categories/CategoryTreePage'))
const TagListPage = lazy(() => import('@/pages/tags/TagListPage'))
const UserListPage = lazy(() => import('@/pages/users/UserListPage'))
const SiteSettingsPage = lazy(() => import('@/pages/site/SiteSettingsPage'))

/**
 * 路由表。裸页与后台主壳分层，业务路由按能力套 RequireCan。
 */
const AppRoutes = () => (
  <Suspense fallback={<FullPageLoading />}>
    <Routes>
      {/* 裸页 */}
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/no-access"
        element={
          <RequireAuth>
            <NoAccessPage />
          </RequireAuth>
        }
      />

      {/* 后台主壳 */}
      <Route
        element={
          <RequireAuth>
            <RequireConsole>
              <AdminLayout />
            </RequireConsole>
          </RequireAuth>
        }
      >
        <Route path="/" element={<DefaultHome />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/articles"
          element={
            <RequireCan can={canManageArticles}>
              <ArticleListPage />
            </RequireCan>
          }
        />
        <Route
          path="/articles/new"
          element={
            <RequireCan can={canManageArticles}>
              <ArticleFormPage />
            </RequireCan>
          }
        />
        <Route
          path="/articles/:id/edit"
          element={
            <RequireCan can={canManageArticles}>
              <ArticleFormPage />
            </RequireCan>
          }
        />

        <Route
          path="/comments"
          element={
            <RequireCan can={canModerateComments}>
              <CommentListPage />
            </RequireCan>
          }
        />

        <Route
          path="/categories"
          element={
            <RequireCan can={canManageCategories}>
              <CategoryTreePage />
            </RequireCan>
          }
        />

        <Route
          path="/tags"
          element={
            <RequireCan can={canManageTags}>
              <TagListPage />
            </RequireCan>
          }
        />

        <Route
          path="/users"
          element={
            <RequireCan can={canManageUsers}>
              <UserListPage />
            </RequireCan>
          }
        />

        <Route
          path="/settings/site"
          element={
            <RequireCan can={canManageSiteSettings}>
              <SiteSettingsPage />
            </RequireCan>
          }
        />

        {/* 个人中心：member 即可访问，ProfileLayout 提供二级导航 + 子路由 */}
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfileLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ProfilePage />} />
          <Route path="password" element={<ChangePasswordPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="likes" element={<LikesPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
        </Route>

        <Route path="/403" element={<ForbiddenPage />} />
        {/* 兜底放在主壳内：未登录时先被 RequireAuth 接走去登录页，
            已登录才真的看到「页面不存在」——两种情况的正确反馈本来就不同 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </Suspense>
)

export { AppRoutes }
