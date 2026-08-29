/**
 * @file src/components/form/SwitchField.tsx
 * @description 开关字段：RHF useController + Radix Switch。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * 开关字段。
 * @param control - RHF 控制对象。
 * @param name - 字段路径。
 * @param label - 标签。
 * @param description - 辅助说明。
 */
export const SwitchField = <T extends FieldValues>({
  control,
  name,
  label,
  description,
}: {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  description?: string
}) => {
  const { field } = useController({ control, name })
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        {label ? <Label>{label}</Label> : null}
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={!!field.value} onCheckedChange={field.onChange} />
    </div>
  )
}
