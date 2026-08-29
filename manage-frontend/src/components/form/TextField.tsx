/**
 * @file src/components/form/TextField.tsx
 * @description 文本输入字段：RHF useController 驱动 + FormField 布局。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { FormField } from './FormField'

/**
 * 文本输入字段。
 * @param control - RHF 控制对象（来自 useForm）。
 * @param name - 字段路径。
 * @param label - 标签。
 * @param type - input 类型。
 * @param placeholder - 占位符。
 * @param required - 必填。
 * @param description - 辅助说明。
 */
export const TextField = <T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  placeholder,
  required,
  description,
}: {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  type?: string
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
      <Input
        id={name}
        type={type}
        placeholder={placeholder}
        value={(field.value as string) ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        ref={field.ref}
      />
    </FormField>
  )
}
