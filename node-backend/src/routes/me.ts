/**
 * src/routes/me.ts
 * 当前用户资料与密码：GET/PATCH /me/profile、POST /me/change-password。
 * 邮箱可改（唯一，冲突 409/3002）；改密码需校验旧密码，并作废全部 refreshToken。
 * 挂载于 /api/v1/me。
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { hashPassword, verifyPassword } from '@/lib/password';
import { revokeUserTokens } from '@/lib/refresh';
import { ok } from '@/lib/response';
import { toPublicUser } from '@/lib/user';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const meRoute = new Hono<AuthVars>();

const profileSchema = z.object({
  nickname: z.string().max(32).optional(),
  avatar: z.string().url().max(512).nullable().optional(),
  email: z.string().email().max(255).optional(),
});
type ProfileInput = z.infer<typeof profileSchema>;

const changePwSchema = z.object({
  oldPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
type ChangePwInput = z.infer<typeof changePwSchema>;

/** GET /profile — 当前用户完整资料（含 email 等敏感字段）。 */
meRoute.get('/profile', authMiddleware, async (c) => {
  const me = c.get('user');
  const u = (
    await getDb()
      .select()
      .from(users)
      .where(eq(users.id, Number(me.id)))
      .limit(1)
      .all()
  )[0];
  if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
  return ok(toPublicUser(u));
});

/** PATCH /profile — 更新自身资料（昵称 / 头像 / 邮箱）。 */
meRoute.patch('/profile', authMiddleware, v.json(profileSchema), async (c) => {
  const me = c.get('user');
  const body = c.req.valid('json') as ProfileInput;
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (body.nickname !== undefined) patch.displayName = body.nickname;
  if (body.avatar !== undefined) patch.avatarUrl = body.avatar;
  if (body.email !== undefined) patch.email = body.email;
  if (Object.keys(patch).length === 0) {
    const u = (
      await db
        .select()
        .from(users)
        .where(eq(users.id, Number(me.id)))
        .limit(1)
        .all()
    )[0];
    if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
    return ok(toPublicUser(u));
  }
  patch.updatedAt = new Date();
  try {
    const updated = (
      await db
        .update(users)
        .set(patch)
        .where(eq(users.id, Number(me.id)))
        .returning()
        .all()
    )[0];
    if (!updated) throw new AppError(ErrCode.NOT_FOUND, 404);
    return ok(toPublicUser(updated));
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 邮箱冲突
    throw err;
  }
});

/** POST /change-password — 校验旧密码后更新，并作废全部 refreshToken。 */
meRoute.post('/change-password', authMiddleware, v.json(changePwSchema), async (c) => {
  const me = c.get('user');
  const { oldPassword, newPassword } = c.req.valid('json') as ChangePwInput;
  const db = getDb();
  const u = (
    await db
      .select()
      .from(users)
      .where(eq(users.id, Number(me.id)))
      .limit(1)
      .all()
  )[0];
  if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
  if (!(await verifyPassword(oldPassword, u.passwordHash))) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'oldPassword', message: '旧密码错误' }],
    });
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, u.id))
    .run();
  await revokeUserTokens(u.id);
  return ok({});
});

export { meRoute };
