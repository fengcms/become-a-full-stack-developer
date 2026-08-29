/**
 * @file src/pages/categories/categoryTree.test.ts
 * @description 分类树纯函数的守卫测试（Phase 3）。
 *
 * 这四个函数守的是契约里最容易静默出错的地方：
 *   - `buildParentMap` —— 契约 `CategoryNode` 没有 parentId 字段，而 PUT 是全量替换，
 *     父子映射算错就会把子分类静默挪到根。
 *   - `collectSubtreeIds` —— 漏掉一个子孙，就能把分类挂到自己的子孙下成环。
 *   - `canAddChild` —— 契约 `x-max-depth: 4`，超了后端直接拒绝。
 * @module manage-frontend/pages/categories
 * @date 2026-08-29
 */

import { describe, expect, it } from 'vitest'
import type { CategoryNode } from '@/types/common'
import {
  buildParentMap,
  canAddChild,
  collectSubtreeIds,
  flattenTreeOptions,
  nodeDepth,
} from './categoryTree'

/** 一棵 4 级的测试树：前端 > React > Hooks > useMemo，另有顶级的「后端」。 */
const tree = [
  {
    id: 1,
    name: '前端',
    slug: 'frontend',
    children: [
      {
        id: 2,
        name: 'React',
        slug: 'react',
        children: [
          {
            id: 3,
            name: 'Hooks',
            slug: 'hooks',
            children: [{ id: 4, name: 'useMemo', slug: 'usememo', children: [] }],
          },
        ],
      },
    ],
  },
  { id: 9, name: '后端', slug: 'backend', children: [] },
] as unknown as CategoryNode[]

const parentMap = buildParentMap(tree)

describe('buildParentMap：从树反推父子关系', () => {
  it('顶级节点的父为 null', () => {
    expect(parentMap.get(1)).toBeNull()
    expect(parentMap.get(9)).toBeNull()
  })

  it('逐层记录父 id', () => {
    expect(parentMap.get(2)).toBe(1)
    expect(parentMap.get(3)).toBe(2)
    expect(parentMap.get(4)).toBe(3)
  })
})

describe('collectSubtreeIds：成环防护', () => {
  it('包含自身与全部子孙', () => {
    const node = tree[0] as CategoryNode
    expect(collectSubtreeIds(node).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('叶子节点只含自身', () => {
    expect(collectSubtreeIds({ id: 9, children: [] } as unknown as CategoryNode)).toEqual([9])
  })
})

describe('nodeDepth / canAddChild：契约 x-max-depth = 4', () => {
  it('根深度为 1，逐层递增', () => {
    expect(nodeDepth(1, parentMap)).toBe(1)
    expect(nodeDepth(2, parentMap)).toBe(2)
    expect(nodeDepth(3, parentMap)).toBe(3)
    expect(nodeDepth(4, parentMap)).toBe(4)
  })

  it('1~3 级还能挂子级，第 4 级不能再挂', () => {
    expect(canAddChild(1, parentMap)).toBe(true)
    expect(canAddChild(3, parentMap)).toBe(true)
    expect(canAddChild(4, parentMap)).toBe(false)
  })
})

describe('flattenTreeOptions：父级候选', () => {
  it('首位是无父级的选项', () => {
    const options = flattenTreeOptions(tree)
    expect(options[0]).toEqual({ value: '', label: '（无，作为顶级分类）' })
  })

  /** 编辑「前端」时，它自己和它的子孙都不能出现在父级候选里 */
  it('排除自身及子孙，杜绝成环', () => {
    const options = flattenTreeOptions(tree, new Set(collectSubtreeIds(tree[0] as CategoryNode)))
    const values = options.map((o) => o.value)

    expect(values).not.toContain('1')
    expect(values).not.toContain('2')
    expect(values).not.toContain('3')
    expect(values).not.toContain('4')
    // 不相干的分支仍应可选
    expect(values).toContain('9')
  })
})
