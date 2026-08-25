/**
 * src/routes/categories-read.ts
 * 分类公开读路由（B3）/categories 子树：平铺列表 / 树 / 统计 / 面包屑 共 4 个公开端点。
 *
 * 关键纪律（对齐契约 Category + §2.2 + x-max-depth:4）：
 * - 全部 security:[]，无需鉴权。
 * - 树 / 面包屑 / 深度校验均依赖完整父链，故统一由 allCategories 取全量后在内存处理。
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '@/db/client';
import { articles, type CategoryRow, categories } from '@/db/schema';
import { buildTree, toBreadcrumb, toCategory } from '@/lib/category';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { ok } from '@/lib/response';
import type { AuthVars } from '@/middleware/auth';

/** 取全量分类（环检测 / 深度 / 树 / 面包屑均依赖完整父链）。 */
export const allCategories = async (): Promise<CategoryRow[]> =>
  getDb().select().from(categories).all();

const categoriesReadRoute = new Hono<AuthVars>();

/** GET / — 公开平铺列表。 */
categoriesReadRoute.get('/', async () => {
  const rows = await allCategories();
  return ok(rows.map(toCategory));
});

/** GET /tree — 无限级树（公开）。 */
categoriesReadRoute.get('/tree', async () => {
  const rows = await allCategories();
  return ok(buildTree(rows));
});

/** GET /stats — 各分类已发布文章数（公开）。 */
categoriesReadRoute.get('/stats', async () => {
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
  return ok(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      articleCount: Number(r.articleCount),
    })),
  );
});

/** GET /:id/breadcrumb — 当前分类到根的面包屑（公开）。 */
categoriesReadRoute.get('/:id/breadcrumb', async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await allCategories();
  const target = rows.find((r) => r.id === id);
  if (!target) throw new AppError(ErrCode.NOT_FOUND, 404);
  return ok(toBreadcrumb(rows, id));
});

export { categoriesReadRoute };
