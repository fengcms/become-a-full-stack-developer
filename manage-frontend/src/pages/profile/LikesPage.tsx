/**
 * @file src/pages/profile/LikesPage.tsx
 * @description 我的点赞（member）。GET /me/likes → **裸数组** ArticleSummary[]（契约 §R5 非分页，已钉测试）。
 *   渲染点赞文章列表（标题 / 状态徽标 / 分类 / 时间）。无分页对象（后端不返 total），取固定页展示。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { Heart } from 'lucide-react'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLikes } from '@/hooks/useMe'
import { isApiError } from '@/lib/request'
import type { ArticleStatus } from '@/types/common'

/** 文章状态徽标 class。 */
const STATUS_CLS: Record<ArticleStatus, string> = {
  draft: 'bg-status-draft text-status-draft-fg',
  pending: 'bg-status-pending text-status-pending-fg',
  published: 'bg-status-published text-status-published-fg',
}

/** 状态中文。 */
const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: '草稿',
  pending: '待审',
  published: '已发布',
}

/** 我的点赞页。 */
const LikesPage = () => {
  const { data, isLoading, isError, error, refetch } = useLikes({ pageSize: 20 })

  return (
    <Card>
      <CardHeader>
        <CardTitle>我的点赞</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : isError ? (
          <QueryErrorState
            description={isApiError(error) ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : data && data.length > 0 ? (
          <ul className="divide-y">
            {data.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <Heart className="h-4 w-4 shrink-0 text-rose-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.categoryName ?? '未分类'} ·{' '}
                    {a.createdAt ? format(new Date(a.createdAt), 'yyyy-MM-dd') : '-'}
                  </div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLS[a.status]}`}>
                  {STATUS_LABEL[a.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">还没有点赞任何文章</p>
        )}
      </CardContent>
    </Card>
  )
}

export default LikesPage
