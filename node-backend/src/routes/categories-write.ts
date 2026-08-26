/**
 * src/routes/categories-write.ts
 * 分类写路由（B3）/categories 子树：创建 / 更新 / 删除 共 3 个 editor 端点。
 * 薄路由：鉴权 + 校验入参（zod）→ 调 services/category → ok/toCategory 格式化。
 *
 * 关键纪律（对齐契约 Category + §2.2 + x-max-depth:4 + x-cascade:none）：
 * - 写操作 x-authz minRole:editor。
 * - 创建 / 变更 parentId 须做环检测（wouldCreateCycle）+ 深度≤4（超界 3002 拒）。
 * - 删除 x-cascade:none，有子节点或文章引用则 3002 拒删。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  type CategoryInput,
  createCategory,
  deleteCategory,
  updateCategory,
} from '@/services/category';
import { ok } from '@/shared/response';
import { slugField } from '@/shared/slug';

/** 分类创建/更新共用 Schema（name + slug 必填，其余可选）。 */
const categorySchema = z.object({
  name: z.string().min(1).max(50),
  slug: slugField,
  description: z.string().max(500).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const categoriesWriteRoute = new Hono<AuthVars>();

/** POST / — 创建分类（editor/admin）。 */
categoriesWriteRoute.post(
  '/',
  authMiddleware,
  guard('editor'),
  v.json(categorySchema),
  async (c) => {
    const input = c.req.valid('json') as CategoryInput;
    return ok(await createCategory(input));
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
    return ok(await updateCategory(id, input));
  },
);

/** DELETE /:id — 删除分类（editor/admin）；x-cascade:none，有子节点或文章引用则拒删。 */
categoriesWriteRoute.delete('/:id', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  await deleteCategory(id);
  return ok({ success: true });
});

export { categoriesWriteRoute };
