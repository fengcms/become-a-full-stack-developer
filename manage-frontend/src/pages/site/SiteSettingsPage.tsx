/**
 * @file src/pages/site/SiteSettingsPage.tsx
 * @description 站点设置（admin 专属）。拉取 GET /admin/site/settings 回填表单，
 *   PATCH /admin/site/settings 局部更新（SiteSettingUpdate 全可选，仅传这 6 个字段）。
 *   Logo 走自建 LogoUploadField（替代计划中未实现的 F0.2 ImageUploadField）：先上传拿 URL 再回填 logoUrl，
 *   落库由本页 PATCH 统一完成（契约要求 logoUrl 必须是已上传的可访问地址）。
 * @module manage-frontend/pages/site
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { getAdminSiteSettings, updateSiteSettings } from '@/api/site'
import { LogoUploadField } from '@/components/form/LogoUploadField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { TextField } from '@/components/form/TextField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'
import { canManageSiteSettings } from '@/lib/permission'
import { qk } from '@/lib/queryClient'
import { useAuthStore } from '@/store/auth'
import type { SiteSetting, SiteSettingUpdate } from '@/types/common'

/** 表单 schema：6 个站点字段均为可选文本，仅做最大长度兜底，防后端 400。 */
const schema = z.object({
  siteName: z.string().max(60, '站点名称最多 60 字'),
  siteTitle: z.string().max(80, '站点标题最多 80 字'),
  siteDescription: z.string().max(200, '站点描述最多 200 字'),
  siteKeywords: z.string().max(120, '关键词最多 120 字'),
  logoUrl: z.string().max(500, 'Logo 地址异常'),
  copyright: z.string().max(200, '版权信息最多 200 字'),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/** 把后端 SiteSetting 映射成表单值（未设字段兜底空串）。 */
const toFormValues = (s: SiteSetting): FormValues => ({
  siteName: s.siteName ?? '',
  siteTitle: s.siteTitle ?? '',
  siteDescription: s.siteDescription ?? '',
  siteKeywords: s.siteKeywords ?? '',
  logoUrl: s.logoUrl ?? '',
  copyright: s.copyright ?? '',
})

/** 站点设置页。 */
const SiteSettingsPage = () => {
  const queryClient = useQueryClient()
  const { error: toastError, success: toastSuccess } = useToast()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      siteName: '',
      siteTitle: '',
      siteDescription: '',
      siteKeywords: '',
      logoUrl: '',
      copyright: '',
    },
  })

  const user = useAuthStore((s) => s.user)
  const canSite = canManageSiteSettings(user)

  const settings = useQuery({
    queryKey: qk.site.adminSettings,
    queryFn: getAdminSiteSettings,
    enabled: canSite,
  })

  /** 拉到配置后回填表单，避免空表单覆盖未设字段。 */
  useEffect(() => {
    if (settings.data) form.reset(toFormValues(settings.data))
  }, [settings.data, form])

  const mutation = useMutation({
    mutationFn: (values: FormValues): Promise<SiteSetting> =>
      updateSiteSettings({
        siteName: values.siteName,
        siteTitle: values.siteTitle,
        siteDescription: values.siteDescription,
        siteKeywords: values.siteKeywords,
        logoUrl: values.logoUrl,
        copyright: values.copyright,
      } satisfies SiteSettingUpdate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.site.adminSettings })
      toastSuccess('站点设置已保存')
    },
    onError: (err: unknown) => toastError(err, '保存失败'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="站点设置"
        description="站点名称 / 标题 / 描述 / 关键词 / Logo / 版权，供前台页头页脚与 SEO 使用。保存即全量局部更新。"
      />
      <Card>
        <CardHeader>
          <CardTitle>基础信息</CardTitle>
          <CardDescription>以下字段会展示在前台页面，请谨慎填写。</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            >
              <TextField
                control={form.control}
                name="siteName"
                label="站点名称"
                placeholder="我的博客"
              />
              <TextField
                control={form.control}
                name="siteTitle"
                label="站点标题"
                placeholder="副标题 / 标语"
                description="浏览器标题或页头副标"
              />
              <TextAreaField
                control={form.control}
                name="siteDescription"
                label="站点描述"
                placeholder="一句话描述本站"
                description="用于 SEO meta description"
              />
              <TextAreaField
                control={form.control}
                name="siteKeywords"
                label="站点关键词"
                placeholder="前端, 后端, 全栈"
                description="逗号分隔，用于 SEO keywords"
              />
              <LogoUploadField
                control={form.control}
                name="logoUrl"
                label="站点 Logo"
                description="前台页头展示，建议正方形透明 PNG"
              />
              <TextField
                control={form.control}
                name="copyright"
                label="版权信息"
                placeholder="© 2026 我的博客"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? '保存中…' : '保存设置'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => settings.data && form.reset(toFormValues(settings.data))}
                >
                  重置
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SiteSettingsPage
