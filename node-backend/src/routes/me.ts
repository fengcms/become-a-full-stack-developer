/**
 * src/routes/me.ts
 * 当前用户资料与密码：GET/PATCH /me/profile、POST /me/change-password。
 * 邮箱可改（唯一，冲突 409/3002）；改密码需校验旧密码，并作废全部 refreshToken。
 * 挂载于 /api/v1/me。
 * 薄路由：校验入参 → 调 service → ok 格式化。无 DB 查询、无业务规则、无手工序列化。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { changePassword, getProfile, type ProfileInput, updateProfile } from '@/services/user';
import { ok } from '@/shared/response';

const meRoute = new Hono<AuthVars>();

const profileSchema = z.object({
  nickname: z.string().max(32).optional(),
  avatar: z.string().url().max(512).nullable().optional(),
  email: z.string().email().max(255).optional(),
});
const changePwSchema = z.object({
  oldPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
type ChangePwInput = z.infer<typeof changePwSchema>;

/** GET /profile — 当前用户完整资料（含 email 等敏感字段）。 */
meRoute.get('/profile', authMiddleware, async (c) => {
  return ok(await getProfile(Number(c.get('user').id)));
});

/** PATCH /profile — 更新自身资料（昵称 / 头像 / 邮箱）。 */
meRoute.patch('/profile', authMiddleware, v.json(profileSchema), async (c) => {
  const body = c.req.valid('json') as ProfileInput;
  return ok(await updateProfile(Number(c.get('user').id), body));
});

/** POST /change-password — 校验旧密码后更新，并作废全部 refreshToken。 */
meRoute.post('/change-password', authMiddleware, v.json(changePwSchema), async (c) => {
  const { oldPassword, newPassword } = c.req.valid('json') as ChangePwInput;
  await changePassword(Number(c.get('user').id), oldPassword, newPassword);
  return ok({});
});

export { meRoute };
