/**
 * @file components/auth/AuthGuard.tsx
 * @description 登录守卫：未登录时跳转登录页，已登录渲染子内容。
 *   客户端组件，用于 (member) 路由组布局。
 * @module web-frontend/components/auth
 * @date 2026-09-17
 */

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const pathname = usePathname()
  const accessToken = useAuthStore((s) => s.accessToken)
  const bootStatus = useAuthStore((s) => s.bootStatus)

  useEffect(() => {
    // 等启动探测完成再判断，避免刷新后误判未登录
    if (bootStatus === 'ready' && !accessToken) {
      const redirect = encodeURIComponent(pathname)
      router.replace(`/login?redirect=${redirect}`)
    }
  }, [accessToken, bootStatus, pathname, router])

  // 启动中或未登录时不渲染内容
  if (bootStatus !== 'ready' || !accessToken) {
    return null
  }

  return <>{children}</>
}

export default AuthGuard
