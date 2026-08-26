/**
 * src/routes/auth.ts
 * 鉴权路由：/api/v1/auth 下的 6 个端点（以契约为准）。
 *
 * 薄路由纪律：注册/登录/me 的「领域逻辑（查重、密码校验、鉴权结果构造、专用 401 码）」已下沉到
 *   services/user.ts（registerUser / authenticateUser / buildAuthResult）；
 *   refresh 的旋转与 1002/1003/1005 在 services/refresh.ts；本路由只做「校验 → 调 service → 设 Cookie → 格式化」。
 *
 * 专用 401 码由 service 严格按契约抛出，路由不统一化：
 *   1001 用户名或密码错（不暴露账号是否存在）  ·  1003 刷新令牌失效/已旋转/重放
 *   1004 令牌缺失（仅靠 Cookie/Body 读取判定，属 HTTP 层职责，留在本路由）  ·  1005 账号禁用
 *   1002 令牌无效或已过期（通用，service 抛）
 *
 * 注：zod-validator 0.9 在 zod v4 下 `c.req.valid('json')` 推断为 unknown，
 * 故在 handler 内以 `as z.infer<typeof schema>` 取回精确类型（中间件已做运行时校验，安全）。
 */
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { REFRESH_TTL_MS, revokeUserTokens, rotateRefreshToken } from '@/services/refresh';
import {
  authenticateUser,
  buildAuthResult,
  getUserById,
  registerUser,
  toPublicUser,
} from '@/services/user';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { failResponse, ok } from '@/shared/response';

/** 路由实例（携带 user 变量类型，供 me / logout 使用）。 */
const authRoute = new Hono<AuthVars>();

// ---- 入参 Zod Schema（路由层的校验职责）----
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

// ---- Cookie 辅助（浏览器端 refreshToken 载体，HTTP 层职责）----
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
  const input = c.req.valid('json') as RegisterInput;
  const user = await registerUser(input);
  const result = await buildAuthResult(user);
  setRefreshCookie(c, result.refreshToken, refreshMaxAge());
  return ok(result);
});

/** POST /login — 校验密码发 JWT；失败 401 1001（密码错）/ 1005（禁用，由 service 抛）。 */
authRoute.post('/login', v.json(loginSchema), async (c) => {
  const { username, password } = c.req.valid('json') as LoginInput;
  const user = await authenticateUser(username, password);
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
  const u = await getUserById(Number(authUser.id));
  return ok(toPublicUser(u));
});

/** POST /:provider/callback — 第三方登录占位，首波返回 500（内部错误口径 5000，B0 已将契约 501 修正为 500）。 */
authRoute.post('/:provider/callback', v.param(providerSchema), async () => {
  // M3-09 扩展点：真实 OAuth 对接在后续批次；provider 已校验合法，此处仅占位
  throw new AppError(ErrCode.INTERNAL, 500, '第三方登录尚未实现（M3-09 扩展点）');
});

export { authRoute };
