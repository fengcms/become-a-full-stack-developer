/**
 * test/routes/auth-flow.test.ts
 * B1 鉴权验收（二）：刷新（有状态旋转）/ 当前用户 / 登出 / 第三方占位。
 * 重点验证「专用 401 码」保真（1003 / 1004）与刷新旋转 + 家族作废闭环。
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
interface MeResp {
  code: number;
  data: { username: string; nickname: string; email?: string; passwordHash?: string };
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

describe('B1 刷新（有状态旋转）', () => {
  it('成功刷新返回新 access/refresh', async () => {
    await register({ username: 'ref1', email: 'ref1@example.com', password: 'password123' });
    const { refreshToken } = (await json<AuthResp>(await login('ref1', 'password123'))).data;
    const res = await app.request(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
    expect(typeof (await json<AuthResp>(res)).data.accessToken).toBe('string');
  });

  it('缺少刷新令牌 → 401 code 1004（专用码保真）', async () => {
    const res = await app.request(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1004);
  });

  it('旧令牌重放（旋转后）→ 401 code 1003 + 家族作废', async () => {
    await register({ username: 'ref2', email: 'ref2@example.com', password: 'password123' });
    const { refreshToken } = (await json<AuthResp>(await login('ref2', 'password123'))).data;
    // 第一次刷新（旋转）成功
    const r1 = await app.request(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(r1.status).toBe(200);
    // 第二次用同一旧令牌 → 已作废 → 重放 → 1003
    const r2 = await app.request(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(r2.status).toBe(401);
    expect((await json<ErrResp>(r2)).code).toBe(1003);
  });
});

describe('B1 当前用户 / 登出', () => {
  it('未登录访问 me → 401 code 1004', async () => {
    const res = await app.request(`${BASE}/me`);
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1004);
  });

  it('登录后 me 返回正确用户且不泄露密码', async () => {
    const reg = await register({
      username: 'me1',
      email: 'me1@example.com',
      password: 'password123',
      nickname: 'MeOne',
    });
    const { accessToken } = (await json<AuthResp>(reg)).data;
    const res = await app.request(`${BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await json<MeResp>(res);
    expect(body.data.username).toBe('me1');
    expect(body.data.nickname).toBe('MeOne');
    expect(body.data.email).toBe('me1@example.com');
    expect(body.data.passwordHash).toBeUndefined();
  });

  it('登出后刷新令牌家族失效 → 1003', async () => {
    const reg = await register({
      username: 'out1',
      email: 'out1@example.com',
      password: 'password123',
    });
    const { accessToken, refreshToken } = (await json<AuthResp>(reg)).data;
    const logout = await app.request(`${BASE}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(logout.status).toBe(200);
    const refresh = await app.request(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(refresh.status).toBe(401);
    expect((await json<ErrResp>(refresh)).code).toBe(1003);
  });
});

describe('B1 第三方登录占位', () => {
  it('合法 provider → 501 占位（500 + code 5000）', async () => {
    const res = await app.request(`${BASE}/wechat/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x' }),
    });
    expect(res.status).toBe(500);
    expect((await json<ErrResp>(res)).code).toBe(5000);
  });

  it('非法 provider → 400 code 4001', async () => {
    const res = await app.request(`${BASE}/unknown/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x' }),
    });
    expect(res.status).toBe(400);
    expect((await json<ErrResp>(res)).code).toBe(4001);
  });
});
