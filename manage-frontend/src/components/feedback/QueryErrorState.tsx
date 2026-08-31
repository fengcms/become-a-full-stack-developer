/**
 * @file src/components/feedback/QueryErrorState.tsx
 * @description 列表 / 详情请求失败的内联错误态：图标 + 文案 + 重试按钮。
 *   取代「白屏 / 旧数据残留」，配合 React Query 的 isError / refetch 使用。
 * @module manage-frontend/components/feedback
 * @date 2026-08-31
 */

import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 请求错误内联状态。
 * @param title - 主标题，默认「加载失败」。
 * @param description - 说明文案，默认提示稍后重试；传 API 错误 message 更精准。
 * @param onRetry - 重试回调（通常 React Query 的 refetch）；不传则不显示按钮。
 */
export const QueryErrorState = ({
  title = '加载失败',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-12 text-center">
    <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
      <AlertTriangle className="size-6" aria-hidden />
    </div>
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {description ?? '数据加载出错，请稍后重试'}
      </p>
    </div>
    {onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="mr-1.5 size-4" aria-hidden />
        重试
      </Button>
    ) : null}
  </div>
)
