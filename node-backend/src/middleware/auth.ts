/**
 * src/middleware/auth.ts
 * 鉴权中间件 + 守卫工厂。实现契约第 4 铁律的授权求值：
 *   ④(a) 角色层级 ≥ minRole → 放行
 *   ④(b) 否则若 resolveOwner 返回的资源归属 == 当前用户 → 放行（会员作者改自己草稿等）
 *   否则 → 2001 无权限
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getActiveEnv } from '@/config/env';
import { type Role, verifyAccessToken } from '@/shared/auth';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import type { AuthVars } from '@/types/auth';

// 鉴权上下文类型（AuthUser / AuthVars）上提至 types/auth.ts 作为单一事实源；此处透出以保持路由现有 import 不变。
export type { AuthUser, AuthVars } from '@/types/auth';

/**
 * 角色层级：内部 0-based（member=0 / editor=1 / admin=2），
 * 对应契约文档「第 4 铁律」的 member(1) < editor(2) < admin(3) 口径，仅表示法不同，语义等价。
 * 数值越大权限越高。
 */
const ROLE_RANK: Record<Role, number> = { member: 0, editor: 1, admin: 2 };

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
    minRole: Role,
    resolveOwner?: (c: Context<AuthVars>) => string | null | Promise<string | null>,
  ): MiddlewareHandler<AuthVars> =>
  async (c, next) => {
    const user = c.get('user');
    if (!user) throw new AppError(ErrCode.TOKEN_MISSING, 401, '未携带访问令牌');

    const roleOk = (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
    if (roleOk) return next();

    if (resolveOwner) {
      const ownerId = await resolveOwner(c);
      if (ownerId === null) throw new AppError(ErrCode.NOT_FOUND, 404); // 资源不存在 → 404（守契约，优于 403）
      if (ownerId === user.id) return next(); // 归属者放行（ownerOverride）
    }
    throw new AppError(ErrCode.FORBIDDEN, 403); // 存在但非归属者 → 403（④(b)）
  };

/**
 * 可选鉴权中间件：携带有效 Bearer 则注入 c.set('user')，否则按匿名继续（不抛错）。
 * 用于契约 `security: [{}, {bearerAuth: []}]` 端点（如文章详情 / 阅读量），
 * 实现「可匿名、也可携带令牌」的标准语义；令牌无效时静默降级为匿名，不阻断请求。
 */
export const optionalAuthMiddleware: MiddlewareHandler<AuthVars> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) {
    try {
      const claims = await verifyAccessToken(token, getActiveEnv().JWT_SECRET);
      c.set('user', { id: claims.sub, role: claims.role });
    } catch {
      // 可选鉴权：无效令牌按匿名处理，不抛错
    }
  }
  await next();
};
