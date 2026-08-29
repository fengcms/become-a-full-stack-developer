/**
 * @file src/hooks/useCategories.ts
 * @description 分类只读数据。hooks 层把 api 与 queryKey 绑定，组件只调钩子。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useQuery } from '@tanstack/react-query'
import { listCategoryTree } from '@/api/categories'
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
