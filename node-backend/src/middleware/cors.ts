/**
 * src/middleware/cors.ts
 * CORS 装配（裁决 Q8）。遵循 CORS 规范：Access-Control-Allow-Origin: * 与
 * Access-Control-Allow-Credentials: true 不能同时出现，否则浏览器直接拦截凭据请求。
 *
 * 策略（审阅 B05）：
 * - 开发环境：origin = '*'，credentials = false（无凭据，规范允许 *）。
 * - 生产 / 测试：按 CORS_ORIGINS 白名单（逗号分隔）；若留空或为 '*'，视为未配置，
 *   不返回任何 CORS 头（拒绝跨域），避免 "Allow-Origin: * + credentials" 安全反模式。
 */
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from '@/config/env';

/**
 * 构造 CORS 中间件。
 * @param env 运行环境（决定 origin / credentials 策略）
 */
export const corsMiddleware = (env: AppEnv): MiddlewareHandler => {
  const allowAll = env.NODE_ENV === 'development' || env.CORS_ORIGINS === '*';
  const origin: string | string[] = allowAll
    ? '*'
    : (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const credentials = !allowAll && Array.isArray(origin) && origin.length > 0;

  return cors({
    origin,
    credentials,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
};
