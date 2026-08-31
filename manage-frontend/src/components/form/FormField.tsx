/**
 * @file src/components/form/FormField.tsx
 * @description 表单字段外壳：标签 + 控件 + 描述 + 错误文案的统一布局。供 TextField 等复用。
 *   布局：标签居左固定列（6rem，右对齐），控件居右占满剩余宽度；
 *   窄容器（<640px，如小弹窗）自动回退为上下堆叠，避免控件被挤成一条。
 * @module manage-frontend/components/form
 * @date 2026-08-31
 */

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * 表单字段外壳。
 * @param label - 字段标签。
 * @param htmlFor - 关联控件 id。
 * @param required - 是否必填（标签后标红 *）。
 * @param error - 错误文案。
 * @param description - 辅助说明。
 * @param children - 控件。
 */
export const FormField = ({
  label,
  htmlFor,
  required,
  error,
  description,
  children,
}: {
  label?: string
  htmlFor?: string
  required?: boolean
  error?: string
  description?: string
  children: ReactNode
}) => (
  <div className="grid items-start gap-1.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
    {label ? (
      <Label htmlFor={htmlFor} className="sm:mt-2.5 sm:text-right">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
    ) : null}
    {/* 无标签时控件也要落在第二列，保持与其他字段左对齐 */}
    <div className={cn('min-w-0 space-y-1.5', !label && 'sm:col-start-2')}>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  </div>
)
