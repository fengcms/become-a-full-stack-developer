/**
 * src/store/auth.ts
 * 认证状态：accessToken / refreshToken / user，全部只在内存（方案 B）。
 *
 * 两条纪律：
 * 1. **不落 localStorage**。令牌进 localStorage 就是把 XSS 的收益从「一次会话」放大到「长期账号」。
 *    刷新页面丢失会话是可接受代价——boot 时用后端写的 HttpOnly Cookie 兜底静默恢复（见 lib/request.ts）。
 * 2. **本文件不发任何请求**。store 只管状态，接口调用在 api/ 层，刷新逻辑在 request 层。
 *    这样 request.ts 可以安全地 import 本 store（读令牌），不会形成循环依赖。
 */

import { create } from 'zustand'
import type { AuthResult, User } from '@/types/common'

/** 会话引导状态：决定路由守卫是「等」还是「踢」。 */
export type BootStatus = 'idle' | 'booting' | 'ready'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  /**
   * 应用启动时的静默恢复流程状态。
   * idle → 还没试过；booting → 正在尝试恢复，守卫必须等待，不能跳登录；ready → 结论已定。
   */
  bootStatus: BootStatus

  /** 登录 / 刷新成功后写入会话。refreshToken 采用旋转策略，每次都要覆盖。 */
  setSession: (auth: AuthResult) => void
  /** 仅更新 user（改资料后回写），不动令牌。 */
  setUser: (user: User) => void
  /** 仅更新访问令牌（刷新场景下后端未下发新 refreshToken 时）。 */
  setAccessToken: (token: string) => void
  setBootStatus: (status: BootStatus) => void
  /** 清空会话（登出 / 刷新令牌失效 / 账号禁用）。 */
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  bootStatus: 'idle',

  setSession: (auth) =>
    set((prev) => ({
      accessToken: auth.accessToken,
      // 后端旋转刷新令牌；若本次响应没带（浏览器走 Cookie 载体），保留原值不误清
      refreshToken: auth.refreshToken ?? prev.refreshToken,
      user: auth.user,
      bootStatus: 'ready',
    })),

  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBootStatus: (bootStatus) => set({ bootStatus }),

  clear: () =>
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      bootStatus: 'ready',
    }),
}))

/* ---------- 非 React 环境读取（请求层用）---------- */

/**
 * 读取当前会话快照（非 React 环境，如请求层）。
 * @returns 完整的认证状态。
 */
export const authSnapshot = () => useAuthStore.getState()

/* ---------- 选择器：按字段订阅，避免整对象变更导致无关组件重渲染 ---------- */

/** 当前登录用户（未登录为 null）。 */
export const useCurrentUser = () => useAuthStore((s) => s.user)

/** 是否已登录（同时具备 accessToken 与 user）。 */
export const useIsAuthenticated = () => useAuthStore((s) => Boolean(s.accessToken && s.user))

/** 会话引导状态。 */
export const useBootStatus = () => useAuthStore((s) => s.bootStatus)
