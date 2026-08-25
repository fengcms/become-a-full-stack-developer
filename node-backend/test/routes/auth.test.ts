/**
 * test/routes/auth.test.ts
 * B1 鉴权验收（一）：注册 / 登录。重点验证「专用 401 码」保真（1001 / 1005 未被统一化）。
 */
import { describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';

process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));
const BASE = '/api/v1/auth';

/** 通用 JSON 解析（强类型断言，避免 any）。 */
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface AuthResp {
  code: number;
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: number; username: string; nickname: string; email?: string };
  };
}
interface ErrResp {
  code: number;
  data: null | { errors?: unknown };
}

/** 注册并解析响应体。 */
const register = async (payload: Record<string, unknown>): Promise<Response> =>
  app.request(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

/** 登录并解析响应体。 */
const login = async (username: string, password: string): Promise<Response> =>
  app.request(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

describe('B1 注册', () => {
  it('成功注册返回 200 + JWT + 用户', async () => {
    const res = await register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
      nickname: 'Alice',
    });
    expect(res.status).toBe(200);
    const body = await json<AuthResp>(res);
    expect(body.code).toBe(0);
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.user.username).toBe('alice');
    expect(body.data.user.nickname).toBe('Alice');
    expect(body.data.user.email).toBe('alice@example.com');
    expect(body.data.refreshToken).toBeTruthy();
  });

  it('重复用户名 → 409 code 3002', async () => {
    await register({ username: 'bob', email: 'bob1@example.com', password: 'password123' });
    const res = await register({
      username: 'bob',
      email: 'bob2@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(409);
    expect((await json<ErrResp>(res)).code).toBe(3002);
  });

  it('邮箱冲突 → 409 code 3002', async () => {
    await register({ username: 'carol', email: 'same@example.com', password: 'password123' });
    const res = await register({
      username: 'carol2',
      email: 'same@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(409);
    expect((await json<ErrResp>(res)).code).toBe(3002);
  });

  it('弱密码（<8）→ 400 code 4001 + 字段错误', async () => {
    const res = await register({ username: 'dave', email: 'dave@example.com', password: 'short' });
    expect(res.status).toBe(400);
    const body = await json<ErrResp>(res);
    expect(body.code).toBe(4001);
    expect(Array.isArray(body.data?.errors)).toBe(true);
  });
});

describe('B1 登录', () => {
  it('成功登录返回 200 + JWT', async () => {
    await register({ username: 'login1', email: 'login1@example.com', password: 'password123' });
    const res = await login('login1', 'password123');
    expect(res.status).toBe(200);
    expect(typeof (await json<AuthResp>(res)).data.accessToken).toBe('string');
  });

  it('密码错误 → 401 code 1001（专用码保真）', async () => {
    await register({ username: 'login2', email: 'login2@example.com', password: 'password123' });
    const res = await login('login2', 'wrongpass');
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1001);
  });

  it('账号不存在 → 401 code 1001（不暴露账号存在性）', async () => {
    const res = await login('nope', 'password123');
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1001);
  });

  it('禁用账号 → 401 code 1005（刻意非 403）', async () => {
    await register({
      username: 'disabled1',
      email: 'disabled1@example.com',
      password: 'password123',
    });
    // 直接置禁用（绕过 B5 的 admin 提升，仅测试用）
    const { getDb } = await import('@/db/client');
    const { users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    await getDb().update(users).set({ status: 'disabled' }).where(eq(users.username, 'disabled1'));
    const res = await login('disabled1', 'password123');
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1005);
  });
});
