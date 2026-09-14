/**
 * @file src/pages/tags/TagListPage.tsx
 * @description 标签管理页（Phase 3）。GET /tags 返回**数组**（非分页），含 articleCount。
 *
 * 关键交互：`articleCount > 0` 的标签，删除按钮直接禁用——契约要求删除前无文章引用，
 * 否则 409。让用户点了再吃一个必然失败的 409 没有意义。
 *
 * ⚠️ 契约**没有标签合并（merge）端点**，故本页不做合并（计划文档 §6 提到的合并暂不实现）。
 * @module manage-frontend/pages/tags
 * @date 2026-08-29
 */

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TagUpsert } from '@/api/tags'
import { type ColumnDef, DataTable } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { FilterSelect } from '@/components/form/FilterSelect'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/useTags'
import { isApiError } from '@/lib/request'
import type { Tag } from '@/types/common'
import { TagFormDialog } from './TagFormDialog'

/**
 * 标签管理页。
 */
const TagListPage = () => {
  const { data: tags = [], isLoading, isError, error, refetch } = useTags()
  const [keyword, setKeyword] = useState('')
  const [order, setOrder] = useState('usage')
  const visible = tags
    .filter((tag) => `${tag.name} ${tag.slug}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    .sort((a, b) =>
      order === 'usage'
        ? (b.articleCount ?? 0) - (a.articleCount ?? 0)
        : a.name.localeCompare(b.name, 'zh-CN'),
    )
  const createMut = useCreateTag()
  const updateMut = useUpdateTag()
  const deleteMut = useDeleteTag()

  const [editing, setEditing] = useState<Tag | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Tag | null>(null)

  /** 列定义。 */
  const columns: ColumnDef<Tag>[] = [
    { key: 'id', header: 'ID', className: 'w-16' },
    { key: 'name', header: '名称', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'slug',
      header: 'Slug',
      render: (r) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {r.slug}
        </code>
      ),
    },
    {
      key: 'articleCount',
      header: '文章数',
      render: (r) => (
        <Link
          className="underline underline-offset-4"
          to={`/articles?tag=${encodeURIComponent(r.slug)}`}
        >
          {r.articleCount ?? 0} 篇
        </Link>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => {
        // 契约：有文章引用时删除会被 409 拒绝，提前禁用
        const used = (r.articleCount ?? 0) > 0
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(r)
                setFormOpen(true)
              }}
              title="编辑"
              aria-label="编辑"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setToDelete(r)}
              disabled={used}
              title={used ? '仍有文章引用，无法删除' : '删除'}
              aria-label={used ? '仍有文章引用，无法删除' : '删除'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ]

  /** 提交：按 editing 是否为 null 分流新建 / 更新。 */
  const handleSubmit = (payload: TagUpsert): void => {
    if (editing) {
      updateMut.mutate({ id: editing.id, payload }, { onSuccess: () => setFormOpen(false) })
      return
    }
    createMut.mutate(payload, { onSuccess: () => setFormOpen(false) })
  }

  return (
    <div>
      <PageHeader
        title="标签管理"
        description="管理文章标签，查看各标签的使用情况"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            新建标签
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="搜索标签"
          placeholder="搜索标签名称或标识"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
        <FilterSelect
          ariaLabel="标签排序"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'usage', label: '使用最多' },
            { value: 'name', label: '按名称' },
          ]}
        />
        {keyword && (
          <Button variant="ghost" onClick={() => setKeyword('')}>
            清除搜索
          </Button>
        )}
      </div>
      {isError ? (
        <QueryErrorState
          description={isApiError(error) ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={visible}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyText={keyword ? '没有找到符合条件的标签' : '暂无标签，可以新建标签或在写作时添加'}
        />
      )}

      <TagFormDialog
        open={formOpen}
        onOpenChange={(o) => !o && setFormOpen(false)}
        tag={editing}
        loading={createMut.isPending || updateMut.isPending}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除标签"
        description={toDelete ? `确定删除「${toDelete.name}」？该操作不可恢复。` : undefined}
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (!toDelete) return
          deleteMut.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
        }}
      />
    </div>
  )
}

export default TagListPage
