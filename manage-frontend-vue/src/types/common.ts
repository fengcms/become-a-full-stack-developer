/**
 * @file src/types/common.ts
 * @description 共享类型层：把 api.gen.ts（契约机器生成，禁止手改）里的 schema 提炼成好用的业务别名。
 *   铁律：任何与后端交换的数据结构，类型都必须溯源到 api.gen.ts。
 *   手写 interface 描述后端返回 = 契约漂移的开始。
 * @module manage-frontend/types
 * @date 2026-08-29
 */

import type { components } from './api.gen'

type Schemas = components['schemas']

/* ---------- 信封与分页 ---------- */

/** 契约错误码枚举（数字码）。0 = 成功。 */
export type ErrorCode = Schemas['ErrorCode']

/** 业务错误码：从 ErrorCode 里剔除 0。 */
export type BizErrorCode = Exclude<ErrorCode, 0>

/**
 * 统一响应信封。契约 §ApiResponse。
 * 注意：data 在 gen 里是 unknown，此处用泛型收窄，业务侧按需指定。
 */
export interface ApiResponse<T = unknown> {
  code: ErrorCode
  message: string
  data?: T
  requestId: string
  timestamp: string
}

/** 分页元信息。契约 §Pagination。 */
export type Pagination = Schemas['Pagination']

/**
 * 分页结果通用形状：`{ list, pagination }`。
 * ⚠️ 与参考项目的 `{ items, total }` 不同，本契约用 list + pagination 对象。
 */
export interface Page<T> {
  list: T[]
  pagination: Pagination
}

/**
 * 分页查询入参的公共部分。
 *
 * ⚠️ 刻意用 type 而不是 interface：TS 只给**类型别名**隐式索引签名，
 * interface 没有。而请求层的 query 参数是 `Record<string, 标量>`，
 * 用 interface 定义查询入参会在传参处报 "Index signature is missing"。
 */
export type PageQuery = {
  page?: number
  pageSize?: number
}

/* ---------- 业务实体 ---------- */

export type User = Schemas['User']
export type UserRole = User['role']
export type UserStatus = User['status']

export type Article = Schemas['Article']
export type ArticleSummary = Schemas['ArticleSummary']
export type ArticleStatus = Article['status']
export type ArticleCreate = Schemas['ArticleCreate']

export type Category = Schemas['Category']
export type CategoryNode = Schemas['CategoryNode']
export type Tag = Schemas['Tag']

export type Comment = Schemas['Comment']
export type CommentStatus = Comment['status']
export type CommentModerateRequest = Schemas['CommentModerateRequest']

export type Attachment = Schemas['Attachment']
export type SiteSetting = Schemas['SiteSetting']
export type SiteSettingUpdate = Schemas['SiteSettingUpdate']
export type SiteStats = Schemas['SiteStats']
export type CategoryStat = Schemas['CategoryStat']
export type Notification = Schemas['Notification']

/* ---------- 认证 ---------- */

export type LoginRequest = Schemas['LoginRequest']
export type RegisterRequest = Schemas['RegisterRequest']
export type AuthResult = Schemas['AuthResult']
export type ChangePasswordRequest = Schemas['ChangePasswordRequest']
export type AdminResetPasswordRequest = Schemas['AdminResetPasswordRequest']
export type ProfileUpdateRequest = Schemas['ProfileUpdateRequest']

/** 4001 参数校验失败时 data 的结构。 */
export type ValidationErrorList = Schemas['ValidationErrorList']
export type ValidationError = Schemas['ValidationError']

/* ---------- 分页别名（契约里是具名 schema，此处统一收口到 Page<T>） ---------- */

export type ArticlePage = Page<ArticleSummary>
export type UserPage = Page<User>
export type CommentPage = Page<Comment>
export type AttachmentPage = Page<Attachment>
export type NotificationPage = Page<Notification>
