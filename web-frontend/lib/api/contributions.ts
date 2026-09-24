/** Private author endpoints: never use the public ISR article reader. */
import { request } from '@/lib/request'
import type { components } from '@/types/api.gen'
export type Manuscript = components['schemas']['Article']
export type DraftFields = Pick<
  Manuscript,
  'title' | 'content' | 'summary' | 'coverImage' | 'categoryId' | 'tags'
>
export const readManuscript = (id: number) => request<Manuscript>(`/articles/${id}`)
export const saveManuscript = (
  id: number | undefined,
  fields: DraftFields,
  status: Manuscript['status'],
) =>
  request<Manuscript>(id ? `/articles/${id}` : '/articles', {
    method: id ? 'PUT' : 'POST',
    body: { ...fields, status },
  })
export const submitManuscript = (id: number) =>
  request<Manuscript>(`/articles/${id}/submit`, { method: 'POST' })
export const deleteManuscript = (id: number) => request(`/articles/${id}`, { method: 'DELETE' })
export const uploadImage = async (file: File, articleId?: number) => {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type))
    throw new Error('请选择 PNG、JPEG、GIF、WebP 或 SVG 图片')
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10MB')
  const body = new FormData()
  body.append('file', file)
  if (articleId) body.append('articleId', String(articleId))
  const data = await request<components['schemas']['Attachment']>('/upload', {
    method: 'POST',
    body,
  })
  return new URL(data.url, window.location.origin).href
}
export const writingOptions = async () => {
  const [categories, tags] = await Promise.all([
    request<components['schemas']['CategoryNode'][]>('/categories/tree'),
    request<components['schemas']['Tag'][]>('/tags'),
  ])
  return { categories, tags }
}
