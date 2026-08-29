/**
 * @file src/components/form/LogoUploadField.tsx
 * @description 站点 Logo 上传字段：受控组件，复用 useImageUpload 走 POST /upload 拿到
 *   已解析 URL（ORIGIN + /files/<key>）回填 logoUrl。替代计划中未实现的 F0.2 ImageUploadField。
 *   组件本身只负责「选图→上传→回填」，落库由父表单的 PATCH 提交统一完成（契约要求 logoUrl 先上传）。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import { X } from 'lucide-react'
import { type ChangeEvent, useRef } from 'react'
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useToast } from '@/hooks/useToast'
import { FormField } from './FormField'

/**
 * Logo 上传字段。
 * @param control - RHF 控制对象。
 * @param name - 字段路径（绑 logoUrl）。
 * @param label - 标签。
 * @param description - 辅助说明。
 */
export const LogoUploadField = <T extends FieldValues>({
  control,
  name,
  label = '站点 Logo',
  description,
}: {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  description?: string
}) => {
  const { field, fieldState } = useController({ control, name })
  const { upload, uploading } = useImageUpload()
  const { error: toastError } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const value = (field.value as string) ?? ''

  /** 选图即上传，拿到可访问 URL 回填（不落本地状态，受控于 RHF）。 */
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 允许再次选择同一文件
    e.target.value = ''
    if (!file) return
    try {
      const url = await upload(file)
      field.onChange(url)
    } catch (err) {
      toastError(err, 'Logo 上传失败')
    }
  }

  return (
    <FormField
      label={label}
      htmlFor={name}
      error={fieldState.error?.message}
      description={description}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            <img src={value} alt="logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">无</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? '上传中…' : value ? '更换' : '上传'}
            </Button>
            {value ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange('')}>
                <X className="mr-1 h-4 w-4" />
                移除
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">建议正方形透明 PNG，≤ 10MB</p>
        </div>
      </div>
    </FormField>
  )
}
