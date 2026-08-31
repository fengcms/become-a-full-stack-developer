/**
 * @file src/components/form/ImageUploadField.tsx
 * @description 通用图片上传字段（受控）。由 Phase 6 的 LogoUploadField 泛化而来——
 *   审阅第四轮报告 R-留意「F0.2 悬空」明确指出：站点 Logo 是首个场景，
 *   一旦个人中心出现头像（第二个场景）就该泛化为通用件避免重复造轮子。本件即该泛化。
 *
 * 能力：选图即上传（复用 useImageUpload 走 POST /upload 拿已解析 URL）、回填受控值、预览（方/圆两种）、
 * 移除、上传中态、错误 toast。落库由父表单的提交统一完成（契约要求先上传拿可访问地址再存）。
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

/** 预览形状：square=方角（Logo/封面），circle=圆形（头像）。 */
type Shape = 'square' | 'circle'

/**
 * 通用图片上传字段。
 * @param control - RHF 控制对象。
 * @param name - 字段路径（绑 URL 字符串）。
 * @param label - 标签。
 * @param description - 辅助说明。
 * @param accept - 文件选择器 accept（默认 image/*）。
 * @param shape - 预览形状（默认 square）。
 * @param hint - 预览下方的提示文案。
 */
export const ImageUploadField = <T extends FieldValues>({
  control,
  name,
  label = '图片',
  description,
  accept = 'image/*',
  shape = 'square',
  hint = '建议 ≤ 10MB',
}: {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  description?: string
  accept?: string
  shape?: Shape
  hint?: string
}) => {
  const { field, fieldState } = useController({ control, name })
  const { upload, uploading } = useImageUpload()
  const { error: toastError } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const value = (field.value as string) ?? ''

  /** 选图即上传，拿到可访问 URL 回填（不落本地状态，受控于 RHF）。 */
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许再次选择同一文件
    if (!file) return
    try {
      const url = await upload(file)
      field.onChange(url)
    } catch (err) {
      toastError(err, '图片上传失败')
    }
  }

  const previewCls = shape === 'circle' ? 'rounded-full' : 'rounded-md'

  return (
    <FormField
      label={label}
      htmlFor={name}
      error={fieldState.error?.message}
      description={description}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-16 w-16 items-center justify-center overflow-hidden border bg-muted ${previewCls}`}
        >
          {value ? (
            <img src={value} alt={label} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">无</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onPick} />
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
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </FormField>
  )
}
