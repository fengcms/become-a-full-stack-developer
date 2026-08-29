/**
 * @file src/hooks/useCategories.ts
 * @description 分类数据层。读：分类树；写：新建 / 更新 / 删除。
 *   所有写操作成功后失效 ['categories'] 前缀缓存，树与表单下拉一起刷新。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type CategoryUpsert,
  createCategory,
  deleteCategory,
  listCategoryTree,
  updateCategory,
} from '@/api/categories'
import { useToast } from '@/hooks/useToast'
import { qk } from '@/lib/queryClient'

/**
 * 分类树（公开）。表单下拉与面包屑用；分类几乎不变，缓存久一点。
 */
export const useCategoryTree = () =>
  useQuery({
    queryKey: qk.categories.tree,
    queryFn: listCategoryTree,
    staleTime: 5 * 60_000,
  })

/** 失效分类相关查询缓存。 */
const useInvalidateCategories = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['categories'] })
}

/** 新建分类。POST /categories（editor+） */
export const useCreateCategory = () => {
  const invalidate = useInvalidateCategories()
  const toast = useToast()
  return useMutation({
    mutationFn: (payload: CategoryUpsert) => createCategory(payload),
    onSuccess: () => {
      toast.success('分类已创建')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/** 更新分类。PUT /categories/{id}（editor+；改父级时后端校验深度与环） */
export const useUpdateCategory = () => {
  const invalidate = useInvalidateCategories()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CategoryUpsert }) =>
      updateCategory(id, payload),
    onSuccess: () => {
      toast.success('分类已保存')
      invalidate()
    },
    onError: (e) => toast.error(e),
  })
}

/**
 * 删除分类。DELETE /categories/{id}（editor+）
 *
 * 注意 409 是这条接口的**常见**失败（有子节点或有文章），不是异常，
 * 所以文案要说清原因，而不是笼统的「删除失败」。
 */
export const useDeleteCategory = () => {
  const invalidate = useInvalidateCategories()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => {
      toast.success('分类已删除')
      invalidate()
    },
    onError: (e) => toast.error(e, '删除失败：该分类下可能仍有子分类或文章'),
  })
}
