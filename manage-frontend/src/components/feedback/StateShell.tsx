/**
 * @file src/components/feedback/StateShell.tsx
 * @description 通用状态页外壳：居中卡片 + 图标 + 标题 + 描述 + 操作区。
 *   三个错误页（无权限 / 403 / 不存在）共用它，只换内容与下一步动作。
 * @module manage-frontend/components/feedback
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'

/**
 * 状态页外壳。
 *
 * @param icon - 顶部状态图标。
 * @param title - 主标题。
 * @param description - 说明文案。
 * @param children - 操作区（按钮等）。
 */
export const StateShell = ({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) => (
  <div className="app-bg flex min-h-screen items-center justify-center p-6">
    <div className="animate-rise w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-6 flex justify-center gap-2">{children}</div>
    </div>
  </div>
)
