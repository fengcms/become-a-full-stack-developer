/**
 * src/routes/categories-read.ts
 * 分类公开读路由（B3）/categories 子树：平铺列表 / 树 / 统计 / 面包屑 共 4 个公开端点。
 * 薄路由：委托 services/category 取数 + 序列化 → ok 格式化。
 *
 * 关键纪律（对齐契约 Category + §2.2 + x-max-depth:4）：
 * - 全部 security:[]，无需鉴权。
 * - 树 / 面包屑 / 深度校验均依赖完整父链，统一在 services/category 取全量后在内存处理。
 */
import { Hono } from 'hono';
import type { AuthVars } from '@/middleware/auth';
import {
  getCategoryBreadcrumb,
  getCategoryStats,
  getCategoryTree,
  listCategories,
} from '@/services/category';
import { ok } from '@/shared/response';

const categoriesReadRoute = new Hono<AuthVars>();

/** GET / — 公开平铺列表。 */
categoriesReadRoute.get('/', async () => ok(await listCategories()));

/** GET /tree — 无限级树（公开）。 */
categoriesReadRoute.get('/tree', async () => ok(await getCategoryTree()));

/** GET /stats — 各分类已发布文章数（公开）。 */
categoriesReadRoute.get('/stats', async () => ok(await getCategoryStats()));

/** GET /:id/breadcrumb — 当前分类到根的面包屑（公开）。 */
categoriesReadRoute.get('/:id/breadcrumb', async (c) => {
  const id = Number(c.req.param('id'));
  return ok(await getCategoryBreadcrumb(id));
});

export { categoriesReadRoute };
