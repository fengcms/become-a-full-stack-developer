/**
 * @file src/components/dashboard/StatCard.tsx
 * @description 仪表盘统计卡片：标题 + 图标 + 数值（loading 时显示骨架）。
 *   从 DashboardPage 抽出，便于在仪表盘复用且不撑大页面文件。
 * @module manage-frontend/components/dashboard
 * @date 2026-08-29
 */

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 单个统计数字卡片。
 *
 * @param label - 指标名。
 * @param value - 数值（undefined 时显示占位符 —）。
 * @param icon - 指标图标。
 * @param loading - 是否加载中（显示骨架而非数值）。
 * @param hint - 数值下方的补充说明。
 */
export const StatCard = ({
  label,
  value,
  icon: Icon,
  loading,
  hint,
}: {
  label: string
  value?: number
  icon: LucideIcon
  loading?: boolean
  hint?: string
}) => (
  <Card className="hover-lift">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <Icon className="size-4 text-muted-foreground/60" aria-hidden />
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="text-2xl font-semibold tabular-nums">
          {value === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(value)}
        </div>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p> : null}
    </CardContent>
  </Card>
)
