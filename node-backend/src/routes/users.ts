/**
 * src/routes/users.ts
 * 用户管理（admin）：列表（分页 + role/status/keyword 筛选）/ 详情 / 变更角色·状态·等级。
 * 角色提升：admin 经 PATCH /users/{id} 将 member 升 editor（亦可重置为 member / 升 admin）。
 * level 仅展示用，不具业务权限。所有端点需 admin（x-authz.minRole: admin）。
 * 薄路由：校验入参 → 调恰好一个 service → 用 paginate/ok 格式化。无 DB 查询、无业务规则。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { getUserById, listUsers, toPublicUser, updateUser } from '@/services/user';
import { meta, parsePage } from '@/shared/pagination';
import { ok, paginate } from '@/shared/response';

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
  const { items, total } = await listUsers({
    pageSize,
    offset,
    role: c.req.query('role'),
    status: c.req.query('status'),
    keyword: c.req.query('keyword'),
  });
  return paginate(items, meta(page, pageSize, total));
});

/** GET /:id — 用户详情（admin）。 */
usersRoute.get('/:id', authMiddleware, guard('admin'), async (c) => {
  const id = Number(c.req.param('id'));
  const u = await getUserById(id);
  return ok(toPublicUser(u));
});

/** PATCH /:id — 变更角色 / 状态 / 等级（admin）。 */
usersRoute.patch('/:id', authMiddleware, guard('admin'), v.json(updateUserSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json') as UpdateUserInput;
  const updated = await updateUser(id, body, Number(c.get('user').id));
  return ok(updated);
});

export { usersRoute };
