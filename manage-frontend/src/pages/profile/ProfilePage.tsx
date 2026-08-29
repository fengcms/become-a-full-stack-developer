/**
 * @file src/pages/profile/ProfilePage.tsx
 * @description 个人资料编辑（member）。GET /me/profile 回填，PATCH /me/profile 局部更新
 *   昵称 / 头像 / 邮箱。头像走通用 ImageUploadField（circle 预览）。
 *   邮箱唯一：冲突后端返 409 / code 3002，由 hook toast 提示，不静默覆盖。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ImageUploadField } from '@/components/form/ImageUploadField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useMyProfile, useUpdateProfile } from '@/hooks/useMe'
import type { ProfileUpdateRequest, User } from '@/types/common'

/** 表单 schema：昵称/邮箱/头像。头像可空。 */
const schema = z.object({
  nickname: z.string().trim().max(32, '昵称最多 32 字'),
  email: z.string().trim().email('邮箱格式不正确').max(255, '邮箱过长'),
  avatar: z.string().max(512, '头像地址异常').nullable().optional(),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/** 后端 User → 表单值。 */
const toFormValues = (u: User): FormValues => ({
  nickname: u.nickname ?? '',
  email: u.email ?? '',
  avatar: u.avatar ?? null,
})

/** 个人资料页。 */
const ProfilePage = () => {
  const profile = useMyProfile()
  const update = useUpdateProfile()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nickname: '', email: '', avatar: null },
  })

  useEffect(() => {
    if (profile.data) form.reset(toFormValues(profile.data))
  }, [profile.data, form])

  /** 提交：只传这三项（PATCH 局部更新）。空头像传 null 由后端清空。
   *  成功/失败反馈由 useUpdateProfile 统一 toast，本页不重复提示。 */
  const onSubmit = (values: FormValues) => {
    const payload: ProfileUpdateRequest = {
      nickname: values.nickname,
      email: values.email,
      avatar: values.avatar || null,
    }
    update.mutate(payload)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>个人资料</CardTitle>
        <CardDescription>
          昵称 / 头像 / 邮箱。邮箱唯一，修改后即刻生效（v1 无验证链路）。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profile.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <form className="max-w-xl space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <ImageUploadField
              control={form.control}
              name="avatar"
              label="头像"
              shape="circle"
              hint="建议正方形头像，≤ 10MB"
            />
            <TextField control={form.control} name="nickname" label="昵称" placeholder="你的昵称" />
            <TextField
              control={form.control}
              name="email"
              label="邮箱"
              placeholder="you@example.com"
              description="唯一，冲突会提示「邮箱可能已被占用」"
            />
            <div className="space-y-1.5">
              <label htmlFor="username-readonly" className="text-sm font-medium text-foreground">
                用户名（只读）
              </label>
              <Input
                id="username-readonly"
                value={profile.data?.username ?? ''}
                disabled
                className="max-w-xl"
              />
              <p className="text-xs text-muted-foreground">登录名，不可修改。</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? '保存中…' : '保存资料'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => profile.data && form.reset(toFormValues(profile.data))}
              >
                重置
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default ProfilePage
