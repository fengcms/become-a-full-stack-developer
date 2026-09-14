/**
 * @file pages/articles/articleForm.ts
 * @description 写作表单模型：状态与字段转换独立于页面布局。
 */
import { z } from 'zod'
import type { SelectOption } from '@/components/form/SelectField'
import type { Article, ArticleCreate, ArticleStatus, CategoryNode } from '@/types/common'

export const articleSchema = z.object({
  title: z.string().trim().min(1, '请输入文章标题').max(200, '标题最多 200 字'),
  content: z
    .string()
    .refine((s) => s.trim().length > 0, '请输入正文')
    .max(65535, '正文超出长度上限'),
  summary: z.string().max(500, '摘要最多 500 字'),
  coverImage: z.string().max(512, '封面地址过长'),
  categoryId: z.string(),
  tags: z.array(z.string()),
})
export type ArticleFormValues = z.infer<typeof articleSchema>

/** 从服务器对象建立编辑基线；新建用空字段。 */
export const articleToForm = (article?: Article): ArticleFormValues => ({
  title: article?.title ?? '',
  content: article?.content ?? '',
  summary: article?.summary ?? '',
  coverImage: article?.coverImage ?? '',
  categoryId: article?.categoryId == null ? '' : String(article.categoryId),
  tags: article?.tags ?? [],
})

/** 普通保存保留状态；只有明确发布动作才改变状态。 */
export const articlePayload = (
  values: ArticleFormValues,
  status: ArticleStatus,
  slug?: string | null,
): ArticleCreate => ({
  ...values,
  summary: values.summary || null,
  coverImage: values.coverImage || null,
  categoryId: values.categoryId ? Number(values.categoryId) : null,
  slug: slug || null,
  status,
})

/** 分类选项显示完整路径，避免不同父级的同名分类混淆。 */
export const categoryOptions = (nodes: CategoryNode[], prefix = ''): SelectOption[] =>
  nodes.flatMap((node) => {
    const label = prefix ? `${prefix} / ${node.name}` : (node.name ?? '')
    return node.id == null
      ? []
      : [{ value: String(node.id), label }, ...categoryOptions(node.children ?? [], label)]
  })
