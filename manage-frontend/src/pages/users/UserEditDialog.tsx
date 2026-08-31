/**
 * @file src/pages/users/UserEditDialog.tsx
 * @description 用户编辑弹窗（admin 专属）。PATCH /users/{id} 改角色 / 状态 / 会员等级。
 *
 * 安全护栏：当前登录的 admin 不允许把自己「禁用」——禁用即无法登录/刷新，等于自锁后台。
 * 因此编辑自身时，状态下拉去掉 disabled 选项并附带说明。
 * @module manage-frontend/pages/users
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { UserUpdate } from '@/api/users'
import { SelectField } from '@/components/form/SelectField'
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
import { ROLE_LABELS } from '@/config/roles'
import { useAuthStore } from '@/store/auth'
import type { User, UserRole, UserStatus } from '@/types/common'

/** 角色选项。 */
const ROLE_OPTIONS = (['admin', 'editor', 'member'] as UserRole[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}))

/** 表单 schema。 */
const schema = z.object({
  role: z.enum(['admin', 'editor', 'member']),
  status: z.enum(['active', 'disabled']),
  // level 用 string 收口，提交时转 number；字段级校验用 .regex（与 CategoryFormDialog 同法，避免 .refine 破坏 zodResolver 泛型）
  level: z.string().regex(/^(?:[1-9]\d?|99)$/, '等级须为 1~99 的整数'),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/**
 * 用户编辑弹窗。
 * @param user - 被编辑用户；null 表示关闭。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略）。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调（id + 变更字段）。
 */
export const UserEditDialog = ({
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
  onSubmit: (id: number, payload: UserUpdate) => void
}) => {
  const currentUser = useAuthStore((s) => s.user)
  const isSelf = !!user && currentUser?.id === user.id

  // 编辑自身时禁止「禁用」，避免自锁后台
  const statusOptions = useMemo(
    () =>
      (['active', 'disabled'] as UserStatus[]).map((s) => ({
        value: s,
        label: s === 'active' ? '启用' : '禁用',
        disabled: s === 'disabled' && isSelf,
      })),
    [isSelf],
  )

  const form = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { role: 'member', status: 'active', level: '1' },
  })

  // 打开时回填当前用户字段
  useEffect(() => {
    if (open && user) {
      form.reset({ role: user.role, status: user.status, level: String(user.level ?? 1) })
    }
  }, [open, user, form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!user) return
    onSubmit(user.id, { role: values.role, status: values.status, level: Number(values.level) })
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>编辑用户 · {user?.username ?? ''}</DialogTitle>
          <DialogDescription>
            角色 member→editor 为晋升；status=disabled 即封号（无法登录/刷新，公开主页 404）。
            {isSelf ? ' 你正在编辑自己的账号，禁用选项已锁定以防自锁。' : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SelectField control={form.control} name="role" label="角色" options={ROLE_OPTIONS} />
          <SelectField
            control={form.control}
            name="status"
            label="状态"
            options={statusOptions}
            description="禁用后该用户无法登录"
          />
          <TextField
            control={form.control}
            name="level"
            label="会员等级"
            type="number"
            description="仅展示用，无业务功能，默认 1"
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
