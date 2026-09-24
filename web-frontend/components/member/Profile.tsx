/** @file Member settings, preserving field constraints and backend password semantics. */
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Failure, Skeleton } from '@/components/ui/Feedback'
import { changePassword, getMeProfile, updateMeProfile } from '@/lib/api/me'
import { useAuthStore } from '@/store/auth'
/** Account settings share navigation while keeping credential changes separate. */
export const Profile = ({ password = false }: { password?: boolean }) => {
  const user = useAuthStore((s) => s.user)
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const query = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: getMeProfile,
    enabled: !!user,
  })
  const update = useMutation({
    mutationFn: updateMeProfile,
    onSuccess: (data) => {
      useAuthStore.getState().setUser(data)
      client.setQueryData(['profile', user?.id], data)
      setMessage('资料已更新')
    },
    onError: (e) => setMessage(e.message),
  })
  const pwd = useMutation({
    mutationFn: changePassword,
    onSuccess: () => setMessage('密码已更新，请使用新密码重新登录。'),
    onError: (e) => setMessage(e.message),
  })
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setMessage('')
    if (password) {
      if (data.get('newPassword') !== data.get('confirm')) {
        setMessage('两次输入的新密码不一致')
        return
      }
      try {
        await pwd.mutateAsync({
          oldPassword: String(data.get('oldPassword')),
          newPassword: String(data.get('newPassword')),
        })
        form.reset()
        useAuthStore.getState().clear()
        client.clear()
        window.location.assign('/login?expired=1')
      } catch {
        /* mutation feedback is shown above */
      }
    } else
      update.mutate({
        nickname: String(data.get('nickname')).trim(),
        ...(String(data.get('email')).trim() ? { email: String(data.get('email')).trim() } : {}),
      })
  }
  return (
    <>
      <div className="intro">
        <h1>{password ? '修改密码' : '个人资料'}</h1>
        <p>{password ? '使用一个与其他网站不同的密码。' : '管理你的公开信息与账号资料。'}</p>
      </div>
      <nav className="tabs">
        <Link className={!password ? 'selected' : ''} href="/member/profile">
          基本资料
        </Link>
        <Link className={password ? 'selected' : ''} href="/member/password">
          修改密码
        </Link>
      </nav>
      {query.isPending ? (
        <Skeleton />
      ) : query.isError ? (
        <Failure
          retry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <div className="memberform">
          {!password && (
            <div className="profilehead">
              <div className="avatar large">{query.data.nickname.slice(0, 1)}</div>
              <div>
                <strong>{query.data.nickname}</strong>
                <p className="muted">{query.data.username}</p>
                <Link href={`/members/${query.data.id}`}>查看公开主页 →</Link>
              </div>
            </div>
          )}
          <form onSubmit={submit}>
            {password ? (
              <>
                <label className="field">
                  当前密码
                  <input
                    type="password"
                    name="oldPassword"
                    required
                    minLength={8}
                    autoComplete="current-password"
                  />
                </label>
                <label className="field">
                  新密码
                  <input
                    type="password"
                    name="newPassword"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <small>至少 8 位字符</small>
                </label>
                <label className="field">
                  确认新密码
                  <input
                    type="password"
                    name="confirm"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  用户名
                  <input disabled value={query.data.username} />
                  <small>用户名用于登录，无法修改。</small>
                </label>
                <label className="field">
                  昵称
                  <input
                    name="nickname"
                    required
                    maxLength={32}
                    defaultValue={query.data.nickname}
                  />
                </label>
                <label className="field">
                  邮箱
                  <input
                    type="email"
                    name="email"
                    maxLength={255}
                    defaultValue={query.data.email || ''}
                  />
                  <small>邮箱不在公开主页显示；留空保留原邮箱。</small>
                </label>
              </>
            )}
            {message && (
              <p className="hint" role="status">
                {message}
              </p>
            )}
            <button className="pbutton" disabled={update.isPending || pwd.isPending} type="submit">
              {update.isPending || pwd.isPending ? '正在保存…' : password ? '更新密码' : '保存修改'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
