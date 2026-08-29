/**
 * @file src/hooks/useImageUpload.ts
 * @description 编辑器图片上传 hook：把 File 走 POST /upload 转成可直接插入的已解析 URL。
 *   失败时抛出 ApiError（不静默吞错），由调用方负责 toast。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useCallback, useState } from 'react'
import { uploadFile } from '@/api/attachments'
import { fileUrl } from '@/lib/request'
import type { Attachment } from '@/types/common'

/**
 * 图片上传能力。
 * @param options.articleId - 可选，把附件关联到当前正在编辑的文章。
 */
export const useImageUpload = (options: { articleId?: number } = {}) => {
  const [uploading, setUploading] = useState(false)
  const articleId = options.articleId

  /**
   * 上传单个图片文件，返回可直接用于 `![alt](url)` 的已解析地址（ORIGIN + /files/<key>）。
   * @param file - 图片文件
   * @returns 已解析的可访问 URL
   * @throws 上传失败时抛出 ApiError（后端 4001 / 401 等）
   */
  const upload = useCallback(
    async (file: File): Promise<string> => {
      setUploading(true)
      try {
        const attachment: Attachment = await uploadFile(file, articleId)
        return fileUrl(attachment.url)
      } finally {
        setUploading(false)
      }
    },
    [articleId],
  )

  return { upload, uploading }
}
