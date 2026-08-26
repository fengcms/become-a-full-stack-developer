/**
 * src/routes/users-admin.ts
 * admin 重置用户密码（忘记密码唯一兜底，v1 无邮件找回）。
 * 重置后作废该用户全部 refreshToken，强制重新登录。
 * 挂载于 /api/v1/admin/users，故完整路径 /admin/users/{id}/reset-password。
 * 薄路由：校验入参 → 调 service → ok 格式化。无 DB 查询。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { resetPassword } from '@/services/user';
import { ok } from '@/shared/response';

const usersAdminRoute = new Hono<AuthVars>();

const resetSchema = z.object({ newPassword: z.string().min(8) });
type ResetInput = z.infer<typeof resetSchema>;

/** POST /:id/reset-password — admin 重置他人密码（admin）。 */
usersAdminRoute.post(
  '/:id/reset-password',
  authMiddleware,
  guard('admin'),
  v.json(resetSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const { newPassword } = c.req.valid('json') as ResetInput;
    await resetPassword(id, newPassword);
    return ok({});
  },
);

export { usersAdminRoute };
