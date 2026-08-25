/**
 * src/lib/jwt.ts
 * 访问令牌签发 / 校验，基于 Hono 内置的 HS256 JWT（无额外依赖）。
 * 刷新令牌见 B1（有状态 refresh_tokens 表，支持旋转 / 作废）。
 */
import { sign, verify } from 'hono/jwt';
import { ErrCode } from './codes';
import { AppError } from './http-error';

/** 访问令牌载荷。sub = 用户 ID，role = 角色。 */
export interface AccessToken {
  sub: string;
  role: string;
}

/**
 * 签发访问令牌。
 * @param payload 用户身份
 * @param secret 签名密钥（来自环境）
 * @param expSeconds 有效期秒数，默认 1 小时
 */
export const signAccessToken = (
  payload: AccessToken,
  secret: string,
  expSeconds = 3600,
): Promise<string> => sign({ ...payload, exp: Math.floor(Date.now() / 1000) + expSeconds }, secret);

/**
 * 校验访问令牌。失效 / 篡改 / 缺字段一律抛 1002（令牌无效或已过期）。
 * @param token 待校验令牌
 * @param secret 签名密钥
 */
export const verifyAccessToken = async (token: string, secret: string): Promise<AccessToken> => {
  try {
    const decoded = (await verify(token, secret, 'HS256')) as unknown as AccessToken;
    if (!decoded.sub || !decoded.role) throw new Error('malformed token');
    return { sub: decoded.sub, role: decoded.role };
  } catch {
    throw new AppError(ErrCode.TOKEN_INVALID, 401, '令牌无效或已过期');
  }
};
