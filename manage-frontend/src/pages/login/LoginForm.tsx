/**
 * @file src/pages/login/LoginForm.tsx
 * @description 登录表单：用户名/密码校验、开发期自动填充、提交后角色前置拦截与跳转。
 *   从 LoginPage 拆出，页面壳只负责左右两栏布局，表单逻辑独立可测。
 * @module manage-frontend/pages/login
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LoaderCircle, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { login } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { canEnterConsole, ROLE_HOME, ROLE_LABELS } from '@/config/roles'
import { isApiError } from '@/lib/request'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import type { SiteSetting } from '@/types/common'

/** 登录表单校验 schema。契约 LoginRequest 仅 username/password。 */
const schema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

type FormValues = z.infer<typeof schema>

/**
 * 登录表单。
 *
 * @param site - 公开站点配置（取品牌名首字做 logo、默认提示文案）；可为空。
 */
export const LoginForm = ({ site }: { site?: SiteSetting }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showPwd, setShowPwd] = useState(false)
  const [blockedHint, setBlockedHint] = useState<string | null>(null)

  const { register, handleSubmit, formState, setValue } = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })
  const { errors, isSubmitting } = formState

  // 开发期自动填充：仅在 .env.local 配了 VITE_DEV_LOGIN_* 时生效，不写死账号到代码里
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const u = import.meta.env.VITE_DEV_LOGIN_USERNAME
    const p = import.meta.env.VITE_DEV_LOGIN_PASSWORD
    if (u) setValue('username', u)
    if (p) setValue('password', p)
  }, [setValue])

  const from = (location.state as { from?: string } | null)?.from

  /**
   * 提交：登录 → 角色前置拦截（member 不能进后台）→ 跳默认落地页。
   * 拦截后不清令牌之前先清会话，避免界面停在半登录态。
   */
  const onSubmit = async (values: FormValues) => {
    setBlockedHint(null)
    try {
      const auth = await login(values)

      // 角色前置拦截：member 在契约里碰不到任何管理端点，让它进来只会满屏 403
      if (!canEnterConsole(auth.user.role)) {
        useAuthStore.getState().clear()
        const hint = `当前账号角色为「${ROLE_LABELS[auth.user.role]}」，没有管理后台的操作权限。如需管理内容，请联系管理员将账号提升为编辑或管理员。`
        setBlockedHint(hint)
        toast.warning('该账号无法进入管理后台')
        return
      }

      toast.success(`欢迎回来，${auth.user.nickname || auth.user.username}`)
      navigate(from ?? ROLE_HOME[auth.user.role], { replace: true })
    } catch (err) {
      // request 层已把数字码翻译成人话，这里直接用
      toast.error(isApiError(err) ? err.message : '登录失败，请稍后重试')
    }
  }

  const brand = site?.siteName ?? '全栈管理后台'

  return (
    <div className="animate-rise relative w-full max-w-md rounded-2xl border border-white/60 bg-card/80 p-9 text-card-foreground shadow-[0_20px_60px_-12px_rgba(15,23,42,0.45)] backdrop-blur-2xl backdrop-saturate-150 dark:border-border/60 dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]">
      <div className="mb-8">
        <div className="gradient-brand shadow-lift mb-4 flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold text-white">
          {brand.slice(0, 1)}
        </div>
        <h2 className="text-xl font-bold">登录到管理后台</h2>
        <p className="mt-1 text-sm text-muted-foreground">使用编辑或管理员账号登录</p>
      </div>

      {blockedHint ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200/50 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{blockedHint}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="space-y-2.5">
          <Label htmlFor="username">用户名</Label>
          <div
            className={cn(
              'flex items-stretch overflow-hidden rounded-xl border bg-background transition focus-within:!border-primary focus-within:!ring-2 focus-within:!ring-primary/40 focus-within:outline-none',
              errors.username ? '!border-destructive' : 'border-border',
            )}
          >
            <input
              id="username"
              autoComplete="username"
              placeholder="请输入用户名"
              className="w-full bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground"
              {...register('username')}
            />
          </div>
          {errors.username ? (
            <p className="text-xs text-destructive">{errors.username.message}</p>
          ) : null}
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="password">密码</Label>
          <div
            className={cn(
              'flex items-center overflow-hidden rounded-xl border bg-background transition focus-within:!border-primary focus-within:!ring-2 focus-within:!ring-primary/40 focus-within:outline-none',
              errors.password ? '!border-destructive' : 'border-border',
            )}
          >
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="请输入密码"
              className="w-full bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="px-3 text-muted-foreground transition hover:text-card-foreground"
              aria-label={showPwd ? '隐藏密码' : '显示密码'}
            >
              {showPwd ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="gradient"
          className="h-12 w-full text-[15px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? <LoaderCircle className="animate-spin" /> : null}
          登录
        </Button>
      </form>
    </div>
  )
}
