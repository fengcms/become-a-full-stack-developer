/**
 * @file src/lib/permission.ts
 * @description 能力判定。组件里只问「我能不能做这件事」（canManageUsers），不问「我是不是 admin」。
 *
 * 为什么要这层间接：角色和能力的映射会变（比如以后 editor 也能看用户列表），
 * 散落在 20 个组件里的 `user.role === 'admin'` 到时候要改 20 处，
 * 收在这里就只改一处。每个函数的注释都标了它对应的契约端点，改之前先看契约。
 * @module manage-frontend/lib
 * @date 2026-08-29
 */

import { roleAtLeast } from '@/config/roles'
import type { User, UserRole } from '@/types/common'

/** 当前操作者的简版身份（只要 id 与 role）。 */
type Actor = Pick<User, 'id' | 'role'> | null | undefined

/** 从 actor 取角色，空值归一为 undefined。 */
const roleOf = (actor: Actor): UserRole | undefined => actor?.role ?? undefined

/* ---------- 内容域：minRole = editor ---------- */

/** GET /admin/articles、PUT/DELETE /articles/{id}、POST /admin/articles/{id}/approve */
export const canManageArticles = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')

/** GET /admin/comments、PATCH /comments/{id}/status、DELETE /comments/{id} */
export const canModerateComments = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')

/** POST/PUT/DELETE /categories */
export const canManageCategories = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')

/** POST/PUT/DELETE /tags */
export const canManageTags = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')

/** DELETE /attachments/{id}（非本人附件需 editor） */
export const canManageAttachments = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')

/* ---------- 管理域：minRole = admin ---------- */

/** GET /users、GET/PATCH /users/{id} */
export const canManageUsers = (actor: Actor) => roleAtLeast(roleOf(actor), 'admin')

/** POST /admin/users/{id}/reset-password */
export const canResetPassword = (actor: Actor) => roleAtLeast(roleOf(actor), 'admin')

/** GET/PATCH /admin/site/settings */
export const canManageSiteSettings = (actor: Actor) => roleAtLeast(roleOf(actor), 'admin')

/**
 * POST /admin/articles/{id}/status —— minRole = admin。
 * 注意它和 approve 不是一回事：approve 是 editor 的「过审」，
 * status 是 admin 的「任意状态强改」（含把已发布的打回 draft）。
 */
export const canForceArticleStatus = (actor: Actor) => roleAtLeast(roleOf(actor), 'admin')

/* ---------- 归属判定（对应契约 x-authz.ownerOverride）---------- */

/**
 * 本人资源可越权。契约里 `editor+owner` 的含义是：
 * 「达到 editor 可操作任意人的，或者虽未达到但操作的是自己的」。
 * 前端据此决定按钮显隐，避免给 member 展示一个必然 403 的删除按钮。
 *
 * @param actor - 当前用户（取 id / role）。
 * @param ownerId - 资源所有者 id（可空表示无主）。
 * @param min - 操作该资源非本人时所需的最低角色。
 * @returns 有权操作时为真。
 */
export const canOperateOwned = (
  actor: Actor,
  ownerId: number | undefined,
  min: UserRole,
): boolean => {
  if (!actor) return false
  if (roleAtLeast(actor.role, min)) return true
  return ownerId !== undefined && actor.id === ownerId
}

/** DELETE /comments/{id}：editor 或本人。 */
export const canDeleteComment = (actor: Actor, commentUserId?: number) =>
  canOperateOwned(actor, commentUserId, 'editor')

/** PUT/DELETE /articles/{id}：editor 或本人。 */
export const canEditArticle = (actor: Actor, authorId?: number) =>
  canOperateOwned(actor, authorId, 'editor')

/** 是否具备任意管理能力（用于决定要不要渲染侧边栏管理区）。 */
export const hasAnyManagePower = (actor: Actor) => roleAtLeast(roleOf(actor), 'editor')
