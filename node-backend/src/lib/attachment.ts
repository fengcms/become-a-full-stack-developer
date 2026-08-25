/**
 * src/lib/attachment.ts
 * 附件响应序列化 + 列表查询。storageKey 为底层存储内部 key，属实现细节，不对外暴露。
 */
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '@/db/client';
import { type AttachmentRow, attachments } from '@/db/schema';
import { meta, parsePage } from '@/lib/pagination';
import type { Pagination } from '@/lib/response';

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
