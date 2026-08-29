/**
 * @file src/components/layout/PageHeader.tsx
 * @description 页头组件：标题 + 说明 + 右侧操作区。所有业务页统一用它，避免各页自己拼字号。
 * @module manage-frontend/components/layout
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'

/**
 * 页面统一页头。
 * @param title - 页面标题。
 * @param description - 副标题 / 说明，可空。
 * @param actions - 右侧操作区（按钮等），可空。
 */
export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
)
