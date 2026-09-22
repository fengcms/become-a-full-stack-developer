/**
 * @file lib/api/auth.ts
 * @description 认证端点（客户端）。走 lib/request 内核，带 token / 401 刷新。
 *   登录/注册/登出/当前用户；refresh 由请求内核自动处理。
 * @module web-frontend/lib/api
 * @date 2026-09-17
 */

import { request } from '@/lib/request'
import type { components } from '@/types/api.gen'

/** 登录入参。 */
export type LoginRequest = components['schemas']['LoginRequest']
/** 注册入参。 */
export type RegisterRequest = components['schemas']['RegisterRequest']
/** 认证结果。 */
export type AuthResult = components['schemas']['AuthResult']
/** 当前用户。 */
export type User = components['schemas']['User']

/**
 * 注册新会员。
 *
 * @param data - 注册信息（username/email/password/nickname?）。
 */
export const register = (data: RegisterRequest): Promise<AuthResult> =>
  request<AuthResult>('/auth/register', {
    method: 'POST',
    body: data,
    skipAuth: true,
    skipRefresh: true,
    skipAuthRedirect: true,
  })

/**
 * 账号密码登录。
 *
 * @param data - 登录信息（username/password）。
 */
export const login = (data: LoginRequest): Promise<AuthResult> =>
  request<AuthResult>('/auth/login', {
    method: 'POST',
    body: data,
    skipAuth: true,
    skipRefresh: true,
    skipAuthRedirect: true,
  })

/**
 * 登出。清后端 HttpOnly Cookie + 前端内存会话。
 */
export const logout = (): Promise<void> =>
  request<void>('/auth/logout', { method: 'POST', skipAuthRedirect: true })

/**
 * 获取当前登录用户。
 */
export const getMe = (): Promise<User> => request<User>('/auth/me', { skipRefresh: true })
