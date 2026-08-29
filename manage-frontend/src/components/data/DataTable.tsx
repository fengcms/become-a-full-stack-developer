/**
 * @file src/components/data/DataTable.tsx
 * @description 通用数据表格：列定义驱动 + 排序 + 加载骨架 + 空态。服务端分页由 TablePagination 配合。
 *   刻意用轻量自建列模型而非 @tanstack/react-table，减少依赖与复杂度（列表均为服务端分页）。
 * @module manage-frontend/components/data
 * @date 2026-08-29
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** 列定义。 */
export interface ColumnDef<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  sortKey?: string
  className?: string
  align?: 'left' | 'center' | 'right'
}

/** 对齐方式 → className。 */
const alignClass = (a?: ColumnDef<unknown>['align']) =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

/**
 * 通用数据表格。
 * @param columns - 列定义。
 * @param data - 行数据。
 * @param rowKey - 取行 key 的函数。
 * @param loading - 加载中（显示骨架行）。
 * @param emptyText - 空态文案。
 * @param sort - 当前排序字段（带符号，如 -createdAt）。
 * @param onSortChange - 排序变更回调（点表头循环：无 → 升 → 降 → 无）。
 */
export const DataTable = <T,>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  sort,
  onSortChange,
}: {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyText?: string
  sort?: string
  onSortChange?: (next: string | undefined) => void
}) => {
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-3 font-medium', alignClass(c.align))}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((c) => {
              const key = c.sortKey ?? c.key
              const active = c.sortable && sort === key
              const desc = c.sortable && sort === `-${key}`
              return (
                <th key={c.key} className={cn('px-4 py-3 font-medium', alignClass(c.align))}>
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => {
                        if (!sort) onSortChange(key)
                        else if (sort === key) onSortChange(`-${key}`)
                        else if (sort === `-${key}`) onSortChange(undefined)
                        else onSortChange(key)
                      }}
                    >
                      {c.header}
                      {active ? (
                        <ArrowUp className="size-3.5" />
                      ) : desc ? (
                        <ArrowDown className="size-3.5" />
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border transition-colors hover:bg-muted/30"
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3', alignClass(c.align), c.className)}>
                    {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
