/**
 * src/routes/users-admin.ts
 * admin 重置用户密码（忘记密码唯一兜底，v1 无邮件找回）。
 * 重置后作废该用户全部 refreshToken，强制重新登录。
 * 挂载于 /api/v1/admin/users，故完整路径 /admin/users/{id}/reset-password。
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { hashPassword } from '@/lib/password';
import { revokeUserTokens } from '@/lib/refresh';
import { ok } from '@/lib/response';
import { type AuthVars, authMiddleware, guard } from '@/middleware/auth';
import { v } from '@/middleware/validate';

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
    const db = getDb();
    const u = (await db.select().from(users).where(eq(users.id, id)).limit(1).all())[0];
    if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(users.id, id))
      .run();
    await revokeUserTokens(id);
    return ok({});
  },
);

export { usersAdminRoute };
