/**
 * src/middleware/cors.ts
 * CORS 装配（裁决 Q8）。dev 放开 * + credentials；prod 按 CORS_ORIGINS 白名单（逗号分隔），
 * 供 M2 / M3 / M7 跨域调用。
 */

import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from '../config/env';

/**
 * 构造 CORS 中间件。
 * @param env 运行环境（决定 origin 策略）
 */
export const corsMiddleware = (env: AppEnv): MiddlewareHandler =>
  cors({
    origin: env.NODE_ENV === 'production' && env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
