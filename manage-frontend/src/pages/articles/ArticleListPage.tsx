/**
 * @file src/pages/articles/ArticleListPage.tsx
 * @description 文章管理列表页（Phase 1）。GET /admin/articles 驱动，支持状态筛选 / 关键词搜索 /
 *   排序 / 分页；行内操作含编辑、过审（pending）、删除。新建入口跳 /articles/new。
 * @module manage-frontend/pages/articles
 * @date 2026-08-29
 * @remarks 本文件保留同一页面/表格的声明式编排，查询与操作逻辑已由 hooks 或列模块承载；为便于核对控件状态与确认流程，允许超过 200 行。
 */

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { approveArticle, deleteArticle } from '@/api/articles'
import { BatchActionBar } from '@/components/data/BatchActionBar'
import { BatchFailures } from '@/components/data/BatchFailures'
import { DataTable } from '@/components/data/DataTable'
import { TablePagination } from '@/components/data/TablePagination'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { UnsavedChanges } from '@/components/feedback/UnsavedChanges'
import { FILTER_ALL, FilterSelect } from '@/components/form/FilterSelect'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useAdminArticles, useApproveArticle, useDeleteArticle } from '@/hooks/useArticles'
import { useBatchSelection } from '@/hooks/useBatchSelection'
import { useCategoryTree } from '@/hooks/useCategories'
import { useKeywordFilter } from '@/hooks/useKeywordFilter'
import { useTableQuery } from '@/hooks/useTableQuery'
import type { ArticleStatus, ArticleSummary } from '@/types/common'
import { articleColumns } from './articleColumns'
import { categoryOptions } from './articleForm'

/**
 * 文章管理列表页。
 */
const ArticleListPage = () => {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()
  const from = location.pathname + location.search
  const categories = useCategoryTree()
  const { page, pageSize, sort, query, setPage, setPageSize, setSort, setFilters, clearFilters } =
    useTableQuery()
  const status = (query.status as ArticleStatus | undefined) ?? undefined
  const keyword = (query.keyword as string | undefined) ?? ''
  const [kw, setKw] = useKeywordFilter(keyword ?? '', setFilters)

  const category = query.category as string | undefined
  const tag = query.tag as string | undefined
  const filtered = !!(keyword || category || tag || status)
  const listQuery = { page, pageSize, sort, status, category, tag, keyword: keyword || undefined }
  const { data, isLoading, isError, error, refetch } = useAdminArticles(listQuery)
  const approveMut = useApproveArticle()
  const deleteMut = useDeleteArticle()
  const [toDelete, setToDelete] = useState<ArticleSummary | null>(null)
  const batch = useBatchSelection(JSON.stringify(listQuery))
  const { selected, setSelected, busy: batchBusy } = batch
  const [toBatchDelete, setToBatchDelete] = useState(false)
  const selectedIds = (data?.list ?? [])
    .filter((row) => selected.includes(row.id))
    .map((row) => row.id)
  const publishIds = (data?.list ?? [])
    .filter((row) => selected.includes(row.id) && row.status === 'pending')
    .map((row) => row.id)
  /** 单次批量结果汇总，不调用逐行提示的 mutation。 */
  const runBatch = async (
    label: string,
    ids: number[],
    action: (id: number) => Promise<unknown>,
  ) => {
    await batch.run(label, ids, action, refetch)
    void qc.invalidateQueries({ queryKey: ['articles'] })
    void qc.invalidateQueries({ queryKey: ['site'] })
    setToBatchDelete(false)
  }

  const columns = articleColumns({
    from,
    busy: batchBusy,
    approving: approveMut.isPending,
    names: new Map(
      categoryOptions(categories.data ?? []).map((option) => [option.value, option.label]),
    ),
    onEdit: (id) => navigate(`/articles/${id}/edit`, { state: { from } }),
    onApprove: (id) => approveMut.mutate(id),
    onDelete: setToDelete,
  })

  return (
    <div>
      <PageHeader
        title="文章管理"
        description="管理草稿、处理投稿和更新已发布文章"
        actions={
          <Button onClick={() => navigate('/articles/new', { state: { from } })}>新建文章</Button>
        }
      />

      <UnsavedChanges dirty={false} busy={batchBusy} />
      <fieldset disabled={batchBusy} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          aria-label="搜索"
          placeholder="搜索标题 / 关键词"
          className="h-9 rounded-md border border-input bg-white px-3 text-sm dark:bg-background"
        />
        <FilterSelect
          ariaLabel="按状态筛选"
          value={status ?? FILTER_ALL}
          onChange={(v) =>
            setFilters({ status: v === FILTER_ALL ? undefined : (v as ArticleStatus) })
          }
          options={[
            { value: FILTER_ALL, label: '全部状态' },
            { value: 'draft', label: '草稿' },
            { value: 'pending', label: '待审' },
            { value: 'published', label: '已发布' },
          ]}
        />
        <FilterSelect
          ariaLabel="按分类筛选"
          value={category ?? FILTER_ALL}
          onChange={(v) => setFilters({ category: v === FILTER_ALL ? undefined : v })}
          options={[
            { value: FILTER_ALL, label: '全部分类' },
            ...categoryOptions(categories.data ?? []),
          ]}
        />
        {tag && <span className="text-sm text-muted-foreground">标签：{tag}</span>}
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            清除筛选
          </Button>
        )}
      </fieldset>

      <BatchFailures messages={batch.failures} />
      <BatchActionBar
        count={selected.length}
        disabled={batchBusy}
        onClear={() => setSelected([])}
        actions={[
          {
            label: `通过审核并发布（${publishIds.length}）`,
            disabled: batchBusy || publishIds.length === 0,
            onClick: () => runBatch('发布', publishIds, approveArticle),
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
        emptyText={
          filtered ? '没有符合条件的文章，请调整或清除筛选' : '还没有文章，点击「新建文章」开始写作'
        }
        error={isError ? error : undefined}
        onRetry={() => refetch()}
        selectable
        selectionDisabled={batchBusy}
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />

      <fieldset disabled={batchBusy}>
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
      </fieldset>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除文章"
        description={
          toDelete
            ? `确定删除《${toDelete.title}》？删除后文章将不再展示，相关评论也将隐藏。`
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
            ? `确定删除选中的 ${selected.length} 篇文章？删除后文章将不再展示，相关评论也将隐藏。`
            : undefined
        }
        confirmText="删除"
        loading={batchBusy}
        onConfirm={() => runBatch('删除', selectedIds, deleteArticle)}
      />
    </div>
  )
}

export default ArticleListPage
