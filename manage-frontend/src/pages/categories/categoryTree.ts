/**
 * @file src/pages/categories/categoryTree.ts
 * @description 分类树的纯函数工具：父子映射、子孙收集、深度计算、拍平选项。
 *
 * 抽成纯函数有两个理由：
 *   1. 可测试。「改父级成环」「超过 4 级」都是契约硬约束，靠肉眼看 UI 守不住。
 *   2. ⚠️ 契约 `CategoryNode` **没有 parentId 字段**（只有 id/name/slug/description/sortOrder/children），
 *      父子关系完全靠 children 嵌套表达。而 `PUT /categories/{id}` 是全量替换语义——
 *      编辑一条子分类时若不带 parentId，后端很可能把它置空、静默挪到根。
 *      所以前端必须自己从树结构反推并维护「id → parentId」映射，编辑时回填。
 *
 * @module manage-frontend/pages/categories
 * @date 2026-08-29
 */

import { CATEGORY_MAX_DEPTH } from '@/api/categories'
import type { SelectOption } from '@/components/form/SelectField'
import type { CategoryNode } from '@/types/common'

/**
 * 遍历树建立「节点 id → 父 id」映射（根节点的父为 null）。
 *
 * @param nodes - 分类树的根节点列表。
 * @returns id 到父 id 的映射。
 */
export const buildParentMap = (nodes: CategoryNode[]): Map<number, number | null> => {
  const map = new Map<number, number | null>()
  const walk = (list: CategoryNode[], parentId: number | null): void => {
    for (const node of list) {
      if (node.id == null) continue
      map.set(node.id, parentId)
      if (node.children?.length) walk(node.children, node.id)
    }
  }
  walk(nodes, null)
  return map
}

/**
 * 收集节点**及其所有子孙**的 id。
 *
 * 编辑分类时，这些 id 必须从父级候选里排除——把节点挂到自己的子孙下就成环了
 * （契约：后端会返回 409 / code 3002，但我们不该让用户先提交再吃瘪）。
 *
 * @param node - 起始节点。
 * @returns 自身与全部子孙的 id 数组。
 */
export const collectSubtreeIds = (node: CategoryNode): number[] => {
  const ids: number[] = []
  const walk = (n: CategoryNode): void => {
    if (n.id == null) return
    ids.push(n.id)
    for (const child of n.children ?? []) walk(child)
  }
  walk(node)
  return ids
}

/**
 * 计算节点深度（根为 1）。沿 parentMap 向上走到根。
 *
 * @param id - 节点 id。
 * @param parentMap - buildParentMap 的结果。
 * @returns 节点深度；找不到时按根处理返回 1。
 */
export const nodeDepth = (id: number, parentMap: Map<number, number | null>): number => {
  let depth = 1
  let cursor = parentMap.get(id) ?? null
  // 自关联表理论上可能成环，加个上限兜底，防止死循环
  while (cursor !== null && depth <= CATEGORY_MAX_DEPTH + 1) {
    depth += 1
    cursor = parentMap.get(cursor) ?? null
  }
  return depth
}

/**
 * 该节点下是否还能再挂子级（契约 x-max-depth: 4）。
 *
 * @param id - 节点 id。
 * @param parentMap - buildParentMap 的结果。
 * @returns 还能挂时为真。
 */
export const canAddChild = (id: number, parentMap: Map<number, number | null>): boolean =>
  nodeDepth(id, parentMap) < CATEGORY_MAX_DEPTH

/**
 * 把树拍平成带缩进缩进的 Select 选项，供父级下拉使用。
 *
 * @param nodes - 分类树。
 * @param excludeIds - 需要排除的 id（成环防护：编辑时传入自身及子孙）。
 * @returns 选项列表，含一个「（无，作为顶级分类）」的空选项。
 */
export const flattenTreeOptions = (
  nodes: CategoryNode[],
  excludeIds: ReadonlySet<number> = new Set(),
): SelectOption[] => {
  const options: SelectOption[] = [{ value: '', label: '（无，作为顶级分类）' }]
  const walk = (list: CategoryNode[], depth: number): void => {
    for (const node of list) {
      if (node.id == null) continue
      const excluded = excludeIds.has(node.id)
      if (!excluded) {
        options.push({ value: String(node.id), label: `${'　'.repeat(depth)}${node.name ?? ''}` })
      }
      if (node.children?.length) walk(node.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return options
}
