/**
 * @file src/pages/comments/CommentListPage.tsx
 * @description 评论审核列表页（Phase 2）。GET /admin/comments 驱动，支持按状态筛选与分页；
 *   行内操作含审核置位、代回复、删除。
 *
 * 注意契约里 `GET /admin/comments` **不接受 sort 参数**（只有 page/pageSize/status/articleId），
 * 所以本页刻意不给 DataTable 传 sort——传了也是被后端忽略的无效参数。
 * @module manage-frontend/pages/comments
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { MessageSquareReply, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BatchActionBar } from '@/components/data/BatchActionBar'
import { type ColumnDef, DataTable } from '@/components/data/DataTable'
import { TablePagination } from '@/components/data/TablePagination'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  useAdminComments,
  useDeleteComment,
  useModerateComment,
  useReplyComment,
} from '@/hooks/useComments'
import { useTableQuery } from '@/hooks/useTableQuery'
import { useToast } from '@/hooks/useToast'
import type { Comment, CommentStatus } from '@/types/common'
import { CommentReplyDialog } from './CommentReplyDialog'
import { CommentReviewDialog } from './CommentReviewDialog'

/** 状态中文标签。 */
const STATUS_LABEL: Record<CommentStatus, string> = {
  approved: '已通过',
  rejected: '已拒绝',
  reviewing: '待复核',
}

/** 状态徽标配色，走 index.css 的语义令牌（与文章状态同一套纪律）。 */
const STATUS_CLASS: Record<CommentStatus, string> = {
  approved: 'bg-status-approved text-status-approved-fg',
  rejected: 'bg-status-rejected text-status-rejected-fg',
  reviewing: 'bg-status-reviewing text-status-reviewing-fg',
}

/** 状态徽标。 */
const StatusBadge = ({ status }: { status: CommentStatus }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
    {STATUS_LABEL[status]}
  </span>
)

/** 日期格式化；空值回退「—」。 */
const formatDate = (v?: string | null) => (v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '—')

/**
 * 评论审核列表页。
 */
const CommentListPage = () => {
  const navigate = useNavigate()
  const { page, pageSize, query, setPage, setPageSize, setFilters } = useTableQuery()
  const status = (query.status as CommentStatus | undefined) ?? undefined

  // 契约不支持排序，这里只传受支持的三个参数
  const listQuery = { page, pageSize, status }
  const { data, isLoading, isError, error, refetch } = useAdminComments(listQuery)

  const moderateMut = useModerateComment()
  const replyMut = useReplyComment()
  const deleteMut = useDeleteComment()

  const [reviewing, setReviewing] = useState<Comment | null>(null)
  const [replying, setReplying] = useState<Comment | null>(null)
  const [toDelete, setToDelete] = useState<Comment | null>(null)
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
      if (fail === 0) toast.success(`已${label} ${ok} 条`)
      else toast.info(`已${label} ${ok} 条，${fail} 条失败`)
    } finally {
      setBatchBusy(false)
    }
  }

  /** 列定义。 */
  const columns: ColumnDef<Comment>[] = [
    { key: 'id', header: 'ID', className: 'w-14' },
    {
      key: 'content',
      header: '内容',
      render: (r) => (
        <div className="max-w-md">
          <p className="line-clamp-2 break-words text-sm">{r.content}</p>
          {r.rejectedReason ? (
            <p className="mt-0.5 text-xs text-muted-foreground">理由：{r.rejectedReason}</p>
          ) : null}
        </div>
      ),
    },
    { key: 'userName', header: '作者', render: (r) => r.userName ?? '匿名' },
    { key: 'status', header: '状态', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'articleId',
      header: '所属文章',
      render: (r) => (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => navigate(`/articles/${r.articleId}/edit`)}
        >
          #{r.articleId}
        </Button>
      ),
    },
    { key: 'createdAt', header: '时间', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="审核置位"
            title="审核置位"
            onClick={() => setReviewing(r)}
          >
            <ShieldCheck className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="代回复"
            title="代回复"
            onClick={() => setReplying(r)}
          >
            <MessageSquareReply className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            aria-label="删除"
            title="删除"
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
      <PageHeader title="评论审核" description="approved / rejected / reviewing 三态人工审核" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status ?? ''}
          onChange={(e) =>
            setFilters({ status: (e.target.value || undefined) as CommentStatus | undefined })
          }
          className="h-9 rounded-md border border-input px-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
          <option value="reviewing">待复核</option>
        </select>
      </div>

      <BatchActionBar
        count={selected.length}
        onClear={() => setSelected([])}
        actions={[
          {
            label: '批量通过',
            disabled: batchBusy,
            onClick: () =>
              runBatch('通过', (id) =>
                moderateMut.mutateAsync({ id, payload: { status: 'approved' } }),
              ),
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
        emptyText="暂无评论"
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
        onSubmit={(articleId, content, parentId) => {
          replyMut.mutate({ articleId, content, parentId }, { onSuccess: () => setReplying(null) })
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除评论"
        description={
          toDelete
            ? `确定删除 ${toDelete.userName ?? '匿名'} 的这条评论？契约标注级联删除，其下所有回复会一并删除，不可恢复。`
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
            ? `确定删除选中的 ${selected.length} 条评论？契约标注级联删除，其下所有回复会一并删除，不可恢复。`
            : undefined
        }
        confirmText="删除"
        loading={batchBusy}
        onConfirm={() => runBatch('删除', (id) => deleteMut.mutateAsync(id))}
      />
    </div>
  )
}

export default CommentListPage
