/**
 * @file src/pages/dashboard/DashboardPage.tsx
 * @description 仪表盘。首波它承担一个额外职责：**当活体探针用**。
 *   同时打公开端点（/stats、/categories/stats）和鉴权端点（/admin/articles?status=pending），
 *   所以只要这一页数字全出来了，就意味着「代理通 → 信封解对 → 令牌带上 → 分页字段读对」整条链路都是活的。
 * @module manage-frontend/pages/dashboard
 * @date 2026-08-29
 */

import { useQuery } from '@tanstack/react-query'
import { Eye, FileClock, FileText, MessageSquare, Users } from 'lucide-react'
import { listAdminArticles } from '@/api/articles'
import { StatCard } from '@/components/dashboard/StatCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategoryStats, useSiteStats } from '@/hooks/useSite'
import { canManageArticles } from '@/lib/permission'
import { useAuthStore } from '@/store/auth'

/**
 * 仪表盘。展示站点整体指标与分类分布；编辑/管理员可见「待审文章」数。
 */
const DashboardPage = () => {
  const user = useAuthStore((s) => s.user)
  const stats = useSiteStats()
  const categories = useCategoryStats()

  // 待审文章数：只要 total，pageSize 取 1 少传数据
  const pending = useQuery({
    queryKey: ['articles', 'admin', 'pending-count'],
    queryFn: () => listAdminArticles({ status: 'pending', pageSize: 1 }),
    enabled: canManageArticles(user),
    select: (page) => page.pagination.total,
  })

  const maxCount = Math.max(1, ...(categories.data ?? []).map((c) => c.articleCount))

  return (
    <div>
      <PageHeader
        title="仪表盘"
        description={`欢迎回来，${user?.nickname || user?.username || ''}。以下是站点当前的整体情况。`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="已发布文章"
          value={stats.data?.articleCount}
          icon={FileText}
          loading={stats.isPending}
        />
        <StatCard
          label="已通过评论"
          value={stats.data?.commentCount}
          icon={MessageSquare}
          loading={stats.isPending}
        />
        <StatCard
          label="活跃会员"
          value={stats.data?.memberCount}
          icon={Users}
          loading={stats.isPending}
        />
        <StatCard
          label="累计阅读量"
          value={stats.data?.viewTotal}
          icon={Eye}
          loading={stats.isPending}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {canManageArticles(user) ? (
          <StatCard
            label="待审文章"
            value={pending.data}
            icon={FileClock}
            loading={pending.isPending}
            hint="会员投稿默认进入待审，需编辑过审后才会公开"
          />
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">分类文章分布</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.isPending ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (categories.data?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无分类数据</p>
            ) : (
              <ul className="space-y-3">
                {categories.data?.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm" title={c.name}>
                      {c.name}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="gradient-brand block h-full rounded-full"
                        style={{ width: `${(c.articleCount / maxCount) * 100}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {c.articleCount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
