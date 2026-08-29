/**
 * @file src/lib/request/session.ts
 * @description 会话副作用：全局未授权回调注册与强制登出。
 *   本文件只做「清本地会话 / 通知外层跳登录」这类副作用，自身不发请求
 *   （刷新请求在 core.ts）。因此只依赖 store/auth，不反向依赖 core，避免循环。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { useAuthStore } from '@/store/auth'

/** 未授权回调签名。request 层不认识 router，跳转交给 App 注册。 */
type UnauthorizedHandler = (reason: 'expired' | 'disabled') => void

/** 全局未授权回调 holder。由 App.tsx 在挂载时注册。 */
let unauthorizedHandler: UnauthorizedHandler | null = null

/**
 * 注册全局未授权回调。request 层在需要跳登录时调用它（令牌失效 / 账号禁用）。
 *
 * @param handler - 跳转处理器；传 null 可注销（组件卸载时清理用）。
 */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler
}

/**
 * 强制登出：清空本地会话并通知外层跳登录。
 * 用于「令牌失效」与「账号禁用」两种不可恢复场景——刷新也没用，只能回登录页。
 *
 * @param reason - 失效原因：`expired` 令牌过期，`disabled` 账号被禁用。
 */
export const forceLogout = (reason: 'expired' | 'disabled'): void => {
  useAuthStore.getState().clear()
  unauthorizedHandler?.(reason)
}
