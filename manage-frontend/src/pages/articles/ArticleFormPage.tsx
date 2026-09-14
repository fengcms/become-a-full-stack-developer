/**
 * @file pages/articles/ArticleFormPage.tsx
 * @description 写作优先布局：内容与设置保留挂载，保存与下架明确分离。
 */
import { ArrowLeft, FileText, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useController } from 'react-hook-form'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { UnsavedChanges } from '@/components/feedback/UnsavedChanges'
import { UploadScope } from '@/components/form/UploadScope'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetArticleStatus } from '@/hooks/useArticles'
import { useEditorHeight } from '@/hooks/useEditorHeight'
import { canForceArticleStatus } from '@/lib/permission'
import { useCurrentUser } from '@/store/auth'
import { ArticleSettings } from './ArticleSettings'
import { useArticleEditor } from './useArticleEditor'

/** 页面只负责布局；稿件会话与设置分别独立管理。 */
const ArticleEditor = () => {
  const editor = useArticleEditor()
  const { form, article, busy, activeTab, setActiveTab } = editor
  const title = useController({ control: form.control, name: 'title' })
  const user = useCurrentUser()
  const status = useSetArticleStatus()
  const [unpublish, setUnpublish] = useState(false)
  const { height, measure } = useEditorHeight()
  const locked = busy || status.isPending
  const dirty = form.formState.isDirty
  if (editor.isEdit && !editor.validId) return <QueryErrorState title="文章地址无效" />
  if (editor.isEdit && editor.query.isPending) return <p role="status">正在加载文章…</p>
  if (editor.isEdit && editor.query.isError && !article)
    return <QueryErrorState title="无法加载文章" onRetry={() => editor.query.refetch()} />

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[560px] flex-col">
      <UnsavedChanges dirty={dirty} busy={locked} allowNavigation={editor.allowNavigation} />
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={editor.back}
          aria-label="返回文章列表"
          className="size-11 shrink-0"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Input
          {...title.field}
          disabled={locked && !editor.uploading}
          aria-label="文章标题"
          placeholder="请输入文章标题"
          aria-invalid={!!title.fieldState.error}
          className="h-11 min-w-0 flex-1 text-lg font-medium"
        />
      </div>
      {title.fieldState.error && (
        <p role="alert" className="mt-1 pl-14 text-xs text-destructive">
          {title.fieldState.error.message}
        </p>
      )}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'content' | 'settings')}
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="content">
            <FileText className="size-4" />
            内容
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="size-4" />
            设置
          </TabsTrigger>
        </TabsList>
        <div
          role="tabpanel"
          id="tabpanel-content"
          aria-labelledby="tab-content"
          hidden={activeTab !== 'content'}
          className={activeTab === 'content' ? 'mt-3 flex min-h-0 flex-1 flex-col' : 'hidden'}
        >
          {form.formState.errors.content && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {form.formState.errors.content.message}
            </p>
          )}
          <div ref={measure} className="min-h-[300px] flex-1 overflow-hidden">
            <Controller
              control={form.control}
              name="content"
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value}
                  onChange={field.onChange}
                  articleId={article?.id}
                  height={height}
                  disabled={locked && !editor.uploading}
                />
              )}
            />
          </div>
        </div>
        <div
          role="tabpanel"
          id="tabpanel-settings"
          aria-labelledby="tab-settings"
          hidden={activeTab !== 'settings'}
          className={
            activeTab === 'settings' ? '-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2' : 'hidden'
          }
        >
          <fieldset disabled={locked && !editor.uploading}>
            <ArticleSettings control={form.control} />
          </fieldset>
        </div>
      </Tabs>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-background/80 px-2 py-3">
        <p role="status" className="mr-auto text-xs text-muted-foreground">
          {editor.uploading
            ? '图片上传中，请稍候…'
            : locked
              ? '正在保存…'
              : dirty
                ? '有未保存的修改'
                : editor.savedAt
                  ? `已保存于 ${editor.savedAt}`
                  : article
                    ? '已载入文章'
                    : '新草稿'}
          {article &&
            ` · ${article.status === 'published' ? '已发布' : article.status === 'pending' ? '待审核' : '草稿'}`}
        </p>
        {article?.status === 'published' && canForceArticleStatus(user) && (
          <Button
            variant="ghost"
            onClick={() => setUnpublish(true)}
            disabled={locked || dirty}
            title={dirty ? '请先保存修改' : '从站点下架并转为草稿'}
          >
            下架
          </Button>
        )}
        <Button
          variant={article?.status === 'published' ? 'default' : 'outline'}
          onClick={editor.save}
          disabled={locked || (!dirty && !!article)}
        >
          {locked
            ? '处理中…'
            : article?.status === 'published' || article?.status === 'pending'
              ? '保存修改'
              : '保存草稿'}
        </Button>
        {article?.status !== 'published' && (
          <Button onClick={editor.publish} disabled={locked}>
            发布文章
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={unpublish}
        onOpenChange={setUnpublish}
        title="下架文章"
        description="下架后文章将不再公开展示，内容会保留为草稿。"
        confirmText="确认下架"
        loading={status.isPending}
        onConfirm={() => {
          if (article)
            status.mutate(
              { id: article.id, status: 'draft' },
              {
                onSuccess: (saved) => {
                  editor.acceptSaved(saved)
                  setUnpublish(false)
                },
              },
            )
        }}
      />
    </div>
  )
}

/** 独立上传作用域覆盖正文和封面。 */
const ArticleFormPage = () => (
  <UploadScope>
    <ArticleEditor />
  </UploadScope>
)
export default ArticleFormPage
