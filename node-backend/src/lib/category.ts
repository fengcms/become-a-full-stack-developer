/**
 * src/lib/category.ts
 * 分类领域纯逻辑（与路由解耦，便于单测）：序列化、无限级树构建、环检测、深度计算、面包屑。
 * 所有 DB 行 snake_case → 契约 camelCase 在此统一完成。
 *
 * 关键约束（契约 Category + x-max-depth:4 + §2.2）：
 * - 树经 parentId 自关联递归；最大嵌套深度 4 级，创建/变更 parentId 超出即拒绝。
 * - 环检测：若把节点挂到自身子孙下会形成环，建/改 parentId 时必须拒绝（见 wouldCreateCycle）。
 * - 上述算法属「契约留外」行为（§2.2），此处给出合理实现并在 B3-NOTES 登记。
 */
import type { CategoryRow } from '@/db/schema';

/** 分类树最大嵌套深度（契约 Category.x-max-depth）。 */
export const MAX_CATEGORY_DEPTH = 4;

/** DB 行 → 契约 Category。 */
export const toCategory = (c: CategoryRow) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description ?? null,
  parentId: c.parentId ?? null,
  sortOrder: c.sortOrder,
});

/** 递归树节点（契约 CategoryNode）。 */
export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  children: CategoryNode[];
}

/** 面包屑单项（契约 CategoryBreadcrumbItem）。 */
export interface CategoryBreadcrumbItem {
  id: number;
  name: string;
  slug: string;
}

/** 子节点排序：sortOrder 升序，其次 id 升序（稳定）。 */
const bySort = (a: CategoryRow, b: CategoryRow): number => a.sortOrder - b.sortOrder || a.id - b.id;

/**
 * 计算某节点的深度（根=1）。沿 parentId 向上遍历计数祖先层级。
 * @param rows 全量分类（用于查父链）
 * @param id 目标节点 id
 */
export const depthOf = (rows: CategoryRow[], id: number): number => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(id);
  let depth = 0;
  const seen = new Set<number>();
  while (cur) {
    if (seen.has(cur.id)) break; // 防御：数据异常成环时避免死循环
    seen.add(cur.id);
    if (cur.parentId == null) break;
    cur = byId.get(cur.parentId);
    depth += 1;
  }
  return depth + 1;
};

/**
 * 判断把 nodeId 的 parentId 改为 newParentId 是否会产生环。
 * - 新父为自身 / 新父是自身的子孙 → 成环。
 * - 新建节点（nodeId 为 null）或新父为根（null）→ 不成环。
 * @param rows 全量分类
 * @param nodeId 被改动的节点（更新时传入；新建为 null）
 * @param newParentId 拟设置的新父（null 表示置为根）
 */
export const wouldCreateCycle = (
  rows: CategoryRow[],
  nodeId: number | null,
  newParentId: number | null,
): boolean => {
  if (newParentId == null || nodeId == null) return false;
  if (newParentId === nodeId) return true; // 自挂
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(newParentId);
  const seen = new Set<number>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    if (cur.id === nodeId) return true; // 新父是自身的子孙 → 成环
    if (cur.parentId == null) break;
    cur = byId.get(cur.parentId);
  }
  return false;
};

/** 将扁平分类列表组装为无限级树（根在前，子按 sortOrder 排序）。 */
export const buildTree = (rows: CategoryRow[]): CategoryNode[] => {
  const childrenOf = new Map<number | null, CategoryRow[]>();
  for (const r of rows) {
    const key = r.parentId ?? null;
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(r);
    else childrenOf.set(key, [r]);
  }
  const toNode = (r: CategoryRow): CategoryNode => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? null,
    sortOrder: r.sortOrder,
    children: (childrenOf.get(r.id) ?? []).sort(bySort).map(toNode),
  });
  return (childrenOf.get(null) ?? []).sort(bySort).map(toNode);
};

/**
 * 从当前分类向上回溯到根，返回根→当前的面包屑路径。
 * @param rows 全量分类
 * @param id 当前分类 id
 * @returns 路径数组（根在前）；id 不存在返回空数组
 */
export const toBreadcrumb = (rows: CategoryRow[], id: number): CategoryBreadcrumbItem[] => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: CategoryBreadcrumbItem[] = [];
  const seen = new Set<number>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift({ id: cur.id, name: cur.name, slug: cur.slug });
    if (cur.parentId == null) break;
    cur = byId.get(cur.parentId);
  }
  return path;
};
