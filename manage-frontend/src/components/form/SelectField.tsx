/**
 * @file src/components/form/SelectField.tsx
 * @description 下拉选择字段：RHF useController + Radix Select。options 为 {value,label}。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from './FormField'

/** 下拉选项。 */
export type SelectOption = { value: string; label: string; disabled?: boolean }

/**
 * 下拉选择字段。
 * @param control - RHF 控制对象。
 * @param name - 字段路径。
 * @param label - 标签。
 * @param options - 选项列表。
 * @param placeholder - 未选占位。
 * @param required - 必填。
 * @param description - 辅助说明。
 */
export const SelectField = <T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  required,
  description,
}: {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  description?: string
}) => {
  const { field, fieldState } = useController({ control, name })
  return (
    <FormField
      label={label}
      htmlFor={name}
      required={required}
      error={fieldState.error?.message}
      description={description}
    >
      <Select value={field.value == null ? '' : String(field.value)} onValueChange={field.onChange}>
        <SelectTrigger id={name}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
