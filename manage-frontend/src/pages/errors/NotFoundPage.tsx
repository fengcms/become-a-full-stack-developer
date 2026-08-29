/**
 * @file src/pages/errors/NotFoundPage.tsx
 * @description 路由不存在（*）。下一步动作是「回仪表盘」。
 * @module manage-frontend/pages/errors
 * @date 2026-08-29
 */

import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StateShell } from '@/components/feedback/StateShell'
import { Button } from '@/components/ui/button'

/** 页面不存在（404）页。 */
const NotFoundPage = () => (
  <StateShell
    icon={<FileQuestion className="size-6" aria-hidden />}
    title="页面不存在"
    description="地址可能拼错了，或者这个页面已经被移除。"
  >
    <Button asChild variant="gradient">
      <Link to="/dashboard">回到仪表盘</Link>
    </Button>
  </StateShell>
)

export default NotFoundPage
