/**
 * @file src/pages/categories/CategoryTreePage.tsx
 * @description 分类管理页（Phase 3）。无限级树的增删改，数据来自 GET /categories/tree。
 *
 * 页面本身只做状态编排（展开态 / 当前编辑对象 / 待删除对象），
 * 树形渲染与纯计算分别拆到 CategoryNodeRow 与 categoryTree，避免单文件膨胀。
 * @module manage-frontend/pages/categories
 * @date 2026-08-29
 */

import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryUpsert } from '@/api/categories'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useCategoryTree,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/hooks/useCategories'
import type { CategoryNode, CategoryNode as TreeNode } from '@/types/common'
import { CategoryFormDialog } from './CategoryFormDialog'
import { CategoryNodeRow } from './CategoryNodeRow'
import { buildParentMap } from './categoryTree'

/** 编辑态：node 为 null 表示新建，此时用 presetParentId 决定挂在哪一层。 */
type FormState = { node: CategoryNode | null; presetParentId: number | null }

/**
 * 分类管理页。
 */
const CategoryTreePage = () => {
  const [keyword, setKeyword] = useState('')
  const { data: tree = [], isLoading, isError, refetch } = useCategoryTree()
  const createMut = useCreateCategory()
  const updateMut = useUpdateCategory()
  const deleteMut = useDeleteCategory()

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<FormState | null>(null)
  const [toDelete, setToDelete] = useState<CategoryNode | null>(null)

  /** 搜索保留匹配节点的祖先路径，匹配父节点时保留其子树。 */
  const filterTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => {
      if (`${node.name} ${node.slug}`.toLowerCase().includes(keyword.trim().toLowerCase()))
        return [node]
      const children = filterTree(node.children ?? [])
      return children.length ? [{ ...node, children }] : []
    })
  const visibleTree = keyword.trim() ? filterTree(tree) : tree
  const parentMap = useMemo(() => buildParentMap(tree), [tree])

  // 首次拿到数据时默认全部展开——分类数量通常是个位数，全展开比逐层点开直观
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || tree.length === 0) return
    initialized.current = true
    setExpanded(new Set(parentMap.keys()))
  }, [tree.length, parentMap])

  /** 展开 / 折叠切换。 */
  const handleToggle = (id: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 提交：编辑与新建共用弹窗，按是否有 node 分流。 */
  const handleSubmit = (payload: CategoryUpsert): void => {
    const current = form
    if (current?.node?.id != null) {
      updateMut.mutate({ id: current.node.id, payload }, { onSuccess: () => setForm(null) })
      return
    }
    createMut.mutate(payload, { onSuccess: () => setForm(null) })
  }

  return (
    <div>
      <PageHeader
        title="分类管理"
        description="按层级整理文章分类，最多支持 4 级"
        actions={
          <Button onClick={() => setForm({ node: null, presetParentId: null })}>
            <Plus className="mr-1 h-4 w-4" />
            新建顶级分类
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="搜索分类"
          placeholder="搜索分类名称或标识"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          onClick={() => {
            setKeyword('')
            setExpanded(new Set(parentMap.keys()))
          }}
        >
          全部展开
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setKeyword('')
            setExpanded(new Set())
          }}
        >
          全部收起
        </Button>
        {keyword && (
          <Button variant="ghost" onClick={() => setKeyword('')}>
            清除搜索
          </Button>
        )}
      </div>
      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : visibleTree.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {keyword ? '没有符合条件的分类' : '暂无分类，先建一个顶级分类。'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {visibleTree.map((node) => (
            <CategoryNodeRow
              key={node.id}
              node={node}
              depth={1}
              parentMap={parentMap}
              expanded={keyword.trim() ? new Set(parentMap.keys()) : expanded}
              onToggle={handleToggle}
              onAddChild={(parentId) => setForm({ node: null, presetParentId: parentId })}
              onEdit={(node) => setForm({ node, presetParentId: null })}
              onDelete={setToDelete}
            />
          ))}
        </ul>
      )}

      <CategoryFormDialog
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        node={form?.node ?? null}
        presetParentId={form?.presetParentId ?? null}
        tree={tree}
        loading={createMut.isPending || updateMut.isPending}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="删除分类"
        description={
          toDelete
            ? `确定删除「${toDelete.name ?? ''}」？删除前请先移走分类下的文章和子分类。`
            : undefined
        }
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (toDelete?.id == null) return
          deleteMut.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
        }}
      />
    </div>
  )
}

export default CategoryTreePage
