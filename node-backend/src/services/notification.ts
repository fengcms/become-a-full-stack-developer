/**
 * src/services/notification.ts
 * 通知领域：列表（分页 + isRead 筛选）/ 未读数 / 全部已读 / 单条标记已读。
 * 可见性由路由鉴权保证（仅本人），本 service 只实现领域操作与序列化。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { type NotificationRow, notifications } from '@/db/schema';
import { ErrCode } from '@/shared/codes';
import { AppError } from '@/shared/errors';

/** 契约 Notification（isRead 由布尔列直接映射）。 */
export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** DB 行 → 契约 Notification。 */
export const toNotification = (n: NotificationRow): Notification => ({
  id: n.id,
  userId: n.userId,
  type: n.type,
  title: n.title,
  body: n.body ?? null,
  link: n.link ?? null,
  isRead: n.isRead,
  createdAt: n.createdAt.toISOString(),
});

/** 列表筛选参数（isRead 未传则不过滤）。 */
export interface ListNotificationsParams {
  pageSize: number;
  offset: number;
  isRead?: boolean;
}

/** GET /me/notifications — 我的通知（分页，支持 isRead 筛选，按创建时间倒序）。 */
export const listNotifications = async (
  userId: number,
  params: ListNotificationsParams,
): Promise<{ items: Notification[]; total: number }> => {
  const { pageSize, offset, isRead } = params;
  const filter = isRead === undefined ? undefined : eq(notifications.isRead, isRead);
  const where = and(eq(notifications.userId, userId), filter);
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await getDb().select({ c: sql<number>`count(*)` }).from(notifications).where(where).all()
  )[0];
  return { items: rows.map(toNotification), total: Number(totalRow?.c ?? 0) };
};

/** GET /me/notifications/unread-count — 未读通知数。 */
export const getUnreadCount = async (userId: number): Promise<number> => {
  const row = (
    await getDb()
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .all()
  )[0];
  return Number(row?.c ?? 0);
};

/** POST /me/notifications/read-all — 全部标记已读。 */
export const markAllRead = async (userId: number): Promise<void> => {
  await getDb()
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId))
    .run();
};

/** PATCH /me/notifications/:id — 标记单条已读（仅本人；非本人/不存在 → 404）。 */
export const markRead = async (
  userId: number,
  id: number,
  isRead: boolean,
): Promise<Notification> => {
  const db = getDb();
  const existing = (
    await db.select().from(notifications).where(eq(notifications.id, id)).limit(1).all()
  )[0];
  if (!existing || existing.userId !== userId) throw new AppError(ErrCode.NOT_FOUND, 404);
  const updated = (
    await db.update(notifications).set({ isRead }).where(eq(notifications.id, id)).returning().all()
  )[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return toNotification(updated);
};
