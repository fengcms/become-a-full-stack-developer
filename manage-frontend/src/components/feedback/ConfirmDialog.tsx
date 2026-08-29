/**
 * @file src/components/feedback/ConfirmDialog.tsx
 * @description 两阶段确认弹窗（删除 / 状态变更等危险操作）。受控组件：open/onOpenChange 由调用方管理。
 *   危险操作在 loading 期间禁止背景关闭与 Esc 关闭，避免误操作。
 * @module manage-frontend/components/feedback
 * @date 2026-08-29
 */

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * 两阶段确认弹窗。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（loading 时忽略，防误关）。
 * @param title - 标题。
 * @param description - 说明文案。
 * @param confirmText - 确认按钮文案。
 * @param cancelText - 取消按钮文案。
 * @param confirmVariant - 确认按钮样式（默认 destructive）。
 * @param loading - 提交中：禁用按钮并禁止关闭。
 * @param onConfirm - 确认回调。
 * @param children - 弹窗正文（如二次确认输入）。
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  confirmVariant = 'destructive',
  loading = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  confirmVariant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'gradient'
  loading?: boolean
  onConfirm: () => void
  children?: ReactNode
}) => (
  <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
    <DialogContent
      onEscapeKeyDown={(e) => loading && e.preventDefault()}
      onInteractOutside={(e) => loading && e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
          {loading ? '处理中…' : confirmText}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
