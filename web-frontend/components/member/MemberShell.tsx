/** @file Member navigation and login guard, preserving the requested return path. */
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/Feedback'
import { useAuthStore } from '@/store/auth'

const nav = [
  ['favorites', '我的收藏'],
  ['history', '阅读历史'],
  ['likes', '我的点赞'],
  ['articles', '我的文章'],
  ['notifications', '通知中心'],
  ['profile', '个人资料'],
]
/** Do not issue private page queries before session restoration completes. */
export const MemberShell = ({ children }: { children: React.ReactNode }) => {
  const { user, bootStatus } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (bootStatus === 'ready' && !user)
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
  }, [user, bootStatus, pathname, router])
  if (bootStatus !== 'ready' || !user) return <Skeleton />
  const writing = /^\/member\/articles\/(new|\d+\/(edit|preview))$/.test(pathname)
  return (
    <>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>会员中心</span>
      </div>
      <div className={writing ? 'member-writing' : 'membergrid'}>
        <aside className="memberside" hidden={writing}>
          <div className="memberidentity">
            <div className="avatar">{user.nickname?.slice(0, 1) || '读'}</div>
            <div>
              <strong>{user.nickname || user.username}</strong>
              <small>
                {user.role === 'admin' ? '管理员' : user.role === 'editor' ? '编辑' : '普通会员'}
              </small>
            </div>
          </div>
          <nav className="membernav" aria-label="会员中心">
            {nav.map(([path, name]) => (
              <Link
                href={`/member/${path}`}
                key={path}
                className={
                  pathname === `/member/${path}` ||
                  (path === 'articles' && pathname.startsWith('/member/articles/')) ||
                  (path === 'profile' && pathname === '/member/password')
                    ? 'selected'
                    : ''
                }
              >
                {name}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="membercontent">{children}</section>
      </div>
    </>
  )
}
