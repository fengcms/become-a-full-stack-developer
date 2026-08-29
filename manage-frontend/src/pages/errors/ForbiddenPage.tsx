/**
 * @file src/pages/errors/ForbiddenPage.tsx
 * @description 能进后台，但当前角色没有该页面对应的能力（403）。
 *   下一步动作是「返回上一页」或「回仪表盘」。
 * @module manage-frontend/pages/errors
 * @date 2026-08-29
 */

import { ArrowLeft, Ban } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { StateShell } from '@/components/feedback/StateShell'
import { Button } from '@/components/ui/button'

/** 能力不足（403）页。 */
const ForbiddenPage = () => {
  const navigate = useNavigate()
  return (
    <StateShell
      icon={<Ban className="size-6" aria-hidden />}
      title="没有访问该页面的权限"
      description="这个功能需要更高的角色权限。你可以返回上一页继续手头的工作，或联系管理员申请权限。"
    >
      <Button variant="outline" onClick={() => navigate(-1)}>
        <ArrowLeft />
        返回上一页
      </Button>
      <Button asChild variant="gradient">
        <Link to="/dashboard">回到仪表盘</Link>
      </Button>
    </StateShell>
  )
}

export default ForbiddenPage
