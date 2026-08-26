/**
 * src/services/attachment.ts
 * 附件领域：响应序列化、列表查询、上传（双存储 + 落库）、归属解析、删除（行删 + 尽力删底层对象）。
 * storageKey 为底层存储内部 key，属实现细节，不对外暴露。
 */
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getActiveEnv } from '@/config/env';
import { getDb } from '@/db/client';
import { type AttachmentRow, attachments } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';
import { meta, parsePage } from '@/shared/pagination';
import { createStorage } from '@/shared/storage';
import type { Pagination } from '@/types/common';

/** 契约 Attachment 响应。 */
export interface Attachment {
  id: number;
  userId: number;
  articleId: number | null;
  url: string;
  storage: 'r2' | 'local';
  mimeType: string;
  size: number;
  createdAt: string;
}

/** attachments 行 → 契约 Attachment。 */
export const toAttachment = (a: AttachmentRow): Attachment => ({
  id: a.id,
  userId: a.userId,
  articleId: a.articleId ?? null,
  url: a.url,
  storage: a.storage as 'r2' | 'local',
  mimeType: a.mimeType,
  size: a.size,
  createdAt: a.createdAt.toISOString(),
});

/** 我的附件列表（分页，按创建时间倒序）。 */
export const queryMyAttachments = async (
  c: Context,
  userId: number,
): Promise<{ list: Attachment[]; pagination: Pagination }> => {
  const { page, pageSize, offset } = parsePage(c);
  const rows = await getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.userId, userId))
    .orderBy(desc(attachments.createdAt), desc(attachments.id))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(attachments)
      .where(eq(attachments.userId, userId))
      .all()
  )[0];
  return {
    list: rows.map(toAttachment),
    pagination: meta(page, pageSize, Number(totalRow?.count ?? 0)),
  };
};

/** 上传入参（buffer/ext/mime 已由路由 parseUpload 在信任边界校验后给出）。 */
export interface CreateAttachmentInput {
  userId: number;
  articleId: number | null;
  buffer: Buffer;
  ext: string;
  mime: string;
}

/** POST /upload — 双存储（R2 主 / 本地兜底）后落库，返回序列化附件。 */
export const createAttachment = async (input: CreateAttachmentInput): Promise<Attachment> => {
  const env = getActiveEnv();
  const storage = createStorage(env);
  const { key, url } = await storage.put(input.buffer, input.ext);

  const db = getDb();
  const inserted = (await db
    .insert(attachments)
    .values({
      userId: input.userId,
      articleId: input.articleId,
      storageKey: key,
      url,
      storage: env.STORAGE_DRIVER,
      mimeType: input.mime,
      size: input.buffer.byteLength,
      createdAt: new Date(),
    })
    .returning()
    .all()) as AttachmentRow[];
  const row = inserted[0];
  if (!row) throw new AppError(ErrCode.INTERNAL, 500);
  return toAttachment(row);
};

/** 解析附件归属用户 ID；不存在返回 null（由路由守卫转为 404）。 */
export const getAttachmentOwnerId = async (id: number): Promise<string | null> => {
  const row = (
    await getDb()
      .select({ userId: attachments.userId })
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1)
      .all()
  )[0];
  if (!row) return null;
  return String(row.userId);
};

/** DELETE /attachments/:id — 同步事务内删行 + 数同 storageKey 兄弟行；仅 0 引用才真删物理文件（去重后防孤儿文件）。 */
export const deleteAttachment = async (id: number): Promise<void> => {
  // better-sqlite3 事务回调须同步（不能 async）：DB 的「删行 + 数兄弟」原子化，消除并发交错窗口。
  // 异步的文件删除放到事务外做 best-effort（失败不阻塞行删除，与双存储边界一致）。
  const result = getDb().transaction((tx): { storageKey: string; remaining: number } => {
    const row = (
      tx
        .select({ storageKey: attachments.storageKey })
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1)
        .all() as { storageKey: string }[]
    )[0];
    if (!row) throw new AppError(ErrCode.NOT_FOUND, 404); // 缺失 → 404（守冻结契约，不静默 resolve）
    const res = tx.delete(attachments).where(eq(attachments.id, id)).run();
    if (res.changes === 0) throw new AppError(ErrCode.NOT_FOUND, 404);
    const remaining =
      (
        tx
          .select({ c: sql<number>`count(*)` })
          .from(attachments)
          .where(eq(attachments.storageKey, row.storageKey))
          .all() as { c: number }[]
      )[0]?.c ?? 0;
    return { storageKey: row.storageKey, remaining };
  });

  if (result.remaining !== 0) return; // 仍有引用 → 不删物理文件
  // 仅无人引用才真删物理文件（双存储适配层：失败不阻塞行删除）。
  // 注：文件删除置于事务外（better-sqlite3 事务回调须同步，异步删文件会抛
  // "Transaction function cannot return a promise"），故存在极窄孤儿竞态窗口：
  // 并发上传相同字节恰逢删除间隙 → 新行孤儿（后果轻微，重传即恢复）。若未来引入
  // ref_count 列（需迁移，owner 当前否决）可在事务内计数并裁决删除，从根消除窗口。
  try {
    await createStorage(getActiveEnv()).delete(result.storageKey);
  } catch {
    // 底层删除失败不阻塞行删除（双存储适配层真实边界）
  }
};
