/**
 * @file src/components/feedback/FullPageLoading.tsx
 * @description 整页等待组件。用于会话恢复、路由懒加载这类「还不知道该渲染什么」的间隙。
 * @module manage-frontend/components/feedback
 * @date 2026-08-29
 */

import { LoaderCircle } from 'lucide-react'

/**
 * 整页加载占位。
 * @param label - 加载提示文案，默认「加载中」。
 */
export const FullPageLoading = ({ label = '加载中' }: { label?: string }) => (
  <div className="app-bg flex min-h-screen flex-col items-center justify-center gap-3">
    <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
)
