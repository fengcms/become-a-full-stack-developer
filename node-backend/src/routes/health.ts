/**
 * src/routes/health.ts
 * 健康检查路由。B0 唯一业务端点，用于验证中间件装配与信封一致性。
 * GET /api/v1/health → { code:0, data:{ status:'ok' }, ... }
 */
import { Hono } from 'hono';
import { ok } from '@/shared/response';

export const healthRoute = new Hono();

healthRoute.get('/', () => ok({ status: 'ok' }));
