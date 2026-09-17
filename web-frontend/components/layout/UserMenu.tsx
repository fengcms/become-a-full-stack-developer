/**
 * @file components/layout/UserMenu.tsx
 * @description 页头用户菜单：未登录显示登录/注册；已登录显示昵称 + 会员中心 + 登出。
 *   客户端组件：读取 Zustand 会话状态。
 * @module web-frontend/components/layout
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { logout } from '@/lib/api/auth'
import { useAuthStore } from '@/store/auth'

const UserMenu = () => {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // 忽略登出接口错误，仍清本地会话
    }
    clear()
    router.push('/')
    router.refresh()
  }

  if (!user) {
    return (
      <div className="flex items-center gap-4">
        <Link href="/login" className="text-sm text-ink-soft no-underline hover:text-accent">
          登录
        </Link>
        <Link
          href="/register"
          className="rounded border border-accent px-3 py-1 text-sm text-accent no-underline transition-colors hover:bg-accent hover:text-surface"
        >
          注册
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <Link href="/member/profile" className="text-sm text-ink-soft no-underline hover:text-accent">
        {user.nickname}
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="text-sm text-ink-faint transition-colors hover:text-accent"
      >
        登出
      </button>
    </div>
  )
}

export default UserMenu
