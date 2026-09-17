/**
 * @file app/(public)/register/page.tsx
 * @description 注册页：新会员注册，成功后自动登录并跳转。
 *   客户端组件：表单交互 + 会话写入。
 * @module web-frontend/app/(public)
 * @date 2026-09-17
 */

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { register } from '@/lib/api/auth'
import { isApiError } from '@/lib/request'
import { useAuthStore } from '@/store/auth'

const RegisterPage = () => {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await register({
        username,
        email,
        password,
        nickname: nickname || undefined,
      })
      // 注册成功直接写入会话（register 返回 AuthResult）
      setSession({ accessToken: result.accessToken, user: result.user })
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(isApiError(err) ? err.message : '注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-lg border border-line bg-surface p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">注册</h1>

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
              minLength={3}
              autoComplete="username"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-soft">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="nickname" className="mb-1.5 block text-sm font-medium text-ink-soft">
              昵称 <span className="text-ink-faint">（可选）</span>
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2.5 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '注册中…' : '注册'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-faint">
          已有账号？
          <Link href="/login" className="ml-1 text-accent no-underline hover:underline">
            返回登录
          </Link>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage
