/**
 * src/routes/auth.ts
 * 鉴权路由：/api/v1/auth 下的 6 个端点（以契约为准）。
 *
 * 关键纪律：login / refresh 的「专用 401 码」严格按契约返回，绝不统一化——
 *   1001 用户名或密码错（不暴露账号是否存在）
 *   1003 刷新令牌失效 / 已旋转 / 重放
 *   1004 令牌缺失
 *   1005 账号禁用（刻意不用 403，避免暴露账号存在性）
 *   1002 令牌无效或已过期（通用）
 *
 * 注：zod-validator 0.9 在 zod v4 下 `c.req.valid('json')` 推断为 unknown，
 * 故在 handler 内以 `as z.infer<typeof schema>` 取回精确类型（中间件已做运行时校验，安全）。
 */

import { eq, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type User, users } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { isUniqueConstraintError } from '@/lib/db-error';
import { AppError } from '@/lib/http-error';
import { hashPassword, verifyPassword } from '@/lib/password';
import { REFRESH_TTL_MS, revokeUserTokens, rotateRefreshToken } from '@/lib/refresh';
import { failResponse, ok } from '@/lib/response';
import { buildAuthResult, toPublicUser } from '@/lib/user';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

/** 路由实例（携带 user 变量类型，供 me / logout 使用）。 */
const authRoute = new Hono<AuthVars>();

// ---- 入参 Zod Schema ----
const registerSchema = z.object({
  username: z.string().min(1).max(32),
  email: z.string().email().max(255),
  password: z.string().min(8),
  nickname: z.string().max(32).optional(),
});
const loginSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(8),
});
const refreshSchema = z.object({
  refreshToken: z.string().nullable().optional(),
});
const providerSchema = z.object({
  provider: z.enum(['wechat', 'weibo', 'github']),
});

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

// ---- Cookie 辅助（浏览器端 refreshToken 载体）----
const COOKIE = 'refreshToken';
const COOKIE_ATTRS = 'HttpOnly; SameSite=None; Secure; Path=/';
const setRefreshCookie = (c: Context, token: string, maxAgeSec: number): void => {
  c.header('Set-Cookie', `${COOKIE}=${token}; ${COOKIE_ATTRS}; Max-Age=${maxAgeSec}`);
};
const clearRefreshCookie = (c: Context): void => {
  c.header('Set-Cookie', `${COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`);
};
const refreshMaxAge = (): number => Math.floor(REFRESH_TTL_MS / 1000);

// ---- 端点 ----

/** POST /register — 创建 member（role 默认 member），返回 JWT。 */
authRoute.post('/register', v.json(registerSchema), async (c) => {
  const { username, email, password, nickname } = c.req.valid('json') as RegisterInput;
  const db = getDb();

  const dup = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .all();
  if (dup.length > 0) throw new AppError(ErrCode.CONFLICT, 409); // 3002 用户名/邮箱冲突（常见路径）

  // 并发竞态：两次同用户名请求可能都通过上面的查重，其一插入命中唯一约束。
  // 用 try/catch 兜底，把底层 SQLITE_CONSTRAINT_UNIQUE 收敛回契约约定的 409/3002，而非落到 500。
  let inserted: User[];
  try {
    inserted = await db
      .insert(users)
      .values({
        username,
        email,
        passwordHash: await hashPassword(password),
        displayName: nickname ?? username,
        role: 'member',
        status: 'active',
        level: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .all();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 并发重复注册
    throw err;
  }
  const user = inserted[0];
  if (!user) throw new AppError(ErrCode.INTERNAL, 500);

  const result = await buildAuthResult(user);
  setRefreshCookie(c, result.refreshToken, refreshMaxAge());
  return ok(result);
});

/** POST /login — 校验密码发 JWT；失败 401 1001（密码错）/ 1005（禁用）。 */
authRoute.post('/login', v.json(loginSchema), async (c) => {
  const { username, password } = c.req.valid('json') as LoginInput;
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.username, username)).all();
  const user = rows[0];
  if (!user) throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401); // 1001 不暴露账号是否存在
  if (user.status === 'disabled') throw new AppError(ErrCode.ACCOUNT_DISABLED, 401); // 1005
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401); // 1001
  }

  const result = await buildAuthResult(user);
  setRefreshCookie(c, result.refreshToken, refreshMaxAge());
  return ok(result);
});

/** POST /refresh — 用 refreshToken 换新 JWT；旋转；失效 401 1003 / 1004 / 1002 / 1005。 */
authRoute.post('/refresh', async (c) => {
  // 浏览器端可能不带 body（用 Cookie），故手动解析容忍空体
  const raw = await c.req.json().catch(() => ({}));
  const parsed = refreshSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: i.path.join('.') || '_',
      message: i.message,
    }));
    return failResponse(ErrCode.VALIDATION, 400, { errors });
  }
  const body = parsed.data;

  // 读取优先级：Cookie 优先，缺失取请求体（契约规定）
  const fromCookie = c.req.header('cookie')?.match(/refreshToken=([^;]+)/)?.[1];
  const token = fromCookie ?? body.refreshToken ?? null;
  if (!token) throw new AppError(ErrCode.TOKEN_MISSING, 401, '缺少刷新令牌'); // 1004

  const rotated = await rotateRefreshToken(token); // 内部抛 1002/1003/1005
  const result = await buildAuthResult(rotated.user, rotated.raw);
  setRefreshCookie(c, result.refreshToken, refreshMaxAge());
  return ok(result);
});

/** POST /logout — 作废刷新令牌家族（登出闭环）。需登录。 */
authRoute.post('/logout', authMiddleware, async (c) => {
  const authUser = c.get('user');
  await revokeUserTokens(Number(authUser.id));
  clearRefreshCookie(c);
  return ok({ success: true });
});

/** GET /me — 当前登录用户。需登录。 */
authRoute.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, Number(authUser.id)))
    .all();
  const dbUser = rows[0];
  if (!dbUser) throw new AppError(ErrCode.NOT_FOUND, 404); // 3001 不应发生，防御性
  return ok(toPublicUser(dbUser));
});

/** POST /:provider/callback — 第三方登录占位，首波返回 500（内部错误口径 5000，B0 已将契约 501 修正为 500）。 */
authRoute.post('/:provider/callback', v.param(providerSchema), async () => {
  // M3-09 扩展点：真实 OAuth 对接在后续批次；provider 已校验合法，此处仅占位
  throw new AppError(ErrCode.INTERNAL, 500, '第三方登录尚未实现（M3-09 扩展点）');
});

export { authRoute };
