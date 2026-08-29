/**
 * @file src/lib/permission.test.ts
 * @description 权限判定的冒烟测试。
 *   这是审阅 P3-5 点名的关键路径之一：角色与能力的映射一旦改错，
 *   表现是「按钮能点但必然 403」或「管理员看不到管理入口」，靠肉眼很难在联调中发现。
 * @module manage-frontend/lib
 * @date 2026-08-29
 */

import { describe, expect, it } from 'vitest'
import type { Actor } from '@/lib/permission'
import {
  canDeleteComment,
  canManageArticles,
  canManageUsers,
  canOperateOwned,
  hasAnyManagePower,
} from '@/lib/permission'
import type { UserRole } from '@/types/common'

/** 造一个只带 id 与 role 的操作者，贴合 Actor 的最小形状。 */
const actor = (id: number, role: UserRole): Actor => ({ id, role })

describe('能力判定：角色三角 member / editor / admin', () => {
  /** editor 管内容不管人。 */
  it('editor 能管内容，但不能管用户', () => {
    const editor = actor(1, 'editor')
    expect(canManageArticles(editor)).toBe(true)
    expect(canManageUsers(editor)).toBe(false)
  })

  /** admin 是唯一能进用户管理域的角色。 */
  it('admin 内容域与用户域都能管', () => {
    const admin = actor(2, 'admin')
    expect(canManageArticles(admin)).toBe(true)
    expect(canManageUsers(admin)).toBe(true)
    expect(hasAnyManagePower(admin)).toBe(true)
  })

  /** member 只投稿，不进后台管理区。 */
  it('member 没有任何管理能力', () => {
    const member = actor(3, 'member')
    expect(canManageArticles(member)).toBe(false)
    expect(canManageUsers(member)).toBe(false)
    expect(hasAnyManagePower(member)).toBe(false)
  })

  /** 未登录 / 会话未恢复时一律拒绝，不能因为 undefined 而放行。 */
  it('匿名（null / undefined）一律无权', () => {
    expect(canManageArticles(null)).toBe(false)
    expect(canManageUsers(null)).toBe(false)
    expect(canManageArticles(undefined)).toBe(false)
    expect(hasAnyManagePower(undefined)).toBe(false)
  })
})

describe('归属越权 canOperateOwned（对应契约 x-authz.ownerOverride）', () => {
  /** 契约语义：虽未达 minRole，但操作的是自己的资源 → 放行。 */
  it('未达 minRole 但操作本人资源时放行', () => {
    expect(canOperateOwned(actor(7, 'member'), 7, 'editor')).toBe(true)
  })

  /** 未达 minRole 且是别人的资源 → 拒绝，前端据此隐藏必然 403 的按钮。 */
  it('未达 minRole 且操作他人资源时拒绝', () => {
    expect(canOperateOwned(actor(7, 'member'), 99, 'editor')).toBe(false)
  })

  /** 达到 minRole 后与归属无关。 */
  it('达到 minRole 时无论归属均放行', () => {
    expect(canOperateOwned(actor(1, 'admin'), 99, 'editor')).toBe(true)
    expect(canOperateOwned(actor(1, 'editor'), 99, 'editor')).toBe(true)
  })

  /** 无主资源（ownerId 为空）只能靠角色，不能被误判为"自己的"。 */
  it('资源无主时只认角色，不让未达标者蒙混过关', () => {
    expect(canOperateOwned(actor(7, 'member'), undefined, 'editor')).toBe(false)
    expect(canOperateOwned(actor(1, 'admin'), undefined, 'editor')).toBe(true)
  })

  /** 匿名即资源"归自己"也不放行。 */
  it('匿名一律拒绝，即便 ownerId 命中', () => {
    expect(canOperateOwned(null, 7, 'editor')).toBe(false)
    expect(canOperateOwned(undefined, 7, 'editor')).toBe(false)
  })

  /** 评论删除是归属判定的最大使用方，单独钉住。 */
  it('canDeleteComment 复用归属判定：本人可删、他人不可删、editor 任意删', () => {
    expect(canDeleteComment(actor(7, 'member'), 7)).toBe(true)
    expect(canDeleteComment(actor(7, 'member'), 8)).toBe(false)
    expect(canDeleteComment(actor(1, 'editor'), 8)).toBe(true)
  })
})
