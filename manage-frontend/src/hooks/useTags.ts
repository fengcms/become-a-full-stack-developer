/**
 * @file src/hooks/useTags.ts
 * @description 标签数据层。读：标签列表（含 articleCount）；写：新建 / 更新 / 删除。
 *   所有写操作成功后失效 ['tags'] 前缀缓存。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTag, deleteTag, listTags, type TagUpsert, updateTag } from '@/api/tags'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'

/** 标签列表（公开，含 articleCount）。 */
export const useTags = () => useQuery({ queryKey: qk.tags.list, queryFn: listTags })

/** 失效标签相关查询缓存。 */
const useInvalidateTags = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['tags'] })
}

/** 新建标签。POST /tags（editor+） */
export const useCreateTag = () => {
  const invalidate = useInvalidateTags()
  const toast = useToast()
  return useMutation({
    mutationFn: (payload: TagUpsert) => createTag(payload),
    onSuccess: () => {
      toast.success('标签已创建')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 更新标签。PUT /tags/{id}（editor+） */
export const useUpdateTag = () => {
  const invalidate = useInvalidateTags()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TagUpsert }) => updateTag(id, payload),
    onSuccess: () => {
      toast.success('标签已保存')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/**
 * 删除标签。DELETE /tags/{id}（editor+）
 *
 * 仍有文章引用时后端返回 409——这是常见失败而非异常，
 * 所以失败文案直接点明原因，避免用户反复重试一个必然失败的操作。
 */
export const useDeleteTag = () => {
  const invalidate = useInvalidateTags()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => {
      toast.success('标签已删除')
      invalidate()
    },
    onError: (e) => toast.error(e, '删除失败：该标签下可能仍有文章引用'),
  })
}
