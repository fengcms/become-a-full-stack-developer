import { eq } from 'drizzle-orm';
import { atomic } from '@/db/atomic';
import { getDb } from '@/db/client';
import { users } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { isUniqueConstraintError } from '@/shared/db-error';
import { AppError } from '@/shared/errors';
import { hashPassword } from '@/shared/password';

/** 条件更新保证仅成功一次；changes() 使失败竞争者不会撤销成功者的新会话。 */
export async function setupAccount(userId: number, username: string, password: string) {
  const db = getDb();
  const current = (await db.select().from(users).where(eq(users.id, userId)).all())[0];
  if (!current) throw new AppError(ErrCode.TOKEN_INVALID, 401);
  if (current.status === 'disabled') throw new AppError(ErrCode.ACCOUNT_DISABLED, 401);
  if (current.credentialsConfigured)
    throw new AppError(ErrCode.CONFLICT, 409, '账号已设置登录凭据');
  const hash = await hashPassword(password),
    now = Date.now();
  try {
    const changed = await atomic(db, [
      {
        sql: `UPDATE users SET username=?, password_hash=?, credentials_configured=1, updated_at=?
        WHERE id=? AND status='active' AND credentials_configured=0
        AND EXISTS (SELECT 1 FROM wechat_identities WHERE user_id=users.id)`,
        params: [username, hash, now, userId],
      },
      {
        sql: 'UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND changes()=1',
        params: [now, userId],
      },
    ]);
    if (changed[0] !== 1) throw new AppError(ErrCode.CONFLICT, 409, '账号状态已变化，请重新登录');
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError(ErrCode.CONFLICT, 409, '用户名已被使用');
    throw error;
  }
  const updated = (await db.select().from(users).where(eq(users.id, userId)).all())[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return updated;
}
