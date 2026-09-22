/** @file Header account state; logout must finish server cookie revocation. */
'use client'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { logout } from '@/lib/api/auth'
import { useAuthStore } from '@/store/auth'
/** Header account controls keep a stable slot during bootstrap. */
export const UserMenu = () => {
  const { user, bootStatus, clear } = useAuthStore()
  const client = useQueryClient()
  const menu = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()
  useEffect(() => {
    if (pathname && menu.current) menu.current.open = false
  }, [pathname])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const exit = async () => {
    setPending(true)
    setError('')
    try {
      await logout()
      clear()
      client.clear()
      window.location.assign('/')
    } catch {
      setError('退出失败，请重试')
    } finally {
      setPending(false)
    }
  }
  if (bootStatus !== 'ready')
    return (
      <span className="authlinks auth-placeholder" role="status" aria-label="正在恢复登录状态" />
    )
  if (!user)
    return (
      <div className="authlinks">
        <Link href="/login">登录</Link>
        <span> / </span>
        <Link href="/register">注册</Link>
      </div>
    )
  return (
    <details className="account-menu" ref={menu}>
      <summary>{user.nickname || user.username} ▾</summary>
      <div className="drop">
        <Link href="/member/favorites">会员中心</Link>
        <Link href="/member/notifications">通知中心</Link>
        <Link href="/member/profile">个人资料</Link>
        <button type="button" className="textbutton" disabled={pending} onClick={exit}>
          {pending ? '正在退出…' : '退出登录'}
        </button>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
