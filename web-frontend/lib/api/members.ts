/**
 * @file lib/api/members.ts
 * @description 会员相关端点。对齐契约 v1.11.0。
 * @module web-frontend/lib/api
 * @date 2026-09-16
 */

import { serverFetch } from '@/lib/api/server'
import type { components } from '@/types/api.gen'

/** 会员公开资料。 */
export type MemberProfile = components['schemas']['MemberProfile']

/**
 * 获取会员公开资料（含其 published 文章列表）。
 *
 * @param id - 会员 id。
 */
export const getMemberProfile = (id: number | string): Promise<MemberProfile> =>
  serverFetch<MemberProfile>(`/members/${id}`, {
    cache: 'force-cache',
    next: { tags: [`member:${id}`] },
  })
