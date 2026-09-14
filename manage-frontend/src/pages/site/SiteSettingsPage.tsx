/**
 * @file pages/site/SiteSettingsPage.tsx
 * @description 按品牌、搜索展示与页脚组织站点设置；加载、上传与未保存保护统一。
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { getAdminSiteSettings, updateSiteSettings } from '@/api/site'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { UnsavedChanges } from '@/components/feedback/UnsavedChanges'
import { ImageUploadField } from '@/components/form/ImageUploadField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { TextField } from '@/components/form/TextField'
import { UploadScope, useUploadActivity } from '@/components/form/UploadScope'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'
import type { SiteSetting } from '@/types/common'

const schema = z.object({
  siteName: z.string().max(60, '站点名称最多 60 字'),
  siteTitle: z.string().max(80, '站点标题最多 80 字'),
  siteDescription: z.string().max(200, '描述最多 200 字'),
  siteKeywords: z.string().max(120, '关键词最多 120 字'),
  logoUrl: z.string().max(500, 'Logo 地址过长'),
  copyright: z.string().max(200, '版权最多 200 字'),
})
type Values = z.infer<typeof schema>
/** 后端值映射为可编辑字符串。 */
const toValues = (s?: SiteSetting): Values => ({
  siteName: s?.siteName ?? '',
  siteTitle: s?.siteTitle ?? '',
  siteDescription: s?.siteDescription ?? '',
  siteKeywords: s?.siteKeywords ?? '',
  logoUrl: s?.logoUrl ?? '',
  copyright: s?.copyright ?? '',
})

/** 配置编辑会话首次回填，提交成功再建立新的基线。 */
const SettingsEditor = () => {
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useQuery({ queryKey: qk.site.adminSettings, queryFn: getAdminSiteSettings })
  const baseline = useRef<SiteSetting | undefined>(undefined)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: toValues(),
  })
  const { count } = useUploadActivity()
  useEffect(() => {
    if (settings.data && !baseline.current) {
      baseline.current = settings.data
      form.reset(toValues(settings.data))
    }
  }, [settings.data, form])
  const mutation = useMutation({
    mutationFn: updateSiteSettings,
    onSuccess: (saved) => {
      baseline.current = saved
      form.reset(toValues(saved))
      qc.setQueryData(qk.site.adminSettings, saved)
      void qc.invalidateQueries({ queryKey: qk.site.publicSettings })
      toast.success('站点设置已保存')
    },
    onError: (error: unknown) => toast.error(error, '保存失败，修改已保留'),
  })
  const busy = mutation.isPending || count > 0
  const dirty = form.formState.isDirty
  const values = form.watch()
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="站点设置"
        description="设置站点品牌、搜索展示与页脚信息，保存后应用到站点。"
      />
      <UnsavedChanges dirty={dirty} busy={busy} />
      {settings.isPending ? (
        <p role="status">正在加载设置…</p>
      ) : settings.isError ? (
        <QueryErrorState onRetry={() => settings.refetch()} />
      ) : (
        <form
          onSubmit={form.handleSubmit((next) => {
            if (!busy) mutation.mutate(next)
          })}
          className="space-y-5"
        >
          <fieldset disabled={mutation.isPending} className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>站点品牌</CardTitle>
                <CardDescription>显示在站点导航和页头，帮助读者识别你的网站。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <TextField
                  control={form.control}
                  name="siteName"
                  label="站点名称"
                  placeholder="如：FungLeo 的技术笔记"
                />
                <ImageUploadField
                  control={form.control}
                  name="logoUrl"
                  label="站点 Logo"
                  description="建议正方形透明 PNG，保存后生效"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>搜索展示</CardTitle>
                <CardDescription>帮助读者在浏览器标签和搜索结果中了解站点。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <TextField
                  control={form.control}
                  name="siteTitle"
                  label="站点标题"
                  placeholder="如：FungLeo 的技术笔记 · 从前端走向全栈"
                  description="用于浏览器标签，可以比站点名称更完整"
                />
                <TextAreaField
                  control={form.control}
                  name="siteDescription"
                  label="站点描述"
                  placeholder="用一两句话介绍网站的内容"
                />
                <TextField
                  control={form.control}
                  name="siteKeywords"
                  label="关键词"
                  placeholder="前端, 后端, 全栈"
                  description="多个关键词用英文逗号分隔"
                />
                <div className="rounded-md border bg-muted/30 p-4">
                  <p className="mb-2 text-xs text-muted-foreground">
                    文字预览（实际展示由前台决定）
                  </p>
                  <p className="font-medium">
                    {values.siteTitle || values.siteName || '你的站点标题'}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {values.siteDescription || '这里将展示站点描述'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>页脚</CardTitle>
              </CardHeader>
              <CardContent>
                <TextField
                  control={form.control}
                  name="copyright"
                  label="版权信息"
                  placeholder="© 2026 FungLeo"
                />
              </CardContent>
            </Card>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !dirty}>
              {count ? '图片上传中…' : mutation.isPending ? '保存中…' : '保存设置'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !dirty}
              onClick={() => form.reset(toValues(baseline.current))}
            >
              撤销未保存修改
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {dirty ? '有未保存的修改' : '所有修改已保存'}
            </span>
          </div>
        </form>
      )}
    </div>
  )
}
/** 站点表单独立跟踪上传任务。 */
const SiteSettingsPage = () => (
  <UploadScope>
    <SettingsEditor />
  </UploadScope>
)
export default SiteSettingsPage
