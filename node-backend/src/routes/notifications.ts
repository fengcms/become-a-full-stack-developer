/**
 * src/routes/notifications.ts
 * 通知（B6 会员中心，对齐 02 §二 Notification）：GET 列表、GET unread-count、POST read-all、PATCH {id} 标记已读。
 * 仅本人可读 / 标记；PATCH 非本人或不存在 → 404（不泄露存在性）。
 * 生成端（系统事件写通知）不在本批，NOTES 登记后续归属。
 * 挂载于 /api/v1（路径 /me/notifications*）。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { type NotificationRow, notifications } from '@/db/schema';
import { ErrCode } from '@/lib/codes';
import { AppError } from '@/lib/http-error';
import { meta, parsePage } from '@/lib/pagination';
import { ok, paginate } from '@/lib/response';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';

const notificationsRoute = new Hono<AuthVars>();

/** DB 行 → 契约 Notification（isRead 由布尔列直接映射）。 */
const toNotification = (n: NotificationRow) => ({
  id: n.id,
  userId: n.userId,
  type: n.type,
  title: n.title,
  body: n.body ?? null,
  link: n.link ?? null,
  isRead: n.isRead,
  createdAt: n.createdAt.toISOString(),
});

/** GET /me/notifications — 我的通知（分页，支持 isRead 筛选，按创建时间倒序）。 */
notificationsRoute.get('/me/notifications', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
  const db = getDb();
  const isRead = c.req.query('isRead');
  const filter =
    isRead === 'true'
      ? eq(notifications.isRead, true)
      : isRead === 'false'
        ? eq(notifications.isRead, false)
        : undefined;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), filter))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();
  const totalRow = (
    await db
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), filter))
      .all()
  )[0];
  return paginate(rows.map(toNotification), meta(page, pageSize, Number(totalRow?.c ?? 0)));
});

/** GET /me/notifications/unread-count — 未读通知数。 */
notificationsRoute.get('/me/notifications/unread-count', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const row = (
    await getDb()
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .all()
  )[0];
  return ok({ count: Number(row?.c ?? 0) });
});

/** POST /me/notifications/read-all — 全部标记已读。 */
notificationsRoute.post('/me/notifications/read-all', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  await getDb()
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId))
    .run();
  return ok({});
});

const markSchema = z.object({ isRead: z.boolean() });
type MarkInput = z.infer<typeof markSchema>;

/** PATCH /me/notifications/:id — 标记单条已读（仅本人；非本人/不存在 → 404）。 */
notificationsRoute.patch('/me/notifications/:id', authMiddleware, v.json(markSchema), async (c) => {
  const userId = Number(c.get('user').id);
  const id = Number(c.req.param('id'));
  const { isRead } = c.req.valid('json') as MarkInput;
  const db = getDb();
  const existing = (
    await db.select().from(notifications).where(eq(notifications.id, id)).limit(1).all()
  )[0];
  if (!existing || existing.userId !== userId) throw new AppError(ErrCode.NOT_FOUND, 404);
  const updated = (
    await db.update(notifications).set({ isRead }).where(eq(notifications.id, id)).returning().all()
  )[0];
  if (!updated) throw new AppError(ErrCode.INTERNAL, 500);
  return ok(toNotification(updated));
});

export { notificationsRoute };
