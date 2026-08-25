/**
 * src/routes/categories-write.ts
 * 分类写路由（B3）/categories 子树：创建 / 更新 / 删除 共 3 个 editor 端点。
 *
 * 关键纪律（对齐契约 Category + §2.2 + x-max-depth:4 + x-cascade:none）：
 * - 写操作 x-authz minRole:editor。
 * - 创建 / 变更 parentId 须做环检测（wouldCreateCycle）+ 深度≤4（超界 3002 拒）。
 * - 删除 x-cascade:none，有子节点或文章引用则 3002 拒删。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { articles, type CategoryRow, categories } from '@/db/schema';
import { depthOf, MAX_CATEGORY_DEPTH, toCategory, wouldCreateCycle } from '@/lib/category';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import { slugField } from '@/lib/slug';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { allCategories } from './categories-read';

/** 分类创建/更新共用 Schema（name + slug 必填，其余可选）。 */
const categorySchema = z.object({
  name: z.string().min(1).max(50),
  slug: slugField,
  description: z.string().max(500).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
});
type CategoryInput = z.infer<typeof categorySchema>;

const categoriesWriteRoute = new Hono<AuthVars>();

/** POST / — 创建分类（editor/admin）。 */
categoriesWriteRoute.post(
  '/',
  authMiddleware,
  guard('editor'),
  v.json(categorySchema),
  async (c) => {
    const input = c.req.valid('json') as CategoryInput;
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
    return ok(toCategory(created));
  },
);

/** PUT /:id — 更新分类（editor/admin）；变更 parentId 须防环 + 限深。 */
categoriesWriteRoute.put(
  '/:id',
  authMiddleware,
  guard('editor'),
  v.json(categorySchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const input = c.req.valid('json') as CategoryInput;
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

    const newParent = input.parentId ?? null;
    if (newParent !== existing.parentId) {
      const rows = await allCategories();
      if (newParent != null) {
        const parent = rows.find((r) => r.id === newParent);
        if (!parent) throw new AppError(ErrCode.NOT_FOUND, 404);
        if (wouldCreateCycle(rows, id, newParent)) {
          throw new AppError(ErrCode.CONFLICT, 409); // 3002 成环
        }
        if (depthOf(rows, parent.id) + 1 > MAX_CATEGORY_DEPTH) {
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
        description: input.description ?? null,
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
    return ok(toCategory(updated));
  },
);

/** DELETE /:id — 删除分类（editor/admin）；x-cascade:none，有子节点或文章引用则拒删。 */
categoriesWriteRoute.delete('/:id', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
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
  return ok({ success: true });
});

export { categoriesWriteRoute };
