/**
 * @file components/auth/AuthProvider.tsx
 * @description 认证上下文：启动时静默恢复会话 + 注册全局未授权跳转。
 *   客户端组件，在根布局挂载一次。
 * @module web-frontend/components/auth
 * @date 2026-09-17
 */

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { bootstrapSession, setUnauthorizedHandler } from '@/lib/request'
import { useAuthStore } from '@/store/auth'

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const pathname = usePathname()
  const setBootStatus = useAuthStore((s) => s.setBootStatus)

  useEffect(() => {
    // 注册未授权回调：跳登录页并携带回跳地址
    setUnauthorizedHandler(() => {
      const redirect = encodeURIComponent(pathname)
      router.push(`/login?redirect=${redirect}`)
    })
    // 启动时静默恢复会话
    bootstrapSession().finally(() => setBootStatus('ready'))
    return () => setUnauthorizedHandler(null)
  }, [pathname, router, setBootStatus])

  return <>{children}</>
}

export default AuthProvider
