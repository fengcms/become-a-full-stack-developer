/**
 * @file src/pages/dashboard/DashboardPage.tsx
 * @description 仪表盘（M2-17，Phase 5 收口）。
 *   统计卡片来自公开 GET /stats；分类分布用 recharts 环形图（StatsChart）呈现 GET /categories/stats；
 *   近期文章来自 GET /admin/articles?sort=-createdAt、近期评论来自 GET /admin/comments（editor+）。
 *   本页同时是「活体探针」：能渲染即代表代理/信封/令牌/分页整条链路存活。
 * @module manage-frontend/pages/dashboard
 * @date 2026-08-29
 */

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Eye, FileClock, FileText, MessageSquare, Users } from 'lucide-react'
import { listAdminArticles } from '@/api/articles'
import { listAdminComments } from '@/api/comments'
import { StatCard } from '@/components/dashboard/StatCard'
import { StatsChart } from '@/components/dashboard/StatsChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategoryStats, useSiteStats } from '@/hooks/useSite'
import { canManageArticles, canModerateComments } from '@/lib/permission'
import { useAuthStore } from '@/store/auth'
import type { ArticleStatus, CommentStatus } from '@/types/common'

/** 文章状态 → 语义令牌类（与 ArticleListPage 一致）。 */
const ARTICLE_STATUS: Record<ArticleStatus, string> = {
  draft: 'bg-status-draft text-status-draft-fg',
  pending: 'bg-status-pending text-status-pending-fg',
  published: 'bg-status-published text-status-published-fg',
}
const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: '草稿',
  pending: '待审',
  published: '已发布',
}
/** 评论状态 → 语义令牌类（与 CommentListPage 一致）。 */
const COMMENT_STATUS: Record<CommentStatus, string> = {
  approved: 'bg-status-approved text-status-approved-fg',
  rejected: 'bg-status-rejected text-status-rejected-fg',
  reviewing: 'bg-status-reviewing text-status-reviewing-fg',
}
const COMMENT_STATUS_LABEL: Record<CommentStatus, string> = {
  approved: '通过',
  rejected: '拒绝',
  reviewing: '复核中',
}

/** 小状态标签。 */
const StatusTag = ({ cls, label }: { cls: string; label: string }) => (
  <span className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
    {label}
  </span>
)

/** 日期格式化（与列表页一致）。 */
const formatDate = (v?: string | null) => (v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '—')

/**
 * 仪表盘。展示站点整体指标、分类分布与近期动态。
 */
const DashboardPage = () => {
  const user = useAuthStore((s) => s.user)
  const isEditor = canManageArticles(user)
  const canComments = canModerateComments(user)

  const stats = useSiteStats()
  const categories = useCategoryStats()

  // 待审文章数：editor+ 才看，只要 total（pageSize 取 1 少传数据）
  const pending = useQuery({
    queryKey: ['articles', 'admin', 'pending-count'],
    queryFn: () => listAdminArticles({ status: 'pending', pageSize: 1 }),
    enabled: isEditor,
    select: (page) => page.pagination.total,
  })

  // 近期文章 Top 5：契约 admin/articles 支持 sort，按 createdAt 倒序
  const recentArticles = useQuery({
    queryKey: ['articles', 'admin', 'recent'],
    queryFn: () => listAdminArticles({ sort: '-createdAt', pageSize: 5 }),
    enabled: isEditor,
    select: (page) => page.list,
  })

  // 近期评论 Top 5：⚠️ 契约 admin/comments 不支持 sort（仅 page/pageSize/status/articleId），
  // 取默认前 5 条，前端按 createdAt 兜底倒序，确保「近期」语义稳定、不依赖后端默认顺序。
  const recentComments = useQuery({
    queryKey: ['comments', 'admin', 'recent'],
    queryFn: () => listAdminComments({ pageSize: 5 }),
    enabled: canComments,
    select: (page) =>
      [...page.list]
        .filter((c) => Boolean(c.createdAt))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 5),
  })

  return (
    <div>
      <PageHeader
        title="仪表盘"
        description={`欢迎回来，${user?.nickname || user?.username || ''}。以下是站点当前的整体情况。`}
      />

      <div
        className={`grid gap-4 sm:grid-cols-2 ${isEditor ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
      >
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
        {isEditor ? (
          <StatCard
            label="待审文章"
            value={pending.data}
            icon={FileClock}
            loading={pending.isPending}
            hint="会员投稿默认进入待审，需编辑过审后才会公开"
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">分类文章分布</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.isPending ? (
              <div className="h-64 w-full animate-pulse rounded-md bg-muted" />
            ) : (categories.data?.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">暂无分类数据</p>
            ) : (
              <StatsChart data={categories.data ?? []} />
            )}
          </CardContent>
        </Card>

        {isEditor ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">近期文章</CardTitle>
            </CardHeader>
            <CardContent>
              {recentArticles.isPending ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (recentArticles.data?.length ?? 0) === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">暂无文章</p>
              ) : (
                <ul className="space-y-3">
                  {recentArticles.data?.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={a.title}>
                          {a.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {a.categoryName ? `${a.categoryName} · ` : ''}
                          {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <StatusTag
                        cls={ARTICLE_STATUS[a.status]}
                        label={ARTICLE_STATUS_LABEL[a.status]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canComments ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">近期评论</CardTitle>
            </CardHeader>
            <CardContent>
              {recentComments.isPending ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (recentComments.data?.length ?? 0) === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">暂无评论</p>
              ) : (
                <ul className="space-y-3">
                  {recentComments.data?.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          <span className="font-medium">{c.userName || '匿名'}</span>
                          <span className="text-muted-foreground">：{c.content}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(c.createdAt)}
                        </p>
                      </div>
                      <StatusTag
                        cls={COMMENT_STATUS[c.status]}
                        label={COMMENT_STATUS_LABEL[c.status]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export default DashboardPage
