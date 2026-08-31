/**
 * @file src/components/data/DataTable.tsx
 * @description 通用数据表格：列定义驱动 + 排序 + 加载骨架 + 空态。服务端分页由 TablePagination 配合。
 *   刻意用轻量自建列模型而非 @tanstack/react-table，减少依赖与复杂度（列表均为服务端分页）。
 *   行多选（T6 批量操作）为可选能力：传 `selectable` 即在首列渲染复选框，选择态由页面受控。
 * @module manage-frontend/components/data
 * @date 2026-08-29
 */

import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { isApiError } from '@/lib/request'
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

/** 轻量复选框（原生 input + accent 主题色），支持半选态（T6）。 */
const RowCheckbox = ({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  label: string
}) => {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer rounded border-border accent-primary"
    />
  )
}

/**
 * 通用数据表格。
 * @param columns - 列定义。
 * @param data - 行数据。
 * @param rowKey - 取行 key 的函数。
 * @param loading - 加载中（显示骨架行）。
 * @param emptyText - 空态文案。
 * @param sort - 当前排序字段（带符号，如 -createdAt）。
 * @param onSortChange - 排序变更回调（点表头循环：无 → 升 → 降 → 无）。
 * @param selectable - 是否启用行多选（T6，默认 false，向后兼容）。
 * @param selectedKeys - 已选行 key 列表（受控）。
 * @param onSelectionChange - 选择变更回调。
 */
export const DataTable = <T,>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  sort,
  onSortChange,
  error,
  onRetry,
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyText?: string
  sort?: string
  onSortChange?: (next: string | undefined) => void
  /** 请求错误对象；传了且非 loading 时渲染内联错误态 + 重试。 */
  error?: unknown
  /** 重试回调（通常 React Query 的 refetch）。 */
  onRetry?: () => void
  /** T6：启用首列复选框多选。 */
  selectable?: boolean
  /** T6：受控的已选行 key。 */
  selectedKeys?: Array<string | number>
  /** T6：选择变更回调。 */
  onSelectionChange?: (keys: Array<string | number>) => void
}) => {
  const selection = selectedKeys ?? []
  const selectedSet = new Set(selection)
  const pageKeys = data.map((row) => rowKey(row))
  const allChecked = selectable && pageKeys.length > 0 && pageKeys.every((k) => selectedSet.has(k))
  const someChecked = selectable && pageKeys.some((k) => selectedSet.has(k))

  const toggleRow = (key: string | number, next: boolean) => {
    if (!onSelectionChange) return
    const nextSet = new Set(selection)
    if (next) nextSet.add(key)
    else nextSet.delete(key)
    onSelectionChange([...nextSet])
  }

  const toggleAll = (next: boolean) => {
    if (!onSelectionChange) return
    const nextSet = new Set(selection)
    for (const k of pageKeys) {
      if (next) nextSet.add(k)
      else nextSet.delete(k)
    }
    onSelectionChange([...nextSet])
  }

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <Skeleton className="size-4" />
                </th>
              )}
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
                {selectable && (
                  <td className="px-3 py-3">
                    <Skeleton className="size-4" />
                  </td>
                )}
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

  if (error) {
    const msg = isApiError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : undefined
    return <QueryErrorState description={msg} onRetry={onRetry} />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {selectable && (
              <th className="w-10 px-3 py-3">
                <RowCheckbox
                  checked={allChecked}
                  indeterminate={!allChecked && someChecked}
                  onChange={toggleAll}
                  label="全选本页"
                />
              </th>
            )}
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
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-12 text-center text-muted-foreground"
              >
                <div className="flex flex-col items-center gap-2">
                  <Inbox className="size-8 text-muted-foreground/50" aria-hidden />
                  <span>{emptyText}</span>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-b border-border transition-colors hover:bg-muted/30',
                    selectable && selectedSet.has(key) && 'bg-primary/5',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3">
                      <RowCheckbox
                        checked={selectedSet.has(key)}
                        onChange={(v) => toggleRow(key, v)}
                        label={`选择 ${key}`}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', alignClass(c.align), c.className)}>
                      {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
