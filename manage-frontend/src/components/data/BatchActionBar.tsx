/**
 * @file src/components/data/BatchActionBar.tsx
 * @description T6 批量操作工具条：选中行数 > 0 时浮于表格上方，提供批量动作与清空选择。
 *   选择态由页面受控，本组件只负责渲染与回调，不持有业务 mutation。
 * @module manage-frontend/components/data
 * @date 2026-08-29
 */

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 单个批量动作。 */
export interface BatchAction {
  label: string
  onClick: () => void
  /** 按钮变体，危险操作传 'destructive'。 */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary'
  /** 进行中禁用（如批量请求未结束）。 */
  disabled?: boolean
}

/**
 * 批量操作工具条。
 * @param count - 已选行数；为 0 时不渲染。
 * @param actions - 批量动作列表。
 * @param onClear - 清空选择回调。
 */
export const BatchActionBar = ({
  count,
  actions,
  onClear,
  className,
}: {
  count: number
  actions: BatchAction[]
  onClear: () => void
  className?: string
}) => {
  if (count === 0) return null
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5',
        className,
      )}
    >
      <span className="shrink-0 text-sm font-medium text-foreground">已选 {count} 项</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            type="button"
            size="sm"
            variant={a.variant ?? 'default'}
            disabled={a.disabled}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={onClear} aria-label="取消选择">
        <X className="size-4" />
        取消
      </Button>
    </div>
  )
}
