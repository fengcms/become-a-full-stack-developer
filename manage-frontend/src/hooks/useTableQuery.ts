/**
 * @file src/hooks/useTableQuery.ts
 * @description 列表页查询状态 ↔ URL 同步。把 page/pageSize/sort/筛选条件写进地址栏 searchParams，
 *   刷新/分享链接可还原列表状态；返回合并后的 query 对象直接传给 fetcher。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useSearchParams } from 'react-router-dom'

/** 任意查询参数值。 */
export type QueryValue = string | number | undefined

/**
 * 列表查询状态钩子。
 * @param options.defaultPageSize - 默认每页条数。
 * @returns 当前分页/排序/查询对象与变更方法。
 */
export const useTableQuery = (options?: { defaultPageSize?: number }) => {
  const [params, setParams] = useSearchParams()
  const defaultSize = options?.defaultPageSize ?? 10

  const page = Number(params.get('page')) || 1
  const pageSize = Number(params.get('pageSize')) || defaultSize
  const sort = params.get('sort') ?? undefined

  /** 合并写入 searchParams（undefined/空串删除该键）。 */
  const patch = (next: Record<string, QueryValue>) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v === undefined || v === '') p.delete(k)
          else p.set(k, String(v))
        }
        return p
      },
      { replace: true },
    )
  }

  /** 当前完整查询对象（含所有筛选条件），直接传给 fetcher。 */
  const query: Record<string, QueryValue> = {}
  params.forEach((v, k) => {
    query[k] = v
  })
  query.page = page
  query.pageSize = pageSize
  if (sort !== undefined) query.sort = sort

  return {
    page,
    pageSize,
    sort,
    query,
    setPage: (p: number) => patch({ page: p }),
    setPageSize: (s: number) => patch({ pageSize: s, page: 1 }),
    setSort: (s?: string) => patch({ sort: s, page: 1 }),
    setFilters: (f: Record<string, QueryValue>) => patch({ ...f, page: 1 }),
  }
}
