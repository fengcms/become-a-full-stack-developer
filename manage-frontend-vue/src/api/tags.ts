/**
 * @file src/api/tags.ts
 * @description 标签接口（契约 Tag）。Phase 3 标签管理模块。
 *
 * 两条契约要点：
 *   1. `Tag.articleCount` 由 `GET /tags` 直接返回，标签云计数无需另算。
 *   2. DELETE 前须**无文章引用**，否则 409 / code 3002。
 *      所以 `articleCount > 0` 的标签，删除按钮应直接禁用——让用户点了再吃 409 是没必要的挫败。
 *
 * ⚠️ 与计划文档的差异：`docs/manage-frontend/M2-开发计划.md` §6 提到标签「新建/合并/删除」，
 *    但契约里**没有标签合并（merge）端点**（全仓 grep merge 无结果）。
 *    合并需要后端先把源标签的 ArticleTag 关联迁到目标标签再删源标签，属新端点，
 *    不在冻结契约内，故本轮不实现。如确需此能力，须走「先改契约再改实现」的流程。
 *
 * slug 正则与契约一致：`^[a-z0-9-]{1,64}$`。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import type { Tag } from '@/types/common'

/** 标签新建 / 更新入参。 */
export type TagUpsert = {
  name: string
  slug: string
}

/**
 * 标签列表。GET /tags（公开）
 * @returns 标签数组，每项含 articleCount。
 */
export const listTags = (): Promise<Tag[]> => http.get<Tag[]>('/tags')

/**
 * 创建标签。POST /tags（editor+）
 * @param payload - 标签字段。
 * @returns 新建的标签。
 */
export const createTag = (payload: TagUpsert): Promise<Tag> => http.post<Tag>('/tags', payload)

/**
 * 更新标签。PUT /tags/{id}（editor+）
 *
 * 契约说明：补齐这个端点是为了让「有文章引用的标签」也能改名——
 * 否则它既不能改（无更新端点）也不能删（409 保护），会变成不可维护的死数据。
 *
 * @param id - 标签 id。
 * @param payload - 标签字段。
 * @returns 更新后的标签。
 */
export const updateTag = (id: number, payload: TagUpsert): Promise<Tag> =>
  http.put<Tag>(`/tags/${id}`, payload)

/**
 * 删除标签。DELETE /tags/{id}（editor+）
 *
 * ⚠️ 仍有文章引用时返回 409 / code 3002，调用方应先看 articleCount。
 *
 * @param id - 标签 id。
 */
export const deleteTag = (id: number): Promise<void> => http.delete<void>(`/tags/${id}`)
