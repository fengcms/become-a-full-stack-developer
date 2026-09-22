import type { components } from '@/types/api.gen'
import type { DraftFields, Manuscript } from './api/contributions'
export const draftFields = (article?: DraftFields): DraftFields => ({
  title: article?.title ?? '',
  content: article?.content ?? '',
  summary: article?.summary ?? '',
  coverImage: article?.coverImage ?? '',
  categoryId: article?.categoryId ?? null,
  tags: article?.tags ?? [],
})
export const validateDraft = (fields: DraftFields, submit: boolean) => {
  if (!fields.title.trim()) return '请输入文章标题'
  if (fields.title.length > 200) return '标题最多 200 字符'
  if (!fields.content.trim()) return '请输入文章正文'
  if (fields.content.length > 65535) return '正文最多 65,535 字符'
  if ((fields.summary?.length ?? 0) > 500) return '摘要最多 500 字符'
  if (submit && !fields.categoryId) return '提交审核前请选择分类'
  return ''
}
export const saveStatus = (status?: Manuscript['status']): Manuscript['status'] =>
  status === 'published' ? 'pending' : (status ?? 'draft')
export const categoryChoices = (
  nodes: components['schemas']['CategoryNode'][],
  prefix = '',
): { id: number; label: string }[] =>
  nodes.flatMap((node) => {
    const label = prefix ? `${prefix} / ${node.name}` : (node.name ?? '')
    return [
      ...(node.id ? [{ id: node.id, label }] : []),
      ...categoryChoices(node.children ?? [], label),
    ]
  })
export const statusLabel = { draft: '草稿', pending: '待审核', published: '已发布' }
