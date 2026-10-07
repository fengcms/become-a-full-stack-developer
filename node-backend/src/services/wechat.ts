import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '@/config/env';
import { atomic } from '@/db/atomic';
import { getDb } from '@/db/client';
import { users, wechatIdentities } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';
import { hashPassword } from '@/shared/password';

/** 只向固定微信地址交换 code；密钥与响应敏感字段不进入错误或日志。 */
async function exchange(code: string, env: AppEnv): Promise<{ appId: string; openId: string }> {
  const appId = env.WECHAT_MINI_APP_ID,
    secret = env.WECHAT_MINI_APP_SECRET;
  if (!appId || !secret) throw new AppError(ErrCode.INTERNAL, 500, '微信登录尚未配置');
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.search = new URLSearchParams({
    appid: appId,
    secret,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString();
  let body: { errcode?: number; openid?: string };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) throw new Error('upstream');
    body = (await response.json()) as typeof body;
    if (!body || typeof body !== 'object') throw new Error('upstream');
  } catch {
    throw new AppError(ErrCode.INTERNAL, 500, '微信服务暂不可用');
  }
  if ([40029, 40163, 40226].includes(body.errcode ?? 0)) {
    throw new AppError(ErrCode.TOKEN_INVALID, 401, '微信凭证无效，请重新登录');
  }
  if (body.errcode === 45011) throw new AppError(ErrCode.RATE_LIMITED, 429);
  if (body.errcode || typeof body.openid !== 'string' || !body.openid) {
    throw new AppError(ErrCode.INTERNAL, 500, '微信服务暂不可用');
  }
  return { appId, openId: body.openid };
}

/** 首次建号与身份映射在同一事务；唯一冲突时只接纳已提交的同一微信身份。 */
export async function authenticateWechat(code: string, env: AppEnv) {
  const db = getDb();
  const { appId, openId } = await exchange(code, env);
  const find = async () =>
    (
      await db
        .select({ user: users })
        .from(wechatIdentities)
        .innerJoin(users, eq(users.id, wechatIdentities.userId))
        .where(and(eq(wechatIdentities.appId, appId), eq(wechatIdentities.openId, openId)))
        .all()
    )[0]?.user;
  let user = await find();
  if (!user) {
    const username = `wx_${crypto.randomUUID().replaceAll('-', '').slice(0, 28)}`;
    const hash = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
    const now = Date.now();
    try {
      await atomic(db, [
        {
          sql: `INSERT INTO users (username,password_hash,credentials_configured,role,email,display_name,level,status,created_at,updated_at)
          VALUES (?, ?, 0, 'member', NULL, '微信会员', 1, 'active', ?, ?)`,
          params: [username, hash, now, now],
        },
        {
          sql: `INSERT INTO wechat_identities(app_id,open_id,user_id,created_at)
          SELECT ?, ?, id, ? FROM users WHERE username = ?`,
          params: [appId, openId, now, username],
        },
      ]);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
    user = await find();
    if (!user) throw new AppError(ErrCode.INTERNAL, 500, '微信账号创建失败，请重试');
  }
  if (user.status === 'disabled') throw new AppError(ErrCode.ACCOUNT_DISABLED, 401);
  return user;
}
