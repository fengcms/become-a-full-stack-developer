/**
 * @file pages/articles/articleColumns.tsx
 * @description 文章表格展示与行操作，页面负责查询及批量协调。
 */
import { format } from 'date-fns'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@/components/data/DataTable'
import { Button } from '@/components/ui/button'
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

/** 根据页面的操作状态构造表格列。 */
export const articleColumns = ({
  from,
  busy,
  approving,
  names,
  onEdit,
  onApprove,
  onDelete,
}: {
  from: string
  busy: boolean
  approving: boolean
  names: Map<string, string>
  onEdit: (id: number) => void
  onApprove: (id: number) => void
  onDelete: (article: ArticleSummary) => void
}): ColumnDef<ArticleSummary>[] => {
  /** 列定义。 */
  return [
    { key: 'id', header: 'ID', sortable: true, sortKey: 'id', className: 'w-14' },
    {
      key: 'title',
      header: '标题',
      render: (r) => (
        <Link
          className="font-medium hover:underline"
          to={`/articles/${r.id}/edit`}
          state={{ from }}
        >
          {r.title}
        </Link>
      ),
    },
    { key: 'status', header: '状态', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'categoryName',
      header: '分类',
      render: (r) => r.categoryName ?? names.get(String(r.categoryId)) ?? '未分类',
    },
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
            disabled={busy}
            onClick={() => onEdit(r.id)}
          >
            <Pencil className="mr-1 h-4 w-4" />
            编辑
          </Button>
          {r.status === 'pending' ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="通过审核"
              onClick={() => onApprove(r.id)}
              disabled={approving || busy}
            >
              <Check className="mr-1 h-4 w-4" />
              通过
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            aria-label="删除"
            title="删除文章"
            disabled={busy}
            onClick={() => onDelete(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]
}
