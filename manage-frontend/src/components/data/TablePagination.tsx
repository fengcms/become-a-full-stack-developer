/**
 * @file src/components/data/TablePagination.tsx
 * @description 分页条：总条数 + 页码 + 上一页/下一页 + 每页条数切换。配合 DataTable 使用。
 * @module manage-frontend/components/data
 * @date 2026-08-29
 */

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** 可选每页条数。 */
const PAGE_SIZES = [10, 20, 50]

/**
 * 分页条。
 * @param page - 当前页（从 1 起）。
 * @param pageSize - 每页条数。
 * @param total - 总条数。
 * @param totalPages - 总页数。
 * @param onPageChange - 翻页回调。
 * @param onPageSizeChange - 每页条数变更回调（可选）。
 */
export const TablePagination = ({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-muted-foreground">
    <div>
      共 {total} 条 · 第 {page} / {Math.max(totalPages, 1)} 页
    </div>
    <div className="flex items-center gap-2">
      {onPageSizeChange ? (
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        下一页
      </Button>
    </div>
  </div>
)
