/**
 * @file lib/api/categories.ts
 * @description 分类相关端点。对齐契约 v1.11.0。
 * @module web-frontend/lib/api
 * @date 2026-09-16
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 分类实体。 */
export type Category = components['schemas']['Category']
/** 分类树节点（递归）。 */
export type CategoryNode = components['schemas']['CategoryNode']
/** 面包屑路径单项（从根到当前分类）。 */
export type CategoryBreadcrumbItem = components['schemas']['CategoryBreadcrumbItem']

/**
 * 获取分类树（无限级，最大深度 4）。
 */
export const getCategoryTree = (): Promise<CategoryNode[]> =>
  serverFetch<CategoryNode[]>('/categories/tree', {
    cache: 'force-cache',
    next: { tags: ['categories'] },
  })

/**
 * 获取分类面包屑（从根到当前分类的完整路径）。
 *
 * @param id - 分类 id。
 */
export const getCategoryBreadcrumb = (id: number): Promise<CategoryBreadcrumbItem[]> =>
  serverFetch<CategoryBreadcrumbItem[]>(`/categories/${id}/breadcrumb`, {
    cache: 'force-cache',
    next: { tags: [`category:${id}:breadcrumb`] },
  })
