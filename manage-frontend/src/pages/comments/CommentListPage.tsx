/**
 * @file src/pages/comments/CommentListPage.tsx
 * @description 评论审核列表页（Phase 2）。GET /admin/comments 驱动，支持按状态筛选与分页；
 *   行内操作含审核置位、代回复、删除。
 *
 * 注意契约里 `GET /admin/comments` **不接受 sort 参数**（只有 page/pageSize/status/articleId），
 * 所以本页刻意不给 DataTable 传 sort——传了也是被后端忽略的无效参数。
 * @module manage-frontend/pages/comments
 * @date 2026-08-29
 * @remarks 本文件保留同一页面/表格的声明式编排，查询与操作逻辑已由 hooks 或列模块承载；为便于核对控件状态与确认流程，允许超过 200 行。
 */

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteComment, moderateComment } from '@/api/comments'
import { BatchActionBar } from '@/components/data/BatchActionBar'
import { BatchFailures } from '@/components/data/BatchFailures'
import { DataTable } from '@/components/data/DataTable'
import { TablePagination } from '@/components/data/TablePagination'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { UnsavedChanges } from '@/components/feedback/UnsavedChanges'
import { FILTER_ALL, FilterSelect } from '@/components/form/FilterSelect'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useBatchSelection } from '@/hooks/useBatchSelection'
import {
  useAdminComments,
  useDeleteComment,
  useModerateComment,
  useReplyComment,
} from '@/hooks/useComments'
import { useTableQuery } from '@/hooks/useTableQuery'
import type { Comment, CommentStatus } from '@/types/common'
import { CommentReplyDialog } from './CommentReplyDialog'
import { CommentReviewDialog } from './CommentReviewDialog'
import { commentColumns, STATUS_LABEL } from './commentColumns'

/**
 * 评论审核列表页。
 */
const CommentListPage = () => {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { page, pageSize, query, setPage, setPageSize, setFilters, clearFilters } = useTableQuery()
  const status = (query.status as CommentStatus | undefined) ?? undefined

  // 契约不支持排序，这里只传受支持的三个参数
  const rawArticleId = Number(query.articleId)
  const articleId =
    Number.isSafeInteger(rawArticleId) && rawArticleId > 0 ? rawArticleId : undefined
  const listQuery = { page, pageSize, status, articleId }
  const { data, isLoading, isError, error, refetch } = useAdminComments(listQuery)

  const moderateMut = useModerateComment()
  const replyMut = useReplyComment()
  const deleteMut = useDeleteComment()

  const [reviewing, setReviewing] = useState<Comment | null>(null)
  const [replying, setReplying] = useState<Comment | null>(null)
  const [toDelete, setToDelete] = useState<Comment | null>(null)
  const batch = useBatchSelection(JSON.stringify(listQuery))
  const { selected, setSelected, busy: batchBusy } = batch
  const [toBatchDelete, setToBatchDelete] = useState(false)
  const [replyRejection, setReplyRejection] = useState('')
  const selectedIds = (data?.list ?? [])
    .filter((row) => selected.includes(row.id))
    .map((row) => row.id)
  /** 批量只给一次汇总，失败记录留在当前页。 */
  const runBatch = async (label: string, action: (id: number) => Promise<unknown>) => {
    await batch.run(label, selectedIds, action, refetch)
    void qc.invalidateQueries({ queryKey: ['comments'] })
    void qc.invalidateQueries({ queryKey: ['site'] })
    setToBatchDelete(false)
  }

  const columns = commentColumns({
    busy: batchBusy,
    onReview: setReviewing,
    onDelete: setToDelete,
    onReply: (comment) => {
      setReplyRejection('')
      setReplying(comment)
    },
    onPreview: (id) => navigate(`/articles/${id}/preview`),
  })

  return (
    <div>
      <PageHeader title="评论审核" description="查看评论内容，处理待复核评论和回复读者" />

      <UnsavedChanges dirty={false} busy={batchBusy} />
      <fieldset disabled={batchBusy} className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect
          ariaLabel="按状态筛选"
          value={status ?? FILTER_ALL}
          onChange={(v) =>
            setFilters({ status: v === FILTER_ALL ? undefined : (v as CommentStatus) })
          }
          options={[
            { value: FILTER_ALL, label: '全部状态' },
            { value: 'approved', label: STATUS_LABEL.approved },
            { value: 'rejected', label: STATUS_LABEL.rejected },
            { value: 'reviewing', label: STATUS_LABEL.reviewing },
          ]}
        />
        <input
          aria-label="按文章编号筛选"
          placeholder="文章编号"
          type="number"
          min="1"
          value={articleId ?? ''}
          onChange={(e) => setFilters({ articleId: e.target.value || undefined })}
          className="h-9 w-36 rounded-md border bg-background px-3 text-sm"
        />
        {(status || articleId) && (
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
            label: '批量通过',
            disabled: batchBusy,
            onClick: () => runBatch('通过', (id) => moderateComment(id, { status: 'approved' })),
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
        emptyText={status || articleId ? '没有符合条件的评论，请调整筛选' : '还没有收到评论'}
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

      <CommentReviewDialog
        comment={reviewing}
        open={!!reviewing}
        onOpenChange={(o) => !o && setReviewing(null)}
        loading={moderateMut.isPending}
        onSubmit={(id, payload) => {
          moderateMut.mutate({ id, payload }, { onSuccess: () => setReviewing(null) })
        }}
      />

      <CommentReplyDialog
        comment={replying}
        open={!!replying}
        onOpenChange={(o) => !o && setReplying(null)}
        loading={replyMut.isPending}
        rejection={replyRejection}
        onSubmit={(articleId, content, parentId) => {
          replyMut.mutate(
            { articleId, content, parentId },
            {
              onSuccess: (comment) => {
                if (comment.status === 'rejected')
                  setReplyRejection(comment.rejectedReason || '回复未通过内容检查，请修改后重试。')
                else {
                  setReplying(null)
                  setReplyRejection('')
                }
              },
            },
          )
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除评论"
        description={
          toDelete
            ? `确定删除 ${toDelete.userName ?? '匿名'} 的这条评论？这条评论及其下的回复将一并删除，无法恢复。`
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
        title="批量删除评论"
        description={
          selected.length > 0
            ? `确定删除选中的 ${selected.length} 条评论？这条评论及其下的回复将一并删除，无法恢复。`
            : undefined
        }
        confirmText="删除"
        loading={batchBusy}
        onConfirm={() => runBatch('删除', deleteComment)}
      />
    </div>
  )
}

export default CommentListPage
