/**
 * @file lib/api/tags.ts
 * @description 标签相关端点。对齐契约 v1.11.0。
 * @module web-frontend/lib/api
 * @date 2026-09-16
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 标签实体。 */
export type Tag = components['schemas']['Tag']

/**
 * 获取全部标签（含 articleCount）。
 */
export const listTags = (): Promise<Tag[]> =>
  serverFetch<Tag[]>('/tags', {
    cache: 'force-cache',
    next: { tags: ['tags'] },
  })
