/**
 * @file src/App.tsx
 * @description 应用根组件。只做三件跨路由的事：会话引导、全局 401 兜底、全局 toast 容器。
 *   具体页面一概不在这里露面。
 * @module manage-frontend
 * @date 2026-08-29
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { bootstrapSession, setUnauthorizedHandler } from '@/lib/request'
import { AppRoutes } from '@/router'

/**
 * 应用根组件。挂载时注册会话引导与全局 401 兜底，渲染路由表与 toast 容器。
 */
const App = () => {
  const navigate = useNavigate()

  // 会话引导：刷新页面后内存令牌已丢，靠后端写的 HttpOnly Cookie 静默换一次令牌。
  // 失败是正常路径（首次访问），不提示、不跳转，只让守卫拿到确定的结论。
  useEffect(() => {
    void bootstrapSession()
  }, [])

  // 全局 401 兜底。放在根组件而不是布局里：登录页外的任何位置触发失效都能接住。
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      toast.error(
        reason === 'disabled' ? '账号已被禁用，请联系管理员' : '登录状态已失效，请重新登录',
      )
      navigate('/login', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate])

  return (
    <>
      <AppRoutes />
      <Toaster position="top-center" richColors closeButton />
    </>
  )
}

export default App
