/**
 * @file pages/comments/commentColumns.tsx
 * @description 评论列表的信息展示和行操作，正文可展开审核。
 */
import { format } from 'date-fns'
import { MessageSquareReply, ShieldCheck, Trash2 } from 'lucide-react'
import type { ColumnDef } from '@/components/data/DataTable'
import { Button } from '@/components/ui/button'
import type { Comment, CommentStatus } from '@/types/common'
/** 状态中文标签。 */
export const STATUS_LABEL: Record<CommentStatus, string> = {
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

/** 行操作回传选中的评论，弹窗会话由页面持有。 */
export const commentColumns = ({
  busy,
  onReview,
  onReply,
  onDelete,
  onPreview,
}: {
  busy: boolean
  onReview: (comment: Comment) => void
  onReply: (comment: Comment) => void
  onDelete: (comment: Comment) => void
  onPreview: (id: number) => void
}): ColumnDef<Comment>[] => {
  /** 列定义。 */
  return [
    { key: 'id', header: 'ID', className: 'w-14' },
    {
      key: 'content',
      header: '内容',
      render: (r) => (
        <div className="max-w-md">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview(r)}
            className="text-left hover:underline"
          >
            <span className="line-clamp-2 break-words text-sm">{r.content}</span>
          </button>
          {r.parentId && <p className="text-xs text-muted-foreground">回复评论 #{r.parentId}</p>}
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
          onClick={() => onPreview(r.articleId)}
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
            aria-label="审核评论"
            disabled={busy}
            title="审核评论"
            onClick={() => onReview(r)}
          >
            <ShieldCheck className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="回复评论"
            disabled={busy}
            title="回复评论"
            onClick={() => onReply(r)}
          >
            <MessageSquareReply className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            aria-label="删除"
            disabled={busy}
            title="删除"
            onClick={() => onDelete(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]
}
