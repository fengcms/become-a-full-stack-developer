/**
 * @file src/hooks/useToast.ts
 * @description 全局 toast 薄封装：统一成功/信息文案，错误走 resolveErrorMessage 不露后端原文。
 *   底层用 sonner（<Toaster/> 已在 App.tsx 注册）。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { toast } from 'sonner'
import { resolveErrorMessage } from '@/lib/errorCodes'
import { isApiError } from '@/lib/request'

/** 可选 toast 配置。 */
export type ToastOptions = { description?: string; duration?: number }

/**
 * 全局 toast 钩子。返回 success/info/error 三个方法。
 * @returns 统一封装的 toast 方法集合。
 */
export const useToast = () => {
  /** 成功提示。 */
  const success = (message: string, opts?: ToastOptions) => toast.success(message, opts)
  /** 普通信息提示。 */
  const info = (message: string, opts?: ToastOptions) => toast(message, opts)
  /** 错误提示：优先用契约文案，避免把后端原文透给用户。 */
  const error = (err: unknown, fallback = '操作失败，请稍后重试') => {
    const message = isApiError(err) ? resolveErrorMessage(err.code, err.message) : fallback
    toast.error(message)
  }
  return { success, info, error }
}
