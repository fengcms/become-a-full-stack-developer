/**
 * @file store/auth.ts
 * @description 客户端会话状态（Zustand）。仅存 access token 与用户基本信息，
 *   refresh token 走 HttpOnly Cookie，前端不触碰。
 *   服务端组件（RSC）不使用此 store；认证判断走 lib/auth.ts 从 Cookie 读取。
 * @module web-frontend/store
 * @date 2026-09-16
 */

import { create } from 'zustand'

/** 公开用户信息（脱敏后的 User 视图）。 */
export interface PublicUser {
  id: number
  username: string
  nickname: string
  avatarUrl?: string
  role: 'admin' | 'member'
}

/** 认证结果（登录/刷新返回）。 */
export interface AuthResult {
  accessToken: string
  refreshToken?: string
  user: PublicUser
}

/** 启动状态。 */
export type BootStatus = 'idle' | 'booting' | 'ready'

interface AuthState {
  accessToken: string | null
  user: PublicUser | null
  bootStatus: BootStatus
  setSession: (auth: AuthResult) => void
  setUser: (user: PublicUser) => void
  setBootStatus: (status: BootStatus) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootStatus: 'idle',
  setSession: (auth) =>
    set({
      accessToken: auth.accessToken,
      user: auth.user,
      bootStatus: 'ready',
    }),
  setUser: (user) => set({ user }),
  setBootStatus: (status) => set({ bootStatus: status }),
  clear: () => set({ accessToken: null, user: null, bootStatus: 'ready' }),
}))
