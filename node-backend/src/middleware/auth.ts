/**
 * src/middleware/auth.ts
 * 鉴权中间件 + 守卫工厂。实现契约第 4 铁律的授权求值：
 *   ④(a) 角色层级 ≥ minRole → 放行
 *   ④(b) 否则若 resolveOwner 返回的资源归属 == 当前用户 → 放行（会员作者改自己草稿等）
 *   否则 → 2001 无权限
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getActiveEnv } from '../config/env';
import { ErrCode } from '../lib/codes';
import { AppError } from '../lib/http-error';
import { verifyAccessToken } from '../lib/jwt';

/** 当前登录用户（注入到 c.get('user')）。 */
export interface AuthUser {
  id: string;
  role: string;
}

/** Hono 上下文变量声明，供带类型的 c.get('user') 使用。 */
export type AuthVars = { Variables: { user: AuthUser } };

/** 角色层级：数值越大权限越高。 */
const ROLE_RANK: Record<string, number> = { member: 0, editor: 1, admin: 2 };

/**
 * 解析 Authorization: Bearer <token>，校验后注入 c.set('user')。
 * 缺失令牌抛 1004，失效 / 篡改抛 1002。
 */
export const authMiddleware: MiddlewareHandler<AuthVars> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AppError(ErrCode.TOKEN_MISSING, 401, '未携带访问令牌');

  const claims = await verifyAccessToken(token, getActiveEnv().JWT_SECRET);
  c.set('user', { id: claims.sub, role: claims.role });
  await next();
};

/**
 * 组合守卫：角色阶梯 或 归属者放行（见文件头第 4 铁律）。
 * @param minRole 最低角色
 * @param resolveOwner 可选，根据上下文解析资源归属用户 ID（用于 ownerOverride）
 */
export const guard =
  (
    minRole: string,
    resolveOwner?: (c: Context<AuthVars>) => string | null | Promise<string | null>,
  ): MiddlewareHandler<AuthVars> =>
  async (c, next) => {
    const user = c.get('user');
    if (!user) throw new AppError(ErrCode.TOKEN_MISSING, 401, '未携带访问令牌');

    const roleOk = (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
    if (roleOk) return next();

    if (resolveOwner) {
      const ownerId = await resolveOwner(c);
      if (ownerId && ownerId === user.id) return next();
    }
    throw new AppError(ErrCode.FORBIDDEN, 403);
  };
