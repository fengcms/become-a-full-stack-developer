import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '@/app/pinia'
import {
  canManageArticles,
  canManageCategories,
  canManageSiteSettings,
  canManageTags,
  canManageUsers,
  canModerateComments,
} from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    guestOnly?: boolean
    requiresAuth?: boolean
    consoleOnly?: boolean
    capability?: 'articles' | 'comments' | 'categories' | 'tags' | 'users' | 'site'
  }
}

const capabilityCheck = {
  articles: canManageArticles,
  comments: canModerateComments,
  categories: canManageCategories,
  tags: canManageTags,
  users: canManageUsers,
  site: canManageSiteSettings,
} as const

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      component: () => import('@/pages/login/LoginPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/no-access',
      component: () => import('@/pages/errors/NoAccessPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          component: () => import('@/pages/dashboard/DashboardPage.vue'),
          meta: { title: '仪表盘', consoleOnly: true },
        },
        {
          path: 'articles',
          component: () => import('@/pages/articles/ArticleListPage.vue'),
          meta: { title: '文章管理', consoleOnly: true, capability: 'articles' },
        },
        {
          path: 'articles/new',
          component: () => import('@/pages/articles/ArticleFormPage.vue'),
          meta: { title: '新建文章', consoleOnly: true, capability: 'articles' },
        },
        {
          path: 'articles/:id/edit',
          component: () => import('@/pages/articles/ArticleFormPage.vue'),
          meta: { title: '编辑文章', consoleOnly: true, capability: 'articles' },
        },
        {
          path: 'articles/:id/preview',
          component: () => import('@/pages/articles/ArticlePreviewPage.vue'),
          meta: { title: '文章预览', consoleOnly: true },
        },
        {
          path: 'comments',
          component: () => import('@/pages/comments/CommentListPage.vue'),
          meta: { title: '评论审核', consoleOnly: true, capability: 'comments' },
        },
        {
          path: 'categories',
          component: () => import('@/pages/categories/CategoryTreePage.vue'),
          meta: { title: '分类管理', consoleOnly: true, capability: 'categories' },
        },
        {
          path: 'tags',
          component: () => import('@/pages/tags/TagListPage.vue'),
          meta: { title: '标签管理', consoleOnly: true, capability: 'tags' },
        },
        {
          path: 'users',
          component: () => import('@/pages/users/UserListPage.vue'),
          meta: { title: '用户管理', consoleOnly: true, capability: 'users' },
        },
        {
          path: 'settings/site',
          component: () => import('@/pages/site/SiteSettingsPage.vue'),
          meta: { title: '站点设置', consoleOnly: true, capability: 'site' },
        },
        {
          path: 'profile',
          component: () => import('@/layouts/ProfileLayout.vue'),
          meta: { requiresAuth: true },
          children: [
            {
              path: '',
              component: () => import('@/pages/profile/ProfilePage.vue'),
              meta: { title: '个人资料' },
            },
            {
              path: 'password',
              component: () => import('@/pages/profile/ChangePasswordPage.vue'),
              meta: { title: '修改密码' },
            },
            {
              path: 'notifications',
              component: () => import('@/pages/profile/NotificationsPage.vue'),
              meta: { title: '我的通知' },
            },
            {
              path: 'likes',
              component: () => import('@/pages/profile/LikesPage.vue'),
              meta: { title: '我的点赞' },
            },
            {
              path: 'favorites',
              component: () => import('@/pages/profile/FavoritesPage.vue'),
              meta: { title: '我的收藏' },
            },
          ],
        },
        {
          path: '403',
          component: () => import('@/pages/errors/ForbiddenPage.vue'),
          meta: { title: '没有权限', consoleOnly: true },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/pages/errors/NotFoundPage.vue') },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore(pinia)
  const signedIn = Boolean(auth.accessToken && auth.user)
  if (to.meta.guestOnly && signedIn)
    return auth.user?.role === 'member' ? '/no-access' : '/dashboard'
  if (to.meta.requiresAuth && !signedIn)
    return { path: '/login', replace: true, state: { from: to.fullPath } }
  if (to.meta.consoleOnly && auth.user?.role === 'member') return '/no-access'
  if (to.meta.capability && !capabilityCheck[to.meta.capability](auth.user)) return '/403'
  return true
})

export default router
