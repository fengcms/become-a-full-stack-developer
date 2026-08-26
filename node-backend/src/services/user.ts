/**
 * src/services/user.ts
 * 用户领域逻辑 + 全部 DB 查询（路由薄化后的唯一查询归属地）。
 *
 * 职责：用户列表/详情/角色状态变更（含「自我护栏」「最后 admin 护栏」）、
 *       密码重置、个人资料读取与更新、改密、注册、登录鉴权、响应序列化与鉴权结果构造。
 * 不在此处拼装 HTTP 响应（ok/paginate 留给路由）；不引用 services 之外的领域服务（refresh 除外）。
 *
 * 注：本文件约 335 行，超过 200 行软上限——集中承载「用户列表/详情/角色状态变更 + 密码重置
 * + 个人资料 + 改密 + 注册登录鉴权 + 序列化」紧密相关的用户领域逻辑，拆分反而割裂这些协作。
 * 按项目纪律「特殊情况需注释说明」显式标注 services 例外；routes 层仍严守 ≤200。
 */
import { and, eq, like, or, sql } from 'drizzle-orm';
import { getActiveEnv } from '@/config/env';
import { getDb } from '@/db/client';
import { type User, users } from '@/db/schema';
import { issueRefreshToken, revokeUserTokens } from '@/services/refresh';
import { type Role, signAccessToken } from '@/shared/auth';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';
import { hashPassword, verifyPassword } from '@/shared/password';

// ---- 响应类型与序列化（脱敏）----

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

// ---- 鉴权结果构造 ----

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

// ---- 查询与领域操作 ----

/** 用户列表筛选参数（page/pageSize/offset 由路由 parsePage 提供；keyword 模糊匹配账号/昵称/邮箱）。 */
export interface ListUsersParams {
  pageSize: number;
  offset: number;
  role?: string;
  status?: string;
  keyword?: string;
}

/** 用户列表结果。items 已脱敏序列化；total 用于路由分页 meta。 */
export interface ListUsersResult {
  items: PublicUser[];
  total: number;
}

/** GET /users（admin）：分页 + role/status/keyword 筛选。 */
export const listUsers = async (params: ListUsersParams): Promise<ListUsersResult> => {
  const { pageSize, offset, role, status, keyword } = params;
  const conds = [];
  if (role) conds.push(eq(users.role, role));
  if (status) conds.push(eq(users.status, status));
  if (keyword)
    conds.push(
      or(
        like(users.username, `%${keyword}%`),
        like(users.displayName, `%${keyword}%`),
        like(users.email, `%${keyword}%`),
      ),
    );
  const where = conds.length ? and(...conds) : undefined;
  const rows = await getDb()
    .select()
    .from(users)
    .where(where)
    .orderBy(sql`users.created_at DESC, users.id DESC`)
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await getDb().select({ count: sql<number>`count(*)` }).from(users).where(where).all()
  )[0];
  return { items: rows.map(toPublicUser), total: Number(totalRow?.count ?? 0) };
};

/** 按 ID 取用户；不存在抛 NOT_FOUND(404)。供 /users/:id、/me、/auth/me 复用。 */
export const getUserById = async (id: number): Promise<User> => {
  const u = (await getDb().select().from(users).where(eq(users.id, id)).limit(1).all())[0];
  if (!u) throw new AppError(ErrCode.NOT_FOUND, 404);
  return u;
};

/** GET /members/:id（公开）：取会员；不存在或 disabled → 404（防账号枚举）。 */
export const getMemberOr404 = async (id: number): Promise<User> => {
  const u = await getUserById(id);
  if (u.status === 'disabled') throw new AppError(ErrCode.NOT_FOUND, 404);
  return u;
};

/** PATCH /users/:id 入参。 */
export interface UpdateUserInput {
  role?: 'admin' | 'editor' | 'member';
  status?: 'active' | 'disabled';
  level?: number;
}

/**
 * PATCH /users/:id（admin）：变更角色 / 状态 / 等级。
 * 含两项护栏：① 禁止管理员变更自身角色/状态（防自我降级/封禁锁死）；
 *           ② 最后 admin 保护——被操作者为 admin 且将失去 admin 或遭封禁时，若活跃 admin 仅剩 1 名则拒绝。
 * @param id 目标用户 ID
 * @param body 变更字段
 * @param operatorId 当前操作者 ID（用于「自身护栏」判断）
 */
export const updateUser = async (
  id: number,
  body: UpdateUserInput,
  operatorId: number,
): Promise<PublicUser> => {
  const existing = await getUserById(id); // 不存在 → 404
  const privileged = body.role !== undefined || body.status !== undefined;
  // 护栏一：禁止管理员变更自身角色/状态
  if (privileged && operatorId === id) {
    throw new AppError(ErrCode.FORBIDDEN, 403, undefined, {
      errors: [{ field: 'id', message: '不能变更自己的角色或状态' }],
    });
  }
  // 护栏二：最后 admin 保护
  if (privileged && existing.role === 'admin') {
    const wouldLoseAdmin = body.role !== undefined && body.role !== 'admin';
    const wouldDisable = body.status !== undefined && body.status === 'disabled';
    if (wouldLoseAdmin || wouldDisable) {
      const activeAdmins = (
        await getDb()
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
          .all()
      )[0];
      if (Number(activeAdmins?.count ?? 0) <= 1) {
        throw new AppError(ErrCode.CONFLICT, 409, undefined, {
          errors: [{ field: 'role', message: '至少保留一名活跃 admin' }],
        });
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.status !== undefined) patch.status = body.status;
  if (body.level !== undefined) patch.level = body.level;
  if (Object.keys(patch).length === 0) return toPublicUser(existing); // 空更新幂等
  patch.updatedAt = new Date();
  const updated = (
    await getDb().update(users).set(patch).where(eq(users.id, id)).returning().all()
  )[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toPublicUser(updated);
};

/** POST /admin/users/:id/reset-password（admin）：重置他人密码并作废其全部 refreshToken。 */
export const resetPassword = async (id: number, newPassword: string): Promise<void> => {
  const u = await getUserById(id); // 不存在 → 404
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, u.id))
    .run();
  await revokeUserTokens(u.id);
};

/** GET /me/profile：当前用户完整资料（脱敏）。 */
export const getProfile = async (meId: number): Promise<PublicUser> => {
  return toPublicUser(await getUserById(meId));
};

/** PATCH /me/profile 入参。 */
export interface ProfileInput {
  nickname?: string;
  avatar?: string | null;
  email?: string;
}

/** PATCH /me/profile：更新自身昵称 / 头像 / 邮箱；邮箱冲突 409(3002)。 */
export const updateProfile = async (meId: number, body: ProfileInput): Promise<PublicUser> => {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (body.nickname !== undefined) patch.displayName = body.nickname;
  if (body.avatar !== undefined) patch.avatarUrl = body.avatar;
  if (body.email !== undefined) patch.email = body.email;
  if (Object.keys(patch).length === 0) {
    return toPublicUser(await getUserById(meId)); // 空更新幂等
  }
  patch.updatedAt = new Date();
  try {
    const updated = (
      await db.update(users).set(patch).where(eq(users.id, meId)).returning().all()
    )[0];
    if (!updated) throw new AppError(ErrCode.NOT_FOUND, 404);
    return toPublicUser(updated);
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(ErrCode.CONFLICT, 409); // 3002 邮箱冲突
    throw err;
  }
};

/** POST /me/change-password：校验旧密码后更新，并作废全部 refreshToken。 */
export const changePassword = async (
  meId: number,
  oldPassword: string,
  newPassword: string,
): Promise<void> => {
  const u = await getUserById(meId);
  if (!(await verifyPassword(oldPassword, u.passwordHash))) {
    throw new AppError(ErrCode.VALIDATION, 400, undefined, {
      errors: [{ field: 'oldPassword', message: '旧密码错误' }],
    });
  }
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, u.id))
    .run();
  await revokeUserTokens(u.id);
};

// ---- 鉴权领域（注册 / 登录）----

/** POST /auth/register 入参。 */
export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}

/**
 * POST /auth/register：创建 member（role 默认 member）。
 * 先查重（用户名/邮箱唯一）；并发竞态下用唯一约束兜底收敛回 409(3002)。
 */
export const registerUser = async (input: RegisterUserInput): Promise<User> => {
  const db = getDb();
  const { username, email, password, nickname } = input;
  const dup = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .all();
  if (dup.length > 0) throw new AppError(ErrCode.CONFLICT, 409); // 3002 用户名/邮箱冲突（常见路径）

  // 并发竞态兜底：两次同用户名请求可能都通过查重，其一插入命中唯一约束 → 收敛回 409(3002)
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
  return user;
};

/**
 * POST /auth/login：校验密码发 JWT。
 * 失败口径（不暴露账号存在性）：用户不存在/密码错 → 401 1001；账号禁用 → 401 1005。
 */
export const authenticateUser = async (username: string, password: string): Promise<User> => {
  const rows = await getDb().select().from(users).where(eq(users.username, username)).all();
  const user = rows[0];
  if (!user) throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401); // 1001 不暴露账号是否存在
  if (user.status === 'disabled') throw new AppError(ErrCode.ACCOUNT_DISABLED, 401); // 1005
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401); // 1001
  }
  return user;
};
