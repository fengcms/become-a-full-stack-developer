/**
 * @file src/api/auth.ts
 * @description 认证相关接口。api/ 层的职责只有一条：把契约端点包成带类型的函数，
 *   不做状态管理、不做 toast、不做跳转。
 * @module manage-frontend/api
 * @date 2026-08-29
 */

import { http } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import type {
  AuthResult,
  ChangePasswordRequest,
  LoginRequest,
  ProfileUpdateRequest,
  User,
} from '@/types/common'

/**
 * 登录。POST /auth/login（公开）
 * skipAuth：不带旧令牌，避免用一个过期令牌污染登录请求。
 * skipAuthRedirect：1001（密码错）走 401，若不关掉全局兜底会在登录页触发一次「跳登录页」的自我循环。
 * @param payload - 用户名 + 密码。
 * @returns 登录结果（accessToken / refreshToken / user），并写入会话。
 */
export const login = async (payload: LoginRequest): Promise<AuthResult> => {
  const auth = await http.post<AuthResult>('/auth/login', payload, {
    skipAuth: true,
    skipAuthRedirect: true,
    skipRefresh: true,
  })
  useAuthStore.getState().setSession(auth)
  return auth
}

/**
 * 登出。POST /auth/logout
 * 本地状态必须无条件清掉——哪怕后端请求失败（网络断了、令牌已过期），
 * 用户点了登出就得真的退出，否则界面还停在已登录态，是最让人恼火的那类 bug。
 */
export const logout = async (): Promise<void> => {
  const { refreshToken } = useAuthStore.getState()
  try {
    await http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}, {
      skipAuthRedirect: true,
      skipRefresh: true,
    })
  } catch {
    // 吞掉：服务端作废失败不该阻塞本地登出
  } finally {
    useAuthStore.getState().clear()
  }
}

/**
 * 当前登录用户。GET /auth/me
 * @returns 当前用户完整信息。
 */
export const getCurrentUser = (): Promise<User> => http.get<User>('/auth/me')

/**
 * 本人资料。GET /me/profile
 * @returns 当前用户资料。
 */
export const getProfile = (): Promise<User> => http.get<User>('/me/profile')

/**
 * 更新本人资料。PATCH /me/profile（成功后回写本地 user）
 * @param payload - 资料更新字段。
 * @returns 更新后的用户。
 */
export const updateProfile = async (payload: ProfileUpdateRequest): Promise<User> => {
  const user = await http.patch<User>('/me/profile', payload)
  useAuthStore.getState().setUser(user)
  return user
}

/**
 * 修改本人密码。POST /me/change-password
 * @param payload - 旧密码 + 新密码。
 */
export const changePassword = (payload: ChangePasswordRequest): Promise<void> =>
  http.post<void>('/me/change-password', payload)
