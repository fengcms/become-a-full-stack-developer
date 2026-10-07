import type { Context } from 'hono';
import { REFRESH_TTL_MS } from '@/services/refresh';

// ---- Cookie 辅助（浏览器端 refreshToken 载体，HTTP 层职责）----
const COOKIE = 'refreshToken';
const COOKIE_ATTRS = 'HttpOnly; SameSite=None; Secure; Path=/';
export const setRefreshCookie = (c: Context, token: string, maxAgeSec: number): void => {
  c.header('Set-Cookie', `${COOKIE}=${token}; ${COOKIE_ATTRS}; Max-Age=${maxAgeSec}`);
};
export const clearRefreshCookie = (c: Context): void => {
  c.header('Set-Cookie', `${COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`);
};
export const refreshMaxAge = (): number => Math.floor(REFRESH_TTL_MS / 1000);
