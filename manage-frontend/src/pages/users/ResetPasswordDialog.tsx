/**
 * @file src/pages/users/ResetPasswordDialog.tsx
 * @description 管理员重置密码弹窗（admin 专属）。POST /admin/users/{id}/reset-password。
 *
 * ⚠️ 与计划文档的差异：计划写「重置后返回一次性凭证（等宽加粗 + 自动复制）」，
 *   但契约 `AdminResetPasswordRequest` **要求 admin 主动填新密码**（minLength 8），
 *   响应不返回任何凭证——新密码由 admin 线下告知用户。故本弹窗是输入新密码，不是展示凭证。
 * @module manage-frontend/pages/users
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import type { User } from '@/types/common'

/** 表单 schema。 */
const schema = z
  .object({
    newPassword: z.string().min(8, '新密码至少 8 位'),
    confirm: z.string().min(1, '请再次输入新密码'),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: '两次输入的密码不一致',
    path: ['confirm'],
  })

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/**
 * 重置密码弹窗。
 * @param user - 目标用户；null 表示关闭。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略）。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调（id + 新密码）。
 */
export const ResetPasswordDialog = ({
  user,
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  onSubmit: (id: number, newPassword: string) => void
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
  })

  useEffect(() => {
    if (open) form.reset({ newPassword: '', confirm: '' })
  }, [open, form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!user) return
    onSubmit(user.id, values.newPassword)
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>重置密码 · {user?.username ?? ''}</DialogTitle>
          <DialogDescription>
            为忘记密码的用户设置新密码（v1 无邮件找回，此端点为唯一兜底）。新密码至少 8 位，
            设置后请线下告知该用户——重置会作废其全部刷新令牌。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            control={form.control}
            name="newPassword"
            label="新密码"
            type="password"
            placeholder="至少 8 位"
          />
          <TextField
            control={form.control}
            name="confirm"
            label="确认新密码"
            type="password"
            placeholder="再次输入"
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
              {loading ? '重置中…' : '重置密码'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
