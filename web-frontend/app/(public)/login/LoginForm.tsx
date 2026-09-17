/**
 * @file app/(public)/login/LoginForm.tsx
 * @description 登录表单：客户端交互。
 * @module web-frontend/app/(public)/login
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { login } from '@/lib/api/auth'
import { isApiError } from '@/lib/request'
import { useAuthStore } from '@/store/auth'

const LoginForm = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login({ username, password })
      setSession({ accessToken: result.accessToken, user: result.user })
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/')
      router.refresh()
    } catch (err) {
      setError(isApiError(err) ? err.message : '登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-lg border border-line bg-surface p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">登录</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-ink-soft">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-soft">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2.5 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-faint">
          还没有账号？
          <Link href="/register" className="ml-1 text-accent no-underline hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginForm
