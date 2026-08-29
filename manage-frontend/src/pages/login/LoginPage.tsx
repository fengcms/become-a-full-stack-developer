/**
 * @file src/pages/login/LoginPage.tsx
 * @description 登录页布局壳：左侧品牌区 + 右侧表单区。表单逻辑在 LoginForm.tsx。
 *
 * 契约 LoginRequest 只有 username / password 两个字段——没有邮箱、没有 remember。
 * 别照着参考项目的邮箱前缀+后缀选择器抄，那是它的业务形态，不是这里的。
 * @module manage-frontend/pages/login
 * @date 2026-08-29
 */

import { Sparkles } from 'lucide-react'
import { usePublicSiteSettings } from '@/hooks/useSite'
import { LoginForm } from '@/pages/login/LoginForm'

/**
 * 登录页。左品牌、右表单的两栏布局；小屏隐藏左栏避免与表单抢空间。
 */
const LoginPage = () => {
  const { data: site } = usePublicSiteSettings()
  const brand = site?.siteName ?? '全栈管理后台'

  return (
    <div className="hero-gradient relative flex min-h-screen w-full items-center justify-center overflow-hidden p-6 lg:justify-end lg:p-16">
      {/* 左侧品牌区（小屏隐藏，避免和表单抢空间） */}
      <div className="pointer-events-none absolute inset-0 hidden flex-col justify-between p-14 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{brand} · 管理后台</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight drop-shadow">
            内容、评论、用户，
            <br />
            一个后台管到底
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            {site?.siteDescription ?? '文章审核、分类维护、成员治理与站点配置，集中在一处。'}
          </p>
          <ul className="mt-7 space-y-3 text-sm text-white/85">
            {[
              '三角色权限：会员 / 编辑 / 管理员',
              '文章三态流转：草稿 → 待审 → 已发布',
              '评论人工复核与敏感词兜底',
            ].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/50">{site?.copyright ?? '仅限授权人员访问'}</p>
      </div>

      {/* 右侧表单区 */}
      <LoginForm site={site} />
    </div>
  )
}

export default LoginPage
