/**
 * src/services/refresh.ts
 * 有状态刷新令牌（refresh token）模型：签发 → 旋转 → 作废，全部落在 refresh_tokens 表。
 *
 * 设计要点（契约 POST /auth/refresh 强制旋转策略）：
 *  - 明文令牌只在签发瞬间返回客户端一次；库内仅存 SHA-256 哈希，即便泄露也无法还原。
 *  - refresh 成功即作废旧令牌并签发新值（旋转）。
 *  - 检测到「已作废令牌被再次使用」视为重放 → 连带作废该用户整个令牌家族（须重新登录）。
 *  - logout 直接作废家族，完成登出闭环。
 */
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { refreshTokens, type User, users } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 刷新令牌有效期：7 天。 */
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 生成 32 字节随机十六进制令牌（Web Crypto，Node / CF 通用，无需 node:crypto）。 */
const randomToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** 对明文令牌计算 SHA-256 十六进制摘要（库内存储与查询使用）。 */
const sha256 = async (input: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * 签发一枚新刷新令牌并写入 refresh_tokens 表（仅存哈希）。
 * @param userId 用户 ID
 * @returns 明文令牌（仅此一次返回）与其过期时间（毫秒时间戳）
 */
export const issueRefreshToken = async (
  userId: number,
): Promise<{ raw: string; expiresAt: number }> => {
  const raw = randomToken();
  const now = Date.now();
  await getDb()
    .insert(refreshTokens)
    .values({
      tokenHash: await sha256(raw),
      userId,
      expiresAt: new Date(now + REFRESH_TTL_MS),
      createdAt: new Date(now),
    });
  return { raw, expiresAt: now + REFRESH_TTL_MS };
};

/**
 * 校验并旋转刷新令牌：成功则作废旧令牌、签发新令牌，返回新令牌与用户信息。
 * @param raw 客户端提交的明文刷新令牌
 * @throws 1002（无效）/ 1003（失效·已旋转·重放）/ 1005（账号禁用）
 */
export const rotateRefreshToken = async (
  raw: string,
): Promise<{ user: User; raw: string; expiresAt: number }> => {
  const db = getDb();
  const hash = await sha256(raw);
  const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).all();
  const row = rows[0];

  if (!row) {
    // 完全查不到：伪造 / 从未签发 → 无效（1002）
    throw new AppError(ErrCode.TOKEN_INVALID, 401);
  }
  if (row.revokedAt !== null) {
    // 已作废却被再次使用：重放攻击 → 连带作废家族并拒登（1003）
    await revokeUserTokens(row.userId);
    throw new AppError(ErrCode.REFRESH_TOKEN_INVALID, 401);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    // 过期：失效（1003）
    throw new AppError(ErrCode.REFRESH_TOKEN_INVALID, 401);
  }

  const userRows = await db.select().from(users).where(eq(users.id, row.userId)).all();
  const user = userRows[0];
  if (!user || user.status === 'disabled') {
    // 账号禁用：拒绝刷新（1005）；刻意不返回 403 以避免暴露账号存在性
    throw new AppError(ErrCode.ACCOUNT_DISABLED, 401);
  }

  // 旋转：作废旧令牌，签发新令牌
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  const fresh = await issueRefreshToken(user.id);
  return { user, raw: fresh.raw, expiresAt: fresh.expiresAt };
};

/**
 * 作废某用户的所有刷新令牌（登出 / 重放处置）。仅置位 revoked_at，不物理删除，便于审计与溯源。
 * @param userId 用户 ID
 */
export const revokeUserTokens = async (userId: number): Promise<void> => {
  await getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
};
