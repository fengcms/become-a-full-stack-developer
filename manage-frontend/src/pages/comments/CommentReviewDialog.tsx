/**
 * @file src/pages/comments/CommentReviewDialog.tsx
 * @description 评论审核置位对话框：三态切换 + 拒绝理由。
 *
 * 契约要点：自动流（发表评论）只产出 approved / rejected，`reviewing` 是人工复核兜底态，
 * 因此本对话框是 reviewing 的**唯一进出路径**。
 * 另外置为 approved 时后端会清空 rejectedReason，所以理由只在 rejected / reviewing 下有意义。
 * @module manage-frontend/pages/comments
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { SelectField, type SelectOption } from '@/components/form/SelectField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Comment, CommentStatus } from '@/types/common'

/** 表单校验 schema。reason 上限与契约 Comment.rejectedReason 的 200 字符对齐。 */
const schema = z.object({
  status: z.enum(['approved', 'rejected', 'reviewing']),
  reason: z.string().max(200, '理由不超过 200 字'),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/** 目标状态选项。带英文状态名，方便与契约 / 后端沟通时对齐口径。 */
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'approved', label: '通过（approved）' },
  { value: 'rejected', label: '拒绝（rejected）' },
  { value: 'reviewing', label: '待人工复核（reviewing）' },
]

/**
 * 评论审核对话框。
 * @param comment - 待审核评论；为 null 时弹窗关闭。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略，防误关）。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调，回传评论 id 与审核入参。
 */
export const CommentReviewDialog = ({
  comment,
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  comment: Comment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  onSubmit: (id: number, payload: { status: CommentStatus; reason?: string }) => void
}) => {
  const form = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { status: 'approved', reason: '' },
  })
  const reason = form.watch('reason')

  // 每次打开时按当前评论重置，否则上一条的输入会残留到这一条
  useEffect(() => {
    if (open && comment) {
      form.reset({ status: comment.status, reason: comment.rejectedReason ?? '' })
    }
  }, [open, comment, form])

  /** 提交：空理由不传给后端，避免写入空字符串。 */
  const handleSubmit = form.handleSubmit((values) => {
    if (!comment) return
    onSubmit(comment.id, {
      status: values.status,
      reason: values.reason.trim() || undefined,
    })
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>审核评论</DialogTitle>
          <DialogDescription>
            {comment ? `作者：${comment.userName ?? '匿名'} · #${comment.id}` : ''}
          </DialogDescription>
        </DialogHeader>

        {comment ? (
          <blockquote className="rounded-md border border-l-4 border-l-muted-foreground/40 bg-muted/40 p-3 text-sm">
            <p className="whitespace-pre-wrap break-words">{comment.content}</p>
            {comment.rejectedReason ? (
              <p className="mt-2 text-xs text-muted-foreground">
                历史理由：{comment.rejectedReason}
              </p>
            ) : null}
          </blockquote>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <SelectField
            control={form.control}
            name="status"
            label="目标状态"
            options={STATUS_OPTIONS}
            required
            description="置为「通过」时，后端会清空已有的拒绝理由"
          />
          <TextAreaField
            control={form.control}
            name="reason"
            label="拒绝理由"
            placeholder="仅在拒绝 / 待复核时有意义"
            description={`${reason.length}/200`}
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
              {loading ? '处理中…' : '提交审核'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
