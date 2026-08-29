/**
 * @file src/pages/errors/NoAccessPage.tsx
 * @description 角色不可进入管理后台（member）。下一步动作是「换个账号登录」。
 * @module manage-frontend/pages/errors
 * @date 2026-08-29
 */

import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { logout as logoutApi } from '@/api/auth'
import { StateShell } from '@/components/feedback/StateShell'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/config/roles'
import { useAuthStore } from '@/store/auth'

/** 角色不可进后台页。 */
const NoAccessPage = () => {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  /** 退出当前账号，回到登录页换一个有权限的账号。 */
  const handleSwitch = async () => {
    await logoutApi()
    navigate('/login', { replace: true })
  }

  return (
    <StateShell
      icon={<ShieldAlert className="size-6" aria-hidden />}
      title="当前账号无法进入管理后台"
      description={`账号角色为「${user ? ROLE_LABELS[user.role] : '会员'}」，在本系统里只有阅读与评论权限。需要管理内容请联系管理员将账号提升为编辑或管理员。`}
    >
      <Button variant="outline" onClick={handleSwitch}>
        <ArrowLeft />
        换个账号登录
      </Button>
    </StateShell>
  )
}

export default NoAccessPage
