/**
 * @file src/pages/tags/TagFormDialog.tsx
 * @description 标签新建 / 编辑表单（契约 `POST/PUT /tags`，字段仅 name + slug）。
 *
 * 同样不做「名称自动生成 slug」：中文标签名转不出合法 slug
 * （契约正则 `^[a-z0-9-]{1,64}$`），自动生成只会产出空串。
 * @module manage-frontend/pages/tags
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { TagUpsert } from '@/api/tags'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Tag } from '@/types/common'

/** slug 规则与契约 `Tag.slug` 的 pattern 一致。 */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/

/** 表单校验 schema。 */
const schema = z.object({
  name: z.string().min(1, '名称必填').max(50, '名称最多 50 字'),
  slug: z
    .string()
    .min(1, 'slug 必填')
    .max(64, 'slug 最多 64 字符')
    .regex(SLUG_PATTERN, 'slug 只能含小写字母、数字与连字符'),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/**
 * 标签表单弹窗。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略）。
 * @param tag - 编辑态标签；null 表示新建。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调。
 */
export const TagFormDialog = ({
  open,
  onOpenChange,
  tag,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag: Tag | null
  loading: boolean
  onSubmit: (payload: TagUpsert) => void
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
  })

  useEffect(() => {
    if (!open) return
    form.reset({ name: tag?.name ?? '', slug: tag?.slug ?? '' })
  }, [open, tag, form])

  /** 提交。 */
  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({ name: values.name.trim(), slug: values.slug.trim() })
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{tag ? '编辑标签' : '新建标签'}</DialogTitle>
          <DialogDescription>slug 全局唯一，重复会得到 409。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            control={form.control}
            name="name"
            label="名称"
            required
            placeholder="如：React"
          />
          <TextField
            control={form.control}
            name="slug"
            label="Slug"
            required
            placeholder="react"
            description="只能含小写字母 / 数字 / 连字符，全局唯一"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
