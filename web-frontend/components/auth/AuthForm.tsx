/** @file Real login/register forms with local validation and safe return URLs. */
'use client'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { login, register } from '@/lib/api/auth'
import { safeReturn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
/** Only credential responses from the backend establish a session. */
export const AuthForm = ({
  mode,
  siteName,
  redirect,
  expired = false,
}: {
  mode: 'login' | 'register'
  siteName: string
  redirect?: string
  expired?: boolean
}) => {
  const reg = mode === 'register'
  const router = useRouter()
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setError('')
    const password = String(data.get('password'))
    if (reg && password !== data.get('confirm')) {
      setError('两次输入的密码不一致')
      return
    }
    setPending(true)
    try {
      const username = String(data.get('username')).trim()
      const result = reg
        ? await register({
            username,
            password,
            email: String(data.get('email')),
            nickname: String(data.get('nickname')) || undefined,
          })
        : await login({ username, password })
      client.clear()
      useAuthStore.getState().clear()
      useAuthStore.getState().setSession(result)
      router.replace(safeReturn(redirect))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂时无法完成，请重试')
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="loginlayout">
      <section className="loginintro">
        <span className="eyebrow">{siteName}</span>
        <h2>
          每一次阅读，
          <br />
          都离完整的作品更近。
        </h2>
        <p>收藏值得反复阅读的文章，记录你的学习过程。</p>
        <div className="benefit">01　保存感兴趣的文章</div>
        <div className="benefit">02　找回最近的阅读记录</div>
        <div className="benefit">03　与作者和读者交流</div>
      </section>
      <section className="formpanel">
        <h1>{reg ? '注册会员' : '欢迎回来'}</h1>
        <p className="muted">{reg ? '创建账号，开始你的学习记录。' : '登录后，继续上次的阅读。'}</p>
        {expired && <p className="hint">登录已失效，请重新登录。</p>}
        <form onSubmit={submit}>
          <label className="field">
            用户名
            <input
              name="username"
              required
              maxLength={32}
              autoComplete="username"
              placeholder={reg ? '设置用户名' : '请输入用户名'}
            />
          </label>
          {reg && (
            <>
              <label className="field">
                邮箱
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={255}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="field">
                昵称 <small>选填，作为公开显示名称</small>
                <input
                  name="nickname"
                  maxLength={32}
                  autoComplete="nickname"
                  placeholder="希望大家如何称呼你"
                />
              </label>
            </>
          )}
          <label className="field">
            密码
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={reg ? 'new-password' : 'current-password'}
              placeholder={reg ? '至少 8 位字符' : '请输入密码'}
            />
          </label>
          {reg && (
            <label className="field">
              确认密码
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="再次输入密码"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="pbutton full" type="submit" disabled={pending}>
            {pending ? '正在处理…' : reg ? '创建账号' : '登录'}
          </button>
        </form>
        <p className="formnote">
          {reg ? '已有账号？' : '还没有账号？'}{' '}
          <Link
            href={`/${reg ? 'login' : 'register'}${redirect ? `?redirect=${encodeURIComponent(safeReturn(redirect))}` : ''}`}
          >
            {reg ? '去登录' : '立即注册'}
          </Link>
        </p>
        <p className="formnote">
          <Link href="/">先随便看看 →</Link>
        </p>
      </section>
    </div>
  )
}
