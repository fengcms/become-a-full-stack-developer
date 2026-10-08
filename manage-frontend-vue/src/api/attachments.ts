/**
 * @file src/api/attachments.ts
 * @description 附件 / 上传资源端点（契约 Upload + Member）。
 *   POST   /upload              上传（落 Attachment 表，返回完整实体）member+
 *   GET    /me/attachments      我上传的附件（分页，素材库数据源）member+
 *   DELETE /attachments/{id}    删除附件（上传者本人或 admin）editor+
 * ⚠️ 返回 url 形如 `/files/{key}`，取用一律走 fileUrl() 修正根路径，别手拼 `/api/v1`。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { Attachment, AttachmentPage, PageQuery } from '@/types/common'

/**
 * 上传文件。POST /upload（member+）
 * @param file - 文件本体；须 <= 10MB 且为 图片/PDF，否则 400（code 4001）
 * @param articleId - 可选，把附件关联到指定文章（写入 Attachment.articleId）
 * @returns 完整 Attachment 实体（含 url / storage / mimeType / size）
 */
export const uploadFile = (file: File, articleId?: number): Promise<Attachment> => {
  const form = new FormData()
  form.append('file', file)
  if (articleId != null) form.append('articleId', String(articleId))
  return http.post<Attachment>('/upload', form)
}

/**
 * 我上传的附件（分页）。GET /me/attachments（member+），编辑器素材库数据源。
 * @param query - 分页参数（page / pageSize）
 * @returns 分页结果
 */
export const listMyAttachments = (query: PageQuery = {}): Promise<AttachmentPage> =>
  http.get<AttachmentPage>('/me/attachments', { query })

/**
 * 删除附件。DELETE /attachments/{id}（上传者本人或 admin）
 * @param id - 附件 id
 */
export const deleteAttachment = (id: number): Promise<void> =>
  http.delete<void>(`/attachments/${id}`)
