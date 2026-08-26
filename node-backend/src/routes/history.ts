/**
 * src/routes/history.ts
 * 阅读历史（B6 会员中心，对齐 02 §二 ReadingLog）：GET/POST /me/history、DELETE /me/history、DELETE /me/history/{articleId}。
 * 薄路由：鉴权 + 校验入参 → 调 services/history → ok/paginate 格式化。删除端点幂等，仅本人数据。
 * 挂载于 /api/v1（路径 /me/history*）。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthVars, authMiddleware } from '@/middleware/auth';
import { v } from '@/middleware/validate';
import {
  clearMyHistory,
  deleteMyHistoryItem,
  listMyHistory,
  reportReadingProgress,
} from '@/services/history';
import { meta, parsePage } from '@/shared/pagination';
import { ok, paginate } from '@/shared/response';

const historyRoute = new Hono<AuthVars>();

const historySchema = z.object({
  articleId: z.number().int().positive(),
  progress: z.number().int().min(0).max(100).nullable().optional(),
});
type HistoryInput = z.infer<typeof historySchema>;

/** GET /me/history — 我的阅读历史（分页，HistoryPage，按 lastReadAt 倒序）。 */
historyRoute.get('/me/history', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const { page, pageSize, offset } = parsePage(c);
  const { list, total } = await listMyHistory(userId, pageSize, offset);
  return paginate(list, meta(page, pageSize, total));
});

/** POST /me/history — 上报阅读进度（upsert 唯写路径；未发布/不存在 → 404）。 */
historyRoute.post('/me/history', authMiddleware, v.json(historySchema), async (c) => {
  const userId = Number(c.get('user').id);
  const { articleId, progress } = c.req.valid('json') as HistoryInput;
  return ok(await reportReadingProgress(userId, articleId, progress));
});

/** DELETE /me/history — 清空我的全部阅读历史（幂等）。 */
historyRoute.delete('/me/history', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  await clearMyHistory(userId);
  return ok({});
});

/** DELETE /me/history/:articleId — 删除单条阅读历史（幂等；仅本人）。 */
historyRoute.delete('/me/history/:articleId', authMiddleware, async (c) => {
  const userId = Number(c.get('user').id);
  const articleId = Number(c.req.param('articleId'));
  await deleteMyHistoryItem(userId, articleId);
  return ok({});
});

export { historyRoute };
