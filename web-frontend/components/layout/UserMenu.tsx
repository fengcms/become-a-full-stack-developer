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
import { useEffect, useState } from 'react'
import { logout } from '@/lib/api/auth'
import { getUnreadCount } from '@/lib/api/me'
import { useAuthStore } from '@/store/auth'

const UserMenu = () => {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) {
      setUnread(0)
      return
    }
    getUnreadCount()
      .then(({ count }) => setUnread(count))
      .catch(() => setUnread(0))
    // 每 60s 轮询一次未读数
    const timer = setInterval(() => {
      getUnreadCount()
        .then(({ count }) => setUnread(count))
        .catch(() => setUnread(0))
    }, 60000)
    return () => clearInterval(timer)
  }, [user])

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
      <Link
        href="/member/notifications"
        className="relative text-ink-soft transition-colors hover:text-accent"
        aria-label="通知"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
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
