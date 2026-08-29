/**
 * @file src/components/form/FormField.tsx
 * @description 表单字段外壳：标签 + 控件 + 描述 + 错误文案的统一布局。供 TextField 等复用。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

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
  <div className="space-y-1.5">
    {label ? (
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
    ) : null}
    {children}
    {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
  </div>
)
