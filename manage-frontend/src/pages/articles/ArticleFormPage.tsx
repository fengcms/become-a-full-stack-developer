/**
 * @file src/pages/articles/ArticleFormPage.tsx
 * @description 文章新建 / 编辑页（Phase 1）。RHF + zod 校验，正文走 MarkdownEditor（F0.5）。
 *   id 存在为编辑（GET /articles/{id} 预填），否则新建；提交按角色受后端状态约束。
 * @module manage-frontend/pages/articles
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { FormField } from '@/components/form/FormField'
import { SelectField, type SelectOption } from '@/components/form/SelectField'
import { TagsField } from '@/components/form/TagsField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { TextField } from '@/components/form/TextField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useArticle, useCreateArticle, useUpdateArticle } from '@/hooks/useArticles'
import { useCategoryTree } from '@/hooks/useCategories'
import type { ArticleCreate, CategoryNode } from '@/types/common'

/** 表单校验 schema（与 ArticleCreate 对齐：summary/coverImage/slug 为空串时提交转 null）。 */
const schema = z.object({
  title: z.string().min(1, '标题必填').max(200, '标题最多 200 字'),
  content: z.string().min(1, '正文必填').max(65535, '正文超出长度上限'),
  summary: z.string().max(500, '摘要最多 500 字'),
  coverImage: z.string().max(512, '封面 URL 过长'),
  categoryId: z.string(),
  tags: z.array(z.string()),
  slug: z.string(),
  status: z.enum(['draft', 'pending', 'published']),
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
    acc.push({ value: String(n.id), label: `${'  '.repeat(depth)}${n.name ?? ''}` })
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

  const { data: article, isLoading } = useArticle(isEdit ? (articleId as number) : -1)
  const { data: tree } = useCategoryTree()
  const createMut = useCreateArticle()
  const updateMut = useUpdateArticle()

  /** 分类下拉选项（含「未分类」）。 */
  const categoryOptions: SelectOption[] = useMemo(
    () => [{ value: '', label: '未分类' }, ...flattenCategories(tree ?? [])],
    [tree],
  )

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
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
      slug: '',
      status: 'draft',
    },
  })

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
        slug: article.slug ?? '',
        status: article.status,
      })
    }
  }, [article, reset])

  /** 提交：空串字段转 null，categoryId 转 number|null，再按新建 / 编辑分流。 */
  const onSubmit = (values: FormValues) => {
    const payload: ArticleCreate = {
      title: values.title,
      content: values.content,
      summary: values.summary || null,
      coverImage: values.coverImage || null,
      categoryId: values.categoryId ? Number(values.categoryId) : null,
      tags: values.tags,
      slug: values.slug || null,
      status: values.status,
    }
    if (isEdit && articleId != null) {
      updateMut.mutate({ id: articleId, payload }, { onSuccess: () => navigate('/articles') })
    } else {
      createMut.mutate(payload, { onSuccess: () => navigate('/articles') })
    }
  }

  if (isEdit && isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>

  return (
    <div>
      <PageHeader
        title={isEdit ? '编辑文章' : '新建文章'}
        description="正文使用 Markdown 编辑器，可粘贴 / 拖拽图片自动上传"
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextField control={control} name="title" label="标题" required placeholder="文章标题" />
        <FormField label="正文" htmlFor="content" required error={errors.content?.message}>
          <Controller
            control={control}
            name="content"
            render={({ field }) => (
              <MarkdownEditor
                value={field.value}
                onChange={field.onChange}
                articleId={article?.id}
              />
            )}
          />
        </FormField>
        <TextAreaField
          control={control}
          name="summary"
          label="摘要"
          placeholder="可选，最多 500 字"
        />
        <TextField
          control={control}
          name="coverImage"
          label="封面图 URL"
          placeholder="https://…（可选）"
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
        <TextField
          control={control}
          name="slug"
          label="URL 别名"
          description="可选；editor / admin 可指定，member 传入被忽略"
          placeholder="my-post"
        />
        <SelectField
          control={control}
          name="status"
          label="状态"
          options={[
            { value: 'draft', label: '草稿' },
            { value: 'pending', label: '待审' },
            { value: 'published', label: '已发布' },
          ]}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
            {isEdit ? '保存' : '创建'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/articles')}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}

export default ArticleFormPage
