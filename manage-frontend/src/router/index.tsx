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
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { DefaultHome, GuestOnly, RequireAuth, RequireCan, RequireConsole } from '@/router/guards'

// 登录页与仪表盘会被首屏立刻用到，但仍走懒加载：
// 登录后的用户永远不会加载登录页的代码，反之亦然，各省一份
const LoginPage = lazy(() => import('@/pages/login/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ArticleListPage = lazy(() => import('@/pages/articles/ArticleListPage'))
const ArticleFormPage = lazy(() => import('@/pages/articles/ArticleFormPage'))

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
              <PlaceholderPage
                title="评论审核"
                description="approved / rejected / reviewing 三态，reviewing 为人工复核兜底态。"
                endpoints={[
                  'GET    /admin/comments',
                  'PATCH  /comments/{id}/status',
                  'DELETE /comments/{id}',
                ]}
              />
            </RequireCan>
          }
        />

        <Route
          path="/categories"
          element={
            <RequireCan can={canManageCategories}>
              <PlaceholderPage
                title="分类管理"
                description="无限级自关联树，最大嵌套 4 级，变更 parentId 时后端做环检测。"
                endpoints={[
                  'GET    /categories/tree',
                  'POST   /categories',
                  'PUT    /categories/{id}',
                  'DELETE /categories/{id}',
                ]}
              />
            </RequireCan>
          }
        />

        <Route
          path="/tags"
          element={
            <RequireCan can={canManageTags}>
              <PlaceholderPage
                title="标签管理"
                description="标签及其文章计数（articleCount 由后端维护）。"
                endpoints={['GET /tags', 'POST /tags', 'PUT /tags/{id}', 'DELETE /tags/{id}']}
              />
            </RequireCan>
          }
        />

        <Route
          path="/users"
          element={
            <RequireCan can={canManageUsers}>
              <PlaceholderPage
                title="用户管理"
                description="角色升降、启用禁用、等级调整与密码重置，均为 admin 专属。"
                endpoints={[
                  'GET   /users',
                  'GET   /users/{id}',
                  'PATCH /users/{id}',
                  'POST  /admin/users/{id}/reset-password',
                ]}
              />
            </RequireCan>
          }
        />

        <Route
          path="/settings/site"
          element={
            <RequireCan can={canManageSiteSettings}>
              <PlaceholderPage
                title="站点设置"
                description="站点名称 / 标题 / 描述 / 关键词 / Logo / 版权，供前台页头页脚与 SEO 使用。"
                endpoints={['GET /admin/site/settings', 'PATCH /admin/site/settings']}
              />
            </RequireCan>
          }
        />

        <Route
          path="/profile"
          element={
            <PlaceholderPage
              title="个人资料"
              description="昵称 / 头像 / 邮箱，邮箱唯一，冲突返回 409 / code 3002。"
              endpoints={['GET /me/profile', 'PATCH /me/profile']}
            />
          }
        />
        <Route
          path="/profile/password"
          element={
            <PlaceholderPage
              title="修改密码"
              description="需校验旧密码；忘记密码由 admin 经重置端点兜底（v1 无邮件找回）。"
              endpoints={['POST /me/change-password']}
            />
          }
        />

        <Route path="/403" element={<ForbiddenPage />} />
        {/* 兜底放在主壳内：未登录时先被 RequireAuth 接走去登录页，
            已登录才真的看到「页面不存在」——两种情况的正确反馈本来就不同 */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </Suspense>
)

export { AppRoutes }
