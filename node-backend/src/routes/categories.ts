/**
 * src/routes/categories.ts
 * 分类路由（读 + 写，合并自 categories-read/write）：公开读（平铺/树/统计/面包屑）+ editor 写（创建/更新/删除）。
 * 薄路由：委托 services/category 取数/落地 + 序列化 → ok 格式化。
 *
 * 关键纪律（对齐契约 Category + §2.2 + x-max-depth:4 + x-cascade:none）：
 * - 读端点 security:[]；写端点 x-authz minRole:editor。
 * - 树/面包屑/深度校验依赖完整父链，统一在 services/category 取全量后在内存处理。
 * - 创建/变更 parentId 须做环检测（wouldCreateCycle）+ 深度≤4（超界 3002 拒）。
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
  getCategoryBreadcrumb,
  getCategoryStats,
  getCategoryTree,
  listCategories,
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

const categoriesRoute = new Hono<AuthVars>();

// —— 公开读 ——
/** GET / — 公开平铺列表。 */
categoriesRoute.get('/', async () => ok(await listCategories()));

/** GET /tree — 无限级树（公开）。 */
categoriesRoute.get('/tree', async () => ok(await getCategoryTree()));

/** GET /stats — 各分类已发布文章数（公开）。 */
categoriesRoute.get('/stats', async () => ok(await getCategoryStats()));

/** GET /:id/breadcrumb — 当前分类到根的面包屑（公开）。 */
categoriesRoute.get('/:id/breadcrumb', async (c) => {
  const id = Number(c.req.param('id'));
  return ok(await getCategoryBreadcrumb(id));
});

// —— editor 写 ——
/** POST / — 创建分类（editor/admin）。 */
categoriesRoute.post('/', authMiddleware, guard('editor'), v.json(categorySchema), async (c) => {
  const input = c.req.valid('json') as CategoryInput;
  return ok(await createCategory(input));
});

/** PUT /:id — 更新分类（editor/admin）；变更 parentId 须防环 + 限深。 */
categoriesRoute.put('/:id', authMiddleware, guard('editor'), v.json(categorySchema), async (c) => {
  const id = Number(c.req.param('id'));
  const input = c.req.valid('json') as CategoryInput;
  return ok(await updateCategory(id, input));
});

/** DELETE /:id — 删除分类（editor/admin）；x-cascade:none，有子节点或文章引用则拒删。 */
categoriesRoute.delete('/:id', authMiddleware, guard('editor'), async (c) => {
  const id = Number(c.req.param('id'));
  await deleteCategory(id);
  return ok({ success: true });
});

export { categoriesRoute };
