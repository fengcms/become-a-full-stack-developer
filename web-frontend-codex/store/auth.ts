/**
 * @file store/auth.ts
 * @description 客户端会话状态（Zustand）。仅存 access token 与用户基本信息，
 *   refresh token 走 HttpOnly Cookie，前端不触碰。
 *   服务端组件不读取此 store；私有请求由后端校验，会员页面使用客户端守卫。
 * @module web-frontend/store
 * @date 2026-09-16
 */

import { create } from 'zustand'

/** 登录用户信息（对齐契约 User 实体）。 */
export interface PublicUser {
  id: number
  username: string
  email?: string
  nickname: string
  avatar?: string | null
  role: 'admin' | 'editor' | 'member'
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
  generation: number
  accessToken: string | null
  user: PublicUser | null
  bootStatus: BootStatus
  setSession: (auth: AuthResult) => void
  setUser: (user: PublicUser) => void
  setBootStatus: (status: BootStatus) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  generation: 0,
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
  clear: () =>
    set((state) => ({
      generation: state.generation + 1,
      accessToken: null,
      user: null,
      bootStatus: 'ready',
    })),
}))
