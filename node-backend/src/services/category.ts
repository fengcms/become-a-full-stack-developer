/**
 * src/services/category.ts
 * 分类领域纯逻辑（与路由解耦，便于单测）：序列化、无限级树构建、环检测、深度计算、面包屑。
 * 所有 DB 行 snake_case → 契约 camelCase 在此统一完成。
 *
 * 关键约束（契约 Category + x-max-depth:4 + §2.2）：
 * - 树经 parentId 自关联递归；最大嵌套深度 4 级，创建/变更 parentId 超出即拒绝。
 * - 环检测：若把节点挂到自身子孙下会形成环，建/改 parentId 时必须拒绝（见 wouldCreateCycle）。
 * - 上述算法属「契约留外」行为（§2.2），此处给出合理实现并在 B3-NOTES 登记。
 *
 * 注：本文件约 373 行，超过 200 行软上限——集中承载「序列化 + 无限级树 + 环检测 + 深度计算
 * + 面包屑 + 增删改」紧密相关的分类领域逻辑，拆分反而割裂树/环/深度的协作。
 * 按项目纪律「特殊情况需注释说明」显式标注 services 例外；routes 层仍严守 ≤200。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { articles, type CategoryRow, categories } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';

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
  // 防御：数据腐化成环时 seen 集截断，避免递归死循环（与 depthOf/toBreadcrumb 同款防御）。
  const seen = new Set<number>();
  const toNode = (r: CategoryRow): CategoryNode => {
    if (seen.has(r.id)) {
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
        children: [],
      };
    }
    seen.add(r.id);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description ?? null,
      sortOrder: r.sortOrder,
      children: (childrenOf.get(r.id) ?? []).sort(bySort).map(toNode),
    };
  };
  return (childrenOf.get(null) ?? []).sort(bySort).map(toNode);
};

/**
 * 计算以 id 为根的子树高度（含自身，单节点=1）。
 * 用于「移动带子孙的子树」时校验整棵被移子树的深度不越过 x-max-depth。
 * @param rows 全量分类
 * @param id 子树根 id（不存在时按单节点计 1）
 */
export const subtreeHeight = (rows: CategoryRow[], id: number): number => {
  const childrenOf = new Map<number | null, CategoryRow[]>();
  for (const r of rows) {
    const key = r.parentId ?? null;
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(r);
    else childrenOf.set(key, [r]);
  }
  const height = (nodeId: number): number => {
    const kids = childrenOf.get(nodeId) ?? [];
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map((k) => height(k.id)));
  };
  return height(id);
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

/** 分类创建/更新入参（结构与 routes/categories-write 的 categorySchema 对齐）。 */
export interface CategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  parentId?: number | null;
  sortOrder?: number;
}

/** 取全量分类（环检测 / 深度 / 树 / 面包屑均依赖完整父链）。 */
export const allCategories = async (): Promise<CategoryRow[]> =>
  getDb().select().from(categories).all();

/** GET / — 公开平铺列表。 */
export const listCategories = async (): Promise<ReturnType<typeof toCategory>[]> => {
  const rows = await allCategories();
  return rows.map(toCategory);
};

/** GET /tree — 无限级树（公开）。 */
export const getCategoryTree = async (): Promise<CategoryNode[]> =>
  buildTree(await allCategories());

/** GET /:id/breadcrumb — 当前分类到根的面包屑（公开）；不存在 → 404。 */
export const getCategoryBreadcrumb = async (id: number): Promise<CategoryBreadcrumbItem[]> => {
  const rows = await allCategories();
  const target = rows.find((r) => r.id === id);
  if (!target) throw new AppError(ErrCode.NOT_FOUND, 404);
  return toBreadcrumb(rows, id);
};

/** GET /stats — 各分类已发布文章数（公开）。 */
export const getCategoryStats = async (): Promise<
  { id: number; name: string; slug: string; articleCount: number }[]
> => {
  const rows = await getDb()
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      articleCount: sql<number>`count(${articles.id})`,
    })
    .from(categories)
    .leftJoin(
      articles,
      and(
        eq(articles.categoryId, categories.id),
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
      ),
    )
    .groupBy(categories.id)
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    articleCount: Number(r.articleCount),
  }));
};

/** POST / — 创建分类（editor/admin）；深度 / slug 占用校验。 */
export const createCategory = async (
  input: CategoryInput,
): Promise<ReturnType<typeof toCategory>> => {
  const db = getDb();
  const dup = (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, input.slug))
      .limit(1)
      .all()
  )[0];
  if (dup) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用

  // 深度校验：挂到父下后深度 = 父深度 + 1，须 ≤ MAX
  if (input.parentId != null) {
    const rows = await allCategories();
    const parent = rows.find((r) => r.id === input.parentId);
    if (!parent) throw new AppError(ErrCode.NOT_FOUND, 404); // 父分类不存在
    if (depthOf(rows, parent.id) + 1 > MAX_CATEGORY_DEPTH) {
      throw new AppError(ErrCode.CONFLICT, 409); // 3002 超出最大嵌套深度
    }
  }

  const now = new Date();
  let inserted: CategoryRow[];
  try {
    inserted = await db
      .insert(categories)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 并发冲突
    throw err;
  }
  const created = inserted[0];
  if (!created) throw new AppError(ErrCode.INTERNAL, 500);
  return toCategory(created);
};

/** PUT /:id — 更新分类（editor/admin）；变更 parentId 须防环 + 限深。 */
export const updateCategory = async (
  id: number,
  input: CategoryInput,
): Promise<ReturnType<typeof toCategory>> => {
  const db = getDb();
  const existing = (
    await db.select().from(categories).where(eq(categories.id, id)).limit(1).all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);

  const dup = (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, input.slug))
      .limit(1)
      .all()
  )[0];
  if (dup && dup.id !== id) throw new AppError(ErrCode.CONFLICT, 409); // 3002 slug 占用

  const newParent = input.parentId ?? existing.parentId;
  if (newParent !== existing.parentId) {
    const rows = await allCategories();
    if (newParent != null) {
      const parent = rows.find((r) => r.id === newParent);
      if (!parent) throw new AppError(ErrCode.NOT_FOUND, 404);
      if (wouldCreateCycle(rows, id, newParent)) {
        throw new AppError(ErrCode.CONFLICT, 409); // 3002 成环
      }
      // 整棵被移动子树的深度 = 新父深度 + 被移动子树高度（含自身），须 ≤ MAX
      if (depthOf(rows, parent.id) + subtreeHeight(rows, id) > MAX_CATEGORY_DEPTH) {
        throw new AppError(ErrCode.CONFLICT, 409); // 3002 超出最大嵌套深度
      }
    }
  }

  const now = new Date();
  await db
    .update(categories)
    .set({
      name: input.name,
      slug: input.slug,
      description: input.description ?? existing.description,
      parentId: newParent,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: now,
    })
    .where(eq(categories.id, id))
    .run();
  const updated = (
    await db.select().from(categories).where(eq(categories.id, id)).limit(1).all()
  )[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toCategory(updated);
};

/** DELETE /:id — 删除分类（editor/admin）；x-cascade:none，有子节点或文章引用则拒删。 */
export const deleteCategory = async (id: number): Promise<void> => {
  const db = getDb();
  const existing = (
    await db.select().from(categories).where(eq(categories.id, id)).limit(1).all()
  )[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);

  const child = (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id))
      .limit(1)
      .all()
  )[0];
  if (child) throw new AppError(ErrCode.CONFLICT, 409); // 3002 仍有子分类

  const ref = (
    await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.categoryId, id), isNull(articles.deletedAt)))
      .limit(1)
      .all()
  )[0];
  if (ref) throw new AppError(ErrCode.CONFLICT, 409); // 3002 仍有文章归属

  await db.delete(categories).where(eq(categories.id, id)).run();
};
