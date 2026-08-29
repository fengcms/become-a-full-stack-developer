/**
 * @file src/api/categories.ts
 * @description 分类接口（契约 Category）。当前仅落后台表单所需的树读取；
 *   增删改随 Phase 3 分类管理模块补齐。
 *   GET /categories/tree  公开无限级树（表单归属下拉 / 面包屑数据源）
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { CategoryNode } from '@/types/common'

/**
 * 分类树。GET /categories/tree（公开）
 * @returns 递归分类节点列表（含 children）。
 */
export const listCategoryTree = (): Promise<CategoryNode[]> =>
  http.get<CategoryNode[]>('/categories/tree')
