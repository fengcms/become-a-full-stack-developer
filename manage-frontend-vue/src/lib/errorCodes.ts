/**
 * @file src/lib/errorCodes.ts
 * @description 契约错误码 → 前端文案 / 行为策略。对齐 docs/api/openapi.v1.yaml v1.11.0 的 ErrorCode 枚举，
 *   与后端 node-backend/src/shared/codes.ts 一一对应。
 *
 * 为什么前端还要抄一份文案：后端 message 是给开发者兜底的，前端要按场景改写
 * （例如登录页的 1001 要写「账号或密码不正确」，而不是原样透出）。
 * 但**码值本身绝不在别处硬编码数字**，一律从这里取。
 * @module manage-frontend/lib
 * @date 2026-08-29
 */

import type { BizErrorCode, ErrorCode } from '@/types/common'

/** 错误码常量。使用处写 `ErrCode.FORBIDDEN` 而不是 `2001`。 */
export const ErrCode = {
  /** 成功 */
  OK: 0,
  /** 用户名或密码错误（401） */
  USERNAME_OR_PASSWORD_ERROR: 1001,
  /** 访问令牌无效或过期（401）→ 触发静默刷新 */
  TOKEN_INVALID: 1002,
  /** 刷新令牌失效（401）→ 直接踢回登录页 */
  REFRESH_TOKEN_INVALID: 1003,
  /** 未携带访问令牌（401）→ 触发静默刷新 */
  TOKEN_MISSING: 1004,
  /** 账号被禁用（401）→ 不可刷新，踢回登录页 */
  ACCOUNT_DISABLED: 1005,
  /** 权限不足（403） */
  FORBIDDEN: 2001,
  /** 资源不存在（404） */
  NOT_FOUND: 3001,
  /** 唯一约束冲突 / 被引用占用（409） */
  CONFLICT: 3002,
  /** 状态机不允许该转移（409） */
  STATE_CONFLICT: 3003,
  /** 参数校验失败（400），data 为 ValidationErrorList */
  VALIDATION: 4001,
  /** 服务内部错误（500） */
  INTERNAL: 5000,
  /** 限流（429） */
  RATE_LIMITED: 5001,
} as const

/**
 * 业务码 → 中文文案。
 * 用计算属性键 + Record<BizErrorCode, string>：契约新增码而这里漏配，编译期直接报错。
 */
export const ERROR_MESSAGES: Record<BizErrorCode, string> = {
  [ErrCode.USERNAME_OR_PASSWORD_ERROR]: '账号或密码不正确',
  [ErrCode.TOKEN_INVALID]: '登录状态已过期，请重新登录',
  [ErrCode.REFRESH_TOKEN_INVALID]: '登录状态已失效，请重新登录',
  [ErrCode.TOKEN_MISSING]: '请先登录',
  [ErrCode.ACCOUNT_DISABLED]: '账号已被禁用，请联系管理员',
  [ErrCode.FORBIDDEN]: '当前角色无权执行该操作',
  [ErrCode.NOT_FOUND]: '数据不存在或已被删除',
  [ErrCode.CONFLICT]: '数据冲突：已存在相同记录，或正被其他数据引用',
  [ErrCode.STATE_CONFLICT]: '当前状态不允许该操作',
  [ErrCode.VALIDATION]: '提交的内容有误，请检查后重试',
  [ErrCode.INTERNAL]: '服务异常，请稍后重试',
  [ErrCode.RATE_LIMITED]: '操作过于频繁，请稍后再试',
}

/**
 * 需要走「静默刷新」的码：访问令牌本身的问题。
 * 1003/1005 不在此列——刷新令牌失效或账号禁用，重试也没用，必须重新登录。
 */
export const REFRESHABLE_CODES: readonly ErrorCode[] = [
  ErrCode.TOKEN_INVALID,
  ErrCode.TOKEN_MISSING,
]

/** 必须立刻登出的码。 */
export const FORCE_LOGOUT_CODES: readonly ErrorCode[] = [
  ErrCode.REFRESH_TOKEN_INVALID,
  ErrCode.ACCOUNT_DISABLED,
]

/**
 * 取文案：未知码兜底用后端 message，再兜底一句通用话术。
 * @param code - 业务错误码。
 * @param fallback - 后端 message 或自定义兜底文案。
 * @returns 给用户看的中文文案。
 */
export const resolveErrorMessage = (code: number, fallback?: string): string => {
  const known = ERROR_MESSAGES[code as BizErrorCode]
  if (known) return known
  return fallback?.trim() || '请求失败，请稍后重试'
}

/**
 * 该码是否属于「可静默刷新」范畴。
 * @param code - 业务错误码。
 */
export const isRefreshable = (code: number): boolean =>
  REFRESHABLE_CODES.includes(code as ErrorCode)

/**
 * 该码是否必须立刻登出（刷新令牌失效 / 账号禁用）。
 * @param code - 业务错误码。
 */
export const shouldForceLogout = (code: number): boolean =>
  FORCE_LOGOUT_CODES.includes(code as ErrorCode)
