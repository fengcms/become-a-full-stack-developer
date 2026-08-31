/**
 * @file src/pages/profile/ChangePasswordPage.tsx
 * @description 修改密码（member）。POST /me/change-password，需旧密码。
 *   新密码 ≥8 位；提交后作废该用户全部 refreshToken（其它设备重登）。
 *   忘记旧密码时 v1 唯一兜底是 admin 重置（后端端点），本页不处理。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useChangePassword } from '@/hooks/useMe'
import type { ChangePasswordRequest } from '@/types/common'

/** 表单 schema：旧密码 + 新密码（均 ≥8 位）。 */
const schema = z
  .object({
    oldPassword: z.string().min(8, '旧密码至少 8 位'),
    newPassword: z.string().min(8, '新密码至少 8 位'),
    confirm: z.string().min(1, '请再次输入新密码'),
  })
  .refine((v) => v.newPassword === v.confirm, { message: '两次输入不一致', path: ['confirm'] })

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/** 修改密码页。 */
const ChangePasswordPage = () => {
  const change = useChangePassword()
  const form = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { oldPassword: '', newPassword: '', confirm: '' },
  })

  /** 提交：只传 old/new（confirm 仅前端校验，不送后端）。
   *  成功/失败反馈由 useChangePassword 统一 toast。 */
  const onSubmit = (values: FormValues) => {
    const payload: ChangePasswordRequest = {
      oldPassword: values.oldPassword,
      newPassword: values.newPassword,
    }
    change.mutate(payload, { onSuccess: () => form.reset() })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>需校验旧密码；新密码至少 8 位。修改后其它设备将退出登录。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="max-w-xl space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <TextField
            control={form.control}
            name="oldPassword"
            label="旧密码"
            type="password"
            placeholder="••••••••"
          />
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
            placeholder="再次输入新密码"
          />
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? '提交中…' : '修改密码'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default ChangePasswordPage
