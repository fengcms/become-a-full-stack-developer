/**
 * @file src/pages/comments/CommentReplyDialog.tsx
 * @description 代回复对话框：editor / admin 以官方身份回复某条评论。
 *
 * 契约：前台与官方回复共用同一条发表路径 `POST /articles/{idOrSlug}/comments`（member+），
 * 因此回复同样会过敏感词过滤——返回值可能带 rejected 状态。契约对此有明确要求：
 * 「前端应就地提示且**不要插入列表**」（该条不会出现在后续 GET 列表中，属预期）。
 * `useReplyComment` 已按 status 分支给出不同提示，这里不做乐观插入。
 * @module manage-frontend/pages/comments
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import type { Comment } from '@/types/common'

/** 表单校验 schema。content 上限与契约 Comment.content 的 2000 字符对齐。 */
const schema = z.object({
  content: z.string().min(1, '回复内容必填').max(2000, '回复最多 2000 字'),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/**
 * 代回复对话框。
 * @param comment - 被回复的评论；为 null 时弹窗关闭。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略）。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调，回传文章 id、内容、父楼 id。
 */
export const CommentReplyDialog = ({
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
  onSubmit: (articleId: number, content: string, parentId: number) => void
}) => {
  const form = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { content: '' },
  })
  const content = form.watch('content')

  // 每次打开清空上一次的输入
  useEffect(() => {
    if (open) form.reset({ content: '' })
  }, [open, form])

  /** 提交。 */
  const handleSubmit = form.handleSubmit((values) => {
    if (!comment) return
    onSubmit(comment.articleId, values.content.trim(), comment.id)
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>回复评论</DialogTitle>
          <DialogDescription>
            {comment ? `以官方身份回复 ${comment.userName ?? '匿名'}（#${comment.id}）` : ''}
          </DialogDescription>
        </DialogHeader>

        {comment ? (
          <blockquote className="rounded-md border border-l-4 border-l-muted-foreground/40 bg-muted/40 p-3 text-sm">
            <p className="whitespace-pre-wrap break-words">{comment.content}</p>
          </blockquote>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextAreaField
            control={form.control}
            name="content"
            label="回复内容"
            placeholder="输入回复内容…"
            required
            description={`${content.length}/2000 · 内容会经过敏感词过滤`}
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
              {loading ? '发布中…' : '发布回复'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
