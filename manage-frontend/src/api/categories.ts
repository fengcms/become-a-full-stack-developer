/**
 * @file src/api/categories.ts
 * @description 分类接口（契约 Category）。无限级自关联树，Phase 3 补齐增删改。
 *
 * 契约里有三条硬约束，都不是"点了才报错"能糊弄过去的，必须前置到 UI：
 *   1. `x-max-depth: 4` —— 最大嵌套 4 级，超出后端拒绝。UI 须在满级节点隐藏「新建子分类」。
 *   2. DELETE 前须**无子分类且无文章**，否则 409 / code 3002，且**不级联删除**——
 *      所以有子节点的分类，删除按钮应直接禁用并说明要先迁移。
 *   3. PUT 变更 parentId 时后端校验不成环（409 / 3002）。UI 的父级下拉须排除自身及子孙，
 *      把环路在提交前就掐掉，而不是等后端拒绝。
 *
 * slug 正则与契约一致：`^[a-z0-9-]{1,64}$`（小写字母 / 数字 / 连字符）。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { Category, CategoryNode } from '@/types/common'

/** 契约 `Category.x-max-depth`：分类树最大嵌套深度。 */
export const CATEGORY_MAX_DEPTH = 4

/** 分类新建 / 更新入参。 */
export type CategoryUpsert = {
  name: string
  slug: string
  description?: string | null
  parentId?: number | null
  sortOrder?: number
}

/**
 * 分类树。GET /categories/tree（公开）
 * @returns 递归分类节点列表（含 children）。
 */
export const listCategoryTree = (): Promise<CategoryNode[]> =>
  http.get<CategoryNode[]>('/categories/tree')

/**
 * 创建分类。POST /categories（editor+）
 * @param payload - 分类字段。
 * @returns 新建的分类。
 */
export const createCategory = (payload: CategoryUpsert): Promise<Category> =>
  http.post<Category>('/categories', payload)

/**
 * 更新分类。PUT /categories/{id}（editor+）
 *
 * ⚠️ 变更 parentId 时后端会校验深度与环，超限/成环返回 409 / code 3002。
 *
 * @param id - 分类 id。
 * @param payload - 分类字段。
 * @returns 更新后的分类。
 */
export const updateCategory = (id: number, payload: CategoryUpsert): Promise<Category> =>
  http.put<Category>(`/categories/${id}`, payload)

/**
 * 删除分类。DELETE /categories/{id}（editor+）
 *
 * ⚠️ 契约要求删除前**无子分类且无文章**，否则 409 / code 3002，且不级联删除。
 *
 * @param id - 分类 id。
 */
export const deleteCategory = (id: number): Promise<void> => http.delete<void>(`/categories/${id}`)
