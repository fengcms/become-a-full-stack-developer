/**
 * @file src/pages/profile/FavoritesPage.tsx
 * @description 我的收藏（member）。GET /me/favorites → ArticlePage（分页），可取消收藏（DELETE 幂等）。
 *   写后失效收藏列表，红点与计数不受影响。取消即列表移除该行。
 * @module manage-frontend/pages/profile
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { useState } from 'react'
import { TablePagination } from '@/components/data/TablePagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFavorites, useToggleFavorite } from '@/hooks/useMe'
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

/** 我的收藏页。 */
const FavoritesPage = () => {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useFavorites({ page, pageSize: 10 })
  const toggle = useToggleFavorite()

  return (
    <Card>
      <CardHeader>
        <CardTitle>我的收藏</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : data && data.list.length > 0 ? (
          <>
            <ul className="divide-y">
              {data.list.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ articleId: a.id, add: false })}
                  >
                    取消
                  </Button>
                </li>
              ))}
            </ul>
            <TablePagination
              page={data.pagination.page}
              pageSize={data.pagination.pageSize}
              total={data.pagination.total}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">还没有收藏任何文章</p>
        )}
      </CardContent>
    </Card>
  )
}

export default FavoritesPage
