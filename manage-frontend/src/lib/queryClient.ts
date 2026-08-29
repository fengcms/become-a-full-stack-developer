/**
 * @file src/lib/queryClient.ts
 * @description React Query 全局配置。
 *
 * 默认重试策略是这里最值得较真的地方：React Query 默认失败重试 3 次，
 * 而后台系统里绝大多数失败是 403 / 404 / 4001 —— 重试三遍只会把同一个错误
 * 慢放三倍，还白烧后端配额。所以只对「可能是抖动」的错误重试。
 * @module manage-frontend/lib
 * @date 2026-08-29
 */

import { QueryClient } from '@tanstack/react-query'
import { ErrCode } from '@/lib/errorCodes'
import { isApiError } from '@/lib/request'

/**
 * 是否值得重试：只重试「断网抖动」与「服务端 5000」，最多 2 次。
 * 403/404/4001 是确定性错误，重试无意义。
 * @param failureCount - 已失败次数。
 * @param error - 错误对象。
 * @returns 是否继续重试。
 */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 2) return false
  if (!isApiError(error)) return false
  if (error.status === 0) return true // 断网抖动
  return error.code === ErrCode.INTERNAL
}

/** 全局 QueryClient 实例。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // 后台数据「够新」的窗口。太短会让切页签就刷一遍列表，闪得难受
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // 写操作绝不自动重试：重复提交比失败可怕得多
      retry: false,
    },
  },
})

/** 查询键工厂。集中管理避免手写字符串数组拼错导致缓存互不命中。 */
export const qk = {
  site: {
    publicSettings: ['site', 'settings', 'public'] as const,
    adminSettings: ['site', 'settings', 'admin'] as const,
    stats: ['site', 'stats'] as const,
    categoryStats: ['site', 'category-stats'] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
  articles: {
    list: (q: unknown) => ['articles', 'list', q] as const,
    detail: (id: number | string) => ['articles', 'detail', id] as const,
  },
  categories: {
    tree: ['categories', 'tree'] as const,
  },
  comments: {
    list: (q: unknown) => ['comments', 'list', q] as const,
  },
  tags: {
    list: ['tags', 'list'] as const,
  },
  users: {
    list: (q: unknown) => ['users', 'list', q] as const,
  },
}
