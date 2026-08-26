/**
 * src/lib/user.ts
 * 用户响应序列化（脱敏）+ 鉴权结果构造。
 * DB 行 snake_case → 契约响应 camelCase；passwordHash 绝不外泄。
 */
import { getActiveEnv } from '@/config/env';
import type { User } from '@/db/schema';
import { type Role, signAccessToken } from '@/lib/jwt';
import { issueRefreshToken } from '@/lib/refresh';

/** 契约 User 响应（脱敏后）。 */
export interface PublicUser {
  id: number;
  username: string;
  email?: string;
  nickname: string;
  avatar: string | null;
  role: Role;
  status: 'active' | 'disabled';
  level: number;
  createdAt: string;
}

/** 契约 AuthResult（登录 / 刷新返回）。 */
export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicUser;
}

/** 访问令牌有效期（秒）。 */
export const ACCESS_TTL_SEC = 3600;

/**
 * users 行 → 契约 User。邮箱仅存在时返回；nickname 缺省回退 username。
 * @param u users 行
 */
export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  ...(u.email ? { email: u.email } : {}),
  nickname: u.displayName ?? u.username,
  avatar: u.avatarUrl ?? null,
  role: u.role as Role,
  status: u.status as 'active' | 'disabled',
  level: u.level,
  createdAt: u.createdAt.toISOString(),
});

/**
 * 构造完整鉴权结果：签发 access（无状态 JWT）+ refresh（有状态），并序列化用户。
 * @param user users 行
 * @param refreshRaw 可选，复用已签发的刷新令牌明文（refresh 旋转时避免重复签发）
 */
export const buildAuthResult = async (user: User, refreshRaw?: string): Promise<AuthResult> => {
  const accessToken = await signAccessToken(
    { sub: String(user.id), role: user.role as Role },
    getActiveEnv().JWT_SECRET,
    ACCESS_TTL_SEC,
  );
  const refreshToken = refreshRaw ?? (await issueRefreshToken(user.id)).raw;
  return {
    accessToken,
    expiresIn: ACCESS_TTL_SEC,
    refreshToken,
    user: toPublicUser(user),
  };
};
