/**
 * @file app/member/profile/page.tsx
 * @description 个人资料页：查看/编辑资料 + 修改密码。
 *   客户端组件：表单交互 + 鉴权请求。
 * @module web-frontend/app/member
 * @date 2026-09-17
 */

'use client'

import { useEffect, useState } from 'react'
import { changePassword, getMeProfile, type User, updateMeProfile } from '@/lib/api/me'
import { isApiError } from '@/lib/request'
import { useAuthStore } from '@/store/auth'

const ProfilePage = () => {
  const setUser = useAuthStore((s) => s.setUser)
  const [user, setLocalUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // 修改密码
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    getMeProfile()
      .then((u) => {
        setLocalUser(u)
        setNickname(u.nickname)
        setEmail(u.email ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const updated = await updateMeProfile({ nickname, email })
      setLocalUser(updated)
      setUser(updated)
      setMessage('资料已更新')
    } catch (err) {
      setMessage(isApiError(err) ? err.message : '更新失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdError('')
    if (newPassword !== confirmPassword) {
      setPwdError('两次输入的新密码不一致')
      return
    }
    setPwdSaving(true)
    try {
      await changePassword({ oldPassword, newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwdError('密码已修改')
    } catch (err) {
      setPwdError(isApiError(err) ? err.message : '修改失败，请重试')
    } finally {
      setPwdSaving(false)
    }
  }

  if (loading) {
    return <div className="text-ink-faint">加载中…</div>
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">个人资料</h1>
        <form onSubmit={handleSaveProfile} className="max-w-md space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-ink-soft">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={user?.username ?? ''}
              disabled
              className="w-full rounded border border-line bg-hover px-3 py-2 text-ink-faint"
            />
          </div>
          <div>
            <label htmlFor="nickname" className="mb-1.5 block text-sm font-medium text-ink-soft">
              昵称
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
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
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>
          {message && <p className="text-sm text-ink-soft">{message}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-accent px-4 py-2 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存修改'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-6 text-xl font-semibold tracking-tight">修改密码</h2>
        <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
          <div>
            <label htmlFor="oldPassword" className="mb-1.5 block text-sm font-medium text-ink-soft">
              当前密码
            </label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-ink-soft">
              新密码
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-ink-soft"
            >
              确认新密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>
          {pwdError && <p className="text-sm text-ink-soft">{pwdError}</p>}
          <button
            type="submit"
            disabled={pwdSaving}
            className="rounded bg-accent px-4 py-2 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pwdSaving ? '修改中…' : '修改密码'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default ProfilePage
