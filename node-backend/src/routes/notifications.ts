/**
 * src/routes/notifications.ts
 * 通知（B6 会员中心，对齐 02 §二 Notification）：GET 列表、GET unread-count、POST read-all、PATCH {id} 标记已读。
 * 仅本人可读 / 标记；PATCH 非本人或不存在 → 404（不泄露存在性）。
 * 生成端（系统事件写通知）不在本批，NOTES 登记后续归属。
 * 挂载于 /api/v1（路径 /me/notifications*）。
 * 薄路由：校验入参 → 调 service → paginate/ok 格式化。无 DB 查询、无业务规则。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import { getUnreadCount, listNotifications, markAllRead, markRead } from '@/services/notification';
import { meta, parsePage } from '@/shared/pagination';
import { ok, paginate } from '@/shared/response';

const notificationsRoute = new Hono<AuthVars>();

const markSchema = z.object({ isRead: z.boolean() });
type MarkInput = z.infer<typeof markSchema>;

/** GET /me/notifications — 我的通知（分页，支持 isRead 筛选，按创建时间倒序）。 */
notificationsRoute.get('/me/notifications', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
  const isReadParam = c.req.query('isRead');
  const isRead = isReadParam === 'true' ? true : isReadParam === 'false' ? false : undefined;
  const { items, total } = await listNotifications(userId, { pageSize, offset, isRead });
  return paginate(items, meta(page, pageSize, total));
});

/** GET /me/notifications/unread-count — 未读通知数。 */
notificationsRoute.get('/me/notifications/unread-count', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  return ok({ count: await getUnreadCount(userId) });
});

/** POST /me/notifications/read-all — 全部标记已读。 */
notificationsRoute.post('/me/notifications/read-all', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  await markAllRead(userId);
  return ok({});
});

/** PATCH /me/notifications/:id — 标记单条已读（仅本人；非本人/不存在 → 404）。 */
notificationsRoute.patch('/me/notifications/:id', authMiddleware, v.json(markSchema), async (c) => {
  const userId = Number(c.get('user').id);
  const id = Number(c.req.param('id'));
  const { isRead } = c.req.valid('json') as MarkInput;
  return ok(await markRead(userId, id, isRead));
});

export { notificationsRoute };
