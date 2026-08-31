/**
 * @file src/pages/articles/ArticleListPage.tsx
 * @description 文章管理列表页（Phase 1）。GET /admin/articles 驱动，支持状态筛选 / 关键词搜索 /
 *   排序 / 分页；行内操作含编辑、过审（pending）、删除。新建入口跳 /articles/new。
 * @module manage-frontend/pages/articles
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BatchActionBar } from '@/components/data/BatchActionBar'
import { type ColumnDef, DataTable } from '@/components/data/DataTable'
import { TablePagination } from '@/components/data/TablePagination'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useAdminArticles, useApproveArticle, useDeleteArticle } from '@/hooks/useArticles'
import { useTableQuery } from '@/hooks/useTableQuery'
import { useToast } from '@/hooks/useToast'
import type { ArticleStatus, ArticleSummary } from '@/types/common'

/** 状态中文标签。 */
const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: '草稿',
  pending: '待审',
  published: '已发布',
}

/**
 * 状态徽标配色。
 * 一律走 index.css 的语义令牌（status-draft / status-pending / status-published），
 * 明暗主题各自定义底色与前景色，不再硬编码 slate/amber/emerald 调色板（审阅 P3-3）。
 */
const STATUS_CLASS: Record<ArticleStatus, string> = {
  draft: 'bg-status-draft text-status-draft-fg',
  pending: 'bg-status-pending text-status-pending-fg',
  published: 'bg-status-published text-status-published-fg',
}

/** 状态徽标。 */
const StatusBadge = ({ status }: { status: ArticleStatus }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
    {STATUS_LABEL[status]}
  </span>
)

/** 日期格式化；空值回退「—」。 */
const formatDate = (v?: string | null) => (v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '—')

/**
 * 文章管理列表页。
 */
const ArticleListPage = () => {
  const navigate = useNavigate()
  const { page, pageSize, sort, query, setPage, setPageSize, setSort, setFilters } = useTableQuery()
  const status = (query.status as ArticleStatus | undefined) ?? undefined
  const keyword = (query.keyword as string | undefined) ?? ''
  // T3：搜索防抖，避免每次按键即 refetch
  const [kw, setKw] = useState(keyword)
  useEffect(() => {
    const t = setTimeout(() => setFilters({ keyword: kw || undefined }), 300)
    return () => clearTimeout(t)
  }, [kw, setFilters])

  const listQuery = { page, pageSize, sort, status, keyword: keyword || undefined }
  const { data, isLoading, isError, error, refetch } = useAdminArticles(listQuery)
  const approveMut = useApproveArticle()
  const deleteMut = useDeleteArticle()
  const [toDelete, setToDelete] = useState<ArticleSummary | null>(null)
  // T6：批量操作受控选择态
  const [selected, setSelected] = useState<Array<string | number>>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const [toBatchDelete, setToBatchDelete] = useState(false)
  const toast = useToast()

  /** T6：循环调用单行 mutation 实现批量；Promise.allSettled 容忍部分失败。 */
  const runBatch = async (label: string, fn: (id: number) => Promise<unknown>) => {
    const ids = selected.map(Number)
    if (ids.length === 0) return
    setBatchBusy(true)
    try {
      const results = await Promise.allSettled(ids.map(fn))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      refetch()
      setSelected([])
      setToBatchDelete(false)
      const fail = results.length - ok
      if (fail === 0) toast.success(`已${label} ${ok} 篇`)
      else toast.info(`已${label} ${ok} 篇，${fail} 篇失败`)
    } finally {
      setBatchBusy(false)
    }
  }

  /** 列定义。 */
  const columns: ColumnDef<ArticleSummary>[] = [
    { key: 'id', header: 'ID', sortable: true, sortKey: 'id', className: 'w-14' },
    { key: 'title', header: '标题', render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'status', header: '状态', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'categoryName', header: '分类', render: (r) => r.categoryName ?? '—' },
    { key: 'authorName', header: '作者', render: (r) => r.authorName ?? '—' },
    {
      key: 'updatedAt',
      header: '更新时间',
      sortable: true,
      sortKey: 'updatedAt',
      render: (r) => formatDate(r.updatedAt),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="编辑"
            onClick={() => navigate(`/articles/${r.id}/edit`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {r.status === 'pending' ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="通过审核"
              onClick={() => approveMut.mutate(r.id)}
              disabled={approveMut.isPending}
            >
              <Check className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            aria-label="删除"
            onClick={() => setToDelete(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="文章管理"
        description="草稿 / 待审 / 已发布三态流转"
        actions={<Button onClick={() => navigate('/articles/new')}>新建文章</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="搜索标题 / 关键词"
          className="h-9 rounded-md border border-input px-3 text-sm"
        />
        <select
          value={status ?? ''}
          onChange={(e) =>
            setFilters({ status: (e.target.value || undefined) as ArticleStatus | undefined })
          }
          className="h-9 rounded-md border border-input px-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="pending">待审</option>
          <option value="published">已发布</option>
        </select>
      </div>

      <BatchActionBar
        count={selected.length}
        onClear={() => setSelected([])}
        actions={[
          {
            label: '批量发布',
            disabled: batchBusy,
            onClick: () => runBatch('发布', (id) => approveMut.mutateAsync(id)),
          },
          {
            label: '批量删除',
            variant: 'destructive',
            disabled: batchBusy,
            onClick: () => setToBatchDelete(true),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data?.list ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        sort={sort}
        onSortChange={setSort}
        emptyText="暂无文章"
        error={isError ? error : undefined}
        onRetry={() => refetch()}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />

      {data?.pagination ? (
        <TablePagination
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除文章"
        description={
          toDelete
            ? `确定删除《${toDelete.title}》？该操作软删除，关联评论 / 附件将隔离可见性。`
            : undefined
        }
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (!toDelete) return
          deleteMut.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
        }}
      />

      <ConfirmDialog
        open={toBatchDelete}
        onOpenChange={(o) => !o && setToBatchDelete(false)}
        title="批量删除文章"
        description={
          selected.length > 0
            ? `确定删除选中的 ${selected.length} 篇文章？该操作软删除，关联评论 / 附件将隔离可见性。`
            : undefined
        }
        confirmText="删除"
        loading={batchBusy}
        onConfirm={() => runBatch('删除', (id) => deleteMut.mutateAsync(id))}
      />
    </div>
  )
}

export default ArticleListPage
