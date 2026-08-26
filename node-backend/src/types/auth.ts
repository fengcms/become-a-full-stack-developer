/**
 * src/types/auth.ts
 * 鉴权上下文类型（types 层最底层，仅类型，不引入运行时依赖）。
 * AuthVars 由 middleware/auth.ts 与全部路由复用（≥2 方引用），故上提至此作为单一事实源。
 */
import type { Role } from '@/shared/auth';

/** 当前登录用户（注入到 c.get('user')）。 */
export interface AuthUser {
  id: string;
  role: Role;
}

/** Hono 上下文变量声明，供带类型的 c.get('user') 使用。 */
export type AuthVars = { Variables: { user: AuthUser } };
