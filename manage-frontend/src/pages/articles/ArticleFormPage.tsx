/**
 * @file src/pages/articles/ArticleFormPage.tsx
 * @description 文章新建 / 编辑页（写作优先 · 文章系统后台）。
 *   - 标题行：左侧返回按钮（有改动二次确认）+ 大号标题输入框（无「标题*」标签）。
 *   - Tab 切换位于标题下方：Tab1「内容」= 大号 Markdown 编辑器（动态占满可视高度，页面不滚动）；
 *     Tab2「设置」= 摘要 / 封面 / 分类 / 标签（slug 由标题自动派生：新建留空、编辑保留原 slug）。
 *   - 底部操作栏：保存草稿(draft) / 发布文章(published)，无「取消」；发布前校验分类缺失则跳设置高亮。
 * @module manage-frontend/pages/articles
 * @date 2026-08-31
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, FileText, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useController, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { ImageUploadField } from '@/components/form/ImageUploadField'
import { SelectField, type SelectOption } from '@/components/form/SelectField'
import { TagsField } from '@/components/form/TagsField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useArticle, useCreateArticle, useUpdateArticle } from '@/hooks/useArticles'
import { useCategoryTree } from '@/hooks/useCategories'
import type { ArticleCreate, CategoryNode } from '@/types/common'

/** 表单校验 schema（summary/coverImage 为空串时提交转 null；status 由操作栏双动词决定，不在表单内）。 */
const schema = z.object({
  title: z.string().min(1, '标题必填').max(200, '标题最多 200 字'),
  content: z.string().min(1, '正文必填').max(65535, '正文超出长度上限'),
  summary: z.string().max(500, '摘要最多 500 字'),
  coverImage: z.string().max(512, '封面 URL 过长'),
  categoryId: z.string(),
  tags: z.array(z.string()),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/** 把递归分类树拍平成带缩进的 Select 选项。 */
const flattenCategories = (
  nodes: CategoryNode[],
  depth = 0,
  acc: SelectOption[] = [],
): SelectOption[] => {
  for (const n of nodes) {
    if (n.id == null) continue
    acc.push({ value: String(n.id), label: `${'  '.repeat(depth)}${n.name ?? ''}` })
    if (n.children?.length) flattenCategories(n.children, depth + 1, acc)
  }
  return acc
}

/**
 * 文章新建 / 编辑页。
 */
const ArticleFormPage = () => {
  const { id } = useParams()
  const articleId = id ? Number(id) : undefined
  const isEdit = articleId != null && Number.isFinite(articleId) && articleId > 0
  const navigate = useNavigate()

  /** 当前激活标签页。 */
  const [activeTab, setActiveTab] = useState<'content' | 'settings'>('content')
  /** 取消守卫弹窗（返回按钮触发）。 */
  const [backOpen, setBackOpen] = useState(false)
  /** 编辑器动态高度（占满内容区剩余可视高度，页面不滚动）。 */
  const [editorH, setEditorH] = useState(560)
  const editorRO = useRef<ResizeObserver | null>(null)

  const { data: article, isLoading } = useArticle(isEdit ? (articleId as number) : -1)
  const { data: tree } = useCategoryTree()
  const createMut = useCreateArticle()
  const updateMut = useUpdateArticle()

  /** 分类下拉选项（含「未分类」）。 */
  const categoryOptions: SelectOption[] = (() => {
    const opts = [{ value: '', label: '未分类' }, ...flattenCategories(tree ?? [])]
    return opts
  })()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      content: '',
      summary: '',
      coverImage: '',
      categoryId: '',
      tags: [],
    },
  })

  /** 标题用受控字段，便于在返回按钮同一行内联渲染与错误提示。 */
  const titleField = useController({ control, name: 'title' })

  // 编辑模式下，详情加载完成后回填表单
  useEffect(() => {
    if (article) {
      reset({
        title: article.title,
        content: article.content,
        summary: article.summary ?? '',
        coverImage: article.coverImage ?? '',
        categoryId: article.categoryId != null ? String(article.categoryId) : '',
        tags: article.tags ?? [],
      })
    }
  }, [article, reset])

  /** 编辑器容器高度：用 callback ref 在容器挂载 / 重挂载（切 Tab）时测量，填充剩余可视高度。 */
  const setEditorWrap = useCallback((node: HTMLDivElement | null) => {
    editorRO.current?.disconnect()
    if (!node) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = e.contentRect.height
        if (h > 0) setEditorH(Math.floor(h))
      }
    })
    ro.observe(node)
    editorRO.current = ro
    setEditorH(Math.floor(node.clientHeight) || 560)
  }, [])

  /** 统一提交：按操作栏意图设 status。空串字段转 null，categoryId 转 number|null。 */
  const submit = (values: FormValues, status: 'draft' | 'published') => {
    const payload: ArticleCreate = {
      title: values.title,
      content: values.content,
      summary: values.summary || null,
      coverImage: values.coverImage || null,
      categoryId: values.categoryId ? Number(values.categoryId) : null,
      tags: values.tags,
      slug: isEdit && article?.slug ? article.slug : null,
      status,
    }
    if (isEdit && articleId != null) {
      updateMut.mutate({ id: articleId, payload }, { onSuccess: () => navigate('/articles') })
    } else {
      createMut.mutate(payload, { onSuccess: () => navigate('/articles') })
    }
  }

  /** 保存草稿：允许无分类。 */
  const onSaveDraft = handleSubmit((values) => submit(values, 'draft'))

  /** 发布文章：分类必填，缺失则跳到「设置」Tab 并高亮分类。 */
  const onPublish = handleSubmit((values) => {
    if (!values.categoryId) {
      setError('categoryId', { type: 'manual', message: '发布前请选择分类' })
      setActiveTab('settings')
      return
    }
    submit(values, 'published')
  })

  /** 返回：有改动先确认，否则直接离开。 */
  const onBack = () => {
    if (isDirty) setBackOpen(true)
    else navigate('/articles')
  }

  const pending = createMut.isPending || updateMut.isPending

  if (isEdit && isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>

  return (
    // 整页高度 = 视口高度 - 顶栏 56 - 主区 padding 48（=104px）。用确定的 h 而非 min-h：
    // 只有确定高度时，内部 flex-1 的 flex-basis:0 才不会退化成"按内容撑开"，
    // 编辑器才能跟着视口一起变矮；视口过矮时由 min-h 兜底不再收缩，页面超出部分交给外层 main 滚动。
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[560px] flex-col">
      {/* 标题行：左侧返回按钮（与输入框同高，正方形）+ 大号标题输入框（无「标题*」标签） */}
      <div className="shrink-0">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="返回文章列表"
            className="size-11 shrink-0"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <Input
            {...titleField.field}
            placeholder="请输入文章标题，不可为空"
            aria-invalid={!!titleField.fieldState.error}
            className="h-11 min-w-0 flex-1 text-lg font-medium"
          />
        </div>
        {/* 错误提示与输入框左侧对齐（返回按钮 44 + 间距 12 = 56px） */}
        {titleField.fieldState.error ? (
          <p className="mt-1 pl-14 text-xs text-destructive">
            {titleField.fieldState.error.message}
          </p>
        ) : null}
      </div>

      {/* Tab 切换位于标题下方 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'content' | 'settings')}
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="shrink-0">
          <TabsTrigger value="content">
            <FileText className="size-4" aria-hidden />
            内容
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="size-4" aria-hidden />
            设置
          </TabsTrigger>
        </TabsList>

        {/* Tab1：专注写作区——编辑器动态占满剩余可视高度 */}
        <TabsContent value="content" className="mt-3 min-h-0 flex-1 flex flex-col">
          {/* overflow-hidden 兜底：编辑器按测量高度渲染，绝不溢出到下方操作栏 */}
          <div ref={setEditorWrap} className="min-h-[360px] flex-1 overflow-hidden">
            <Controller
              control={control}
              name="content"
              render={({ field }) => (
                <MarkdownEditor
                  value={field.value}
                  onChange={field.onChange}
                  articleId={article?.id}
                  height={editorH}
                  placeholder="开始撰写正文…（支持 Markdown 语法，可粘贴 / 拖拽图片）"
                />
              )}
            />
          </div>
        </TabsContent>

        {/* Tab2：发布所需的元数据——保持小而次要，约束宽度不喧宾夺主。
            px-2 / -mx-2：滚动容器的 overflow-x 会被 overflow-y:auto 连带变成 auto，
            左右各留 8px 内边距并反向外扩，控件激活时的焦点环才不会被裁掉。 */}
        <TabsContent value="settings" className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2">
          {/* py-2：给首个 / 末个字段的焦点环留出纵向空间，避免被滚动容器裁掉 */}
          <div className="max-w-2xl space-y-4 py-2">
            <TextAreaField
              control={control}
              name="summary"
              label="摘要"
              placeholder="可选，最多 500 字"
            />
            <ImageUploadField
              control={control}
              name="coverImage"
              label="封面图"
              description="建议 16:9，选图即上传"
              shape="square"
              hint="建议 ≤ 10MB"
            />
            <SelectField
              control={control}
              name="categoryId"
              label="分类"
              options={categoryOptions}
              placeholder="选择分类"
            />
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagsField
                  value={field.value}
                  onChange={field.onChange}
                  label="标签"
                  description="回车或逗号分隔添加"
                />
              )}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* 底部操作栏：移除「取消」，重做容器高度 / 背景 / 内填充 */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-background/80 px-2 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={onSaveDraft} disabled={pending}>
          保存草稿
        </Button>
        <Button type="button" onClick={onPublish} disabled={pending}>
          发布文章
        </Button>
      </div>

      <ConfirmDialog
        open={backOpen}
        onOpenChange={setBackOpen}
        title="未保存的修改"
        description="返回会导致已编辑内容消失，确定离开？"
        confirmText="离开"
        confirmVariant="default"
        onConfirm={() => navigate('/articles')}
      />
    </div>
  )
}

export default ArticleFormPage
