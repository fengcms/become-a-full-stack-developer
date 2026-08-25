/**
 * src/routes/users.ts
 * 用户管理（admin）：列表（分页 + role/status/keyword 筛选）/ 详情 / 变更角色·状态·等级。
 * 角色提升：admin 经 PATCH /users/{id} 将 member 升 editor（亦可重置为 member / 升 admin）。
 * level 仅展示用，不具业务权限。所有端点需 admin（x-authz.minRole: admin）。
 */
import { and, eq, like, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { ok, paginate } from '@/lib/response';
import { toPublicUser } from '@/lib/user';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const usersRoute = new Hono<AuthVars>();

const updateUserSchema = z.object({
  role: z.enum(['admin', 'editor', 'member']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  level: z.number().int().optional(),
});
type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** GET / — 用户列表（admin，分页 + 筛选）。 */
usersRoute.get('/', authMiddleware, guard('admin'), async (c) => {
  const { page, pageSize, offset } = parsePage(c);
  const role = c.req.query('role');
  const status = c.req.query('status');
  const keyword = c.req.query('keyword');
  const conds = [];
  if (role) conds.push(eq(users.role, role));
  if (status) conds.push(eq(users.status, status));
  if (keyword)
    conds.push(
      or(
        like(users.username, `%${keyword}%`),
        like(users.displayName, `%${keyword}%`),
        like(users.email, `%${keyword}%`),
      ),
    );
  const where = conds.length ? and(...conds) : undefined;
  const rows = await getDb()
    .select()
    .from(users)
    .where(where)
    .orderBy(sql`users.created_at DESC, users.id DESC`)
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await getDb().select({ count: sql<number>`count(*)` }).from(users).where(where).all()
  )[0];
  return paginate(rows.map(toPublicUser), meta(page, pageSize, Number(totalRow?.count ?? 0)));
});

/** GET /:id — 用户详情（admin）。 */
usersRoute.get('/:id', authMiddleware, guard('admin'), async (c) => {
  const id = Number(c.req.param('id'));
  const u = (await getDb().select().from(users).where(eq(users.id, id)).limit(1).all())[0];
  if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
  return ok(toPublicUser(u));
});

/** PATCH /:id — 变更角色 / 状态 / 等级（admin）。 */
usersRoute.patch('/:id', authMiddleware, guard('admin'), v.json(updateUserSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json') as UpdateUserInput;
  const db = getDb();
  const existing = (await db.select().from(users).where(eq(users.id, id)).limit(1).all())[0];
  if (!existing) throw new AppError(ErrCode.NOT_FOUND, 404);
  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.status !== undefined) patch.status = body.status;
  if (body.level !== undefined) patch.level = body.level;
  if (Object.keys(patch).length === 0) return ok(toPublicUser(existing)); // 空更新幂等
  patch.updatedAt = new Date();
  const updated = (await db.update(users).set(patch).where(eq(users.id, id)).returning().all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return ok(toPublicUser(updated));
});

export { usersRoute };
