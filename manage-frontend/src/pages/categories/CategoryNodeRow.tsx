/**
 * @file src/pages/categories/CategoryNodeRow.tsx
 * @description 分类树的单个节点行（递归渲染子节点）。
 *
 * 两处按钮的启用条件直接对应契约约束，不是随手加的：
 *   - 「新建子分类」在深度达到 `x-max-depth: 4` 时禁用 —— 超深后端直接拒绝。
 *   - 「删除」在有子节点时禁用 —— 契约要求删除前无子分类且无文章，且不级联；
 *     与其让用户点了吃 409，不如直接不给这个按钮。
 * @module manage-frontend/pages/categories
 * @date 2026-08-29
 */

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CategoryNode } from '@/types/common'
import { canAddChild } from './categoryTree'

/**
 * 分类树节点行。
 * @param node - 当前节点。
 * @param depth - 当前深度（根为 1）。
 * @param parentMap - buildParentMap 的结果，用于深度判定。
 * @param expanded - 已展开节点 id 集合。
 * @param onToggle - 展开 / 折叠切换。
 * @param onAddChild - 新建子分类（回传父 id）。
 * @param onEdit - 编辑节点。
 * @param onDelete - 删除节点。
 */
export const CategoryNodeRow = ({
  node,
  depth,
  parentMap,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: CategoryNode
  depth: number
  parentMap: Map<number, number | null>
  expanded: ReadonlySet<number>
  onToggle: (id: number) => void
  onAddChild: (parentId: number) => void
  onEdit: (node: CategoryNode) => void
  onDelete: (node: CategoryNode) => void
}) => {
  const id = node.id
  if (id == null) return null

  const children = node.children ?? []
  const hasChildren = children.length > 0
  const isOpen = expanded.has(id)
  const canNest = canAddChild(id, parentMap)
  const canDelete = !hasChildren

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
        style={{ paddingInlineStart: `${(depth - 1) * 1.25 + 0.5}rem` }}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onToggle(id)}
            title={isOpen ? '折叠' : '展开'}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : (
          <span className="h-6 w-6" />
        )}

        <span className="font-medium">{node.name ?? '—'}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {node.slug ?? ''}
        </code>

        <span className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddChild(id)}
          disabled={!canNest}
          title={canNest ? '新建子分类' : '已达最大嵌套深度 4 级'}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(node)} title="编辑">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => onDelete(node)}
          disabled={!canDelete}
          title={canDelete ? '删除' : '请先迁移或删除其子分类'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {hasChildren && isOpen ? (
        <ul>
          {children.map((child) => (
            <CategoryNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              parentMap={parentMap}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
