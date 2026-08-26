/**
 * test/lib/category.test.ts
 * B3 复批修复（P2-1 / P3-1）纯函数单测：subtreeHeight 与 buildTree 环防御。
 */
import { describe, expect, it } from 'vitest';
import type { CategoryRow } from '@/db/schema';
import { buildTree, type CategoryNode, subtreeHeight } from '@/services/category';

/** 构造最小 CategoryRow（纯函数只读取 id/name/slug/description/parentId/sortOrder）。 */
const row = (id: number, slug: string, parentId: number | null): CategoryRow =>
  ({
    id,
    name: slug,
    slug,
    description: null,
    parentId,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as CategoryRow;

describe('category 纯函数', () => {
  it('subtreeHeight：单节点=1，链长 3=3', () => {
    const rows = [row(1, 'a', null), row(2, 'b', 1), row(3, 'c', 2)];
    expect(subtreeHeight(rows, 1)).toBe(3);
    expect(subtreeHeight(rows, 3)).toBe(1);
    expect(subtreeHeight(rows, 999)).toBe(1); // 不存在按单节点计
  });

  it('buildTree：正常树递归且不支持环死循环', () => {
    const rows = [row(1, 'a', null), row(2, 'b', 1), row(3, 'c', 2)];
    const tree = buildTree(rows);
    expect(tree.length).toBe(1);
    expect(tree[0]?.children[0]?.children[0]?.id).toBe(3);
  });

  it('buildTree：数据腐化成环时 seen 集截断，不挂死、节点数有界', () => {
    // 人为制造环：1→2→1（无 parentId=null 根，全部成环）
    const cyclic = [row(1, 'a', 2), row(2, 'b', 1)];
    const tree = buildTree(cyclic);
    // 环从某一根起，命中自身时停止展开；整树节点数被 seen 截断，不会无限增长
    const count = (nodes: CategoryNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + count(n.children), 0);
    expect(count(tree)).toBeLessThanOrEqual(2);
  });
});
