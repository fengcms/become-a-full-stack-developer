import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { refreshTokens, users, wechatIdentities } from '@/db/schema';
import type { AuthResult } from '@/services/user';
import { resetPassword } from '@/services/user';

let db: ReturnType<typeof createLocalDb>;
let app: ReturnType<typeof createApp>;
const json = async (response: Response) =>
  (await response.json()) as { code: number; data: AuthResult };
const headers = { 'Content-Type': 'application/json' };
const post = (path: string, body: object, token?: string) =>
  app.request(`/api/v1${path}`, {
    method: 'POST',
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const wechat = async (code = 'same') => {
  const response = await post('/auth/wechat/callback', { code });
  expect(response.status).toBe(200);
  return (await json(response)).data;
};
beforeEach(async () => {
  db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
  app = createApp(
    readEnv({
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
      WECHAT_MINI_APP_ID: 'wx-test',
      WECHAT_MINI_APP_SECRET: 'secret-do-not-return',
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) =>
      Response.json({
        openid: `open-${url.searchParams.get('js_code')}`,
        session_key: 'never-return-this',
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('微信扩展点与首次凭据设置', () => {
  it('使用 Workers 支持的 manual 且拒绝重定向，不向跳转目标发送凭据', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://untrusted.example/redirect' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await post('/auth/wechat/callback', { code: 'private-code' })).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('线上诊断仅记录原因和上游数值码，不记录凭据或响应原文', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          errcode: 40013,
          errmsg: 'secret-do-not-return',
          session_key: 'never-return-this',
        }),
      ),
    );
    expect((await post('/auth/wechat/callback', { code: 'private-code' })).status).toBe(500);
    expect(warn).toHaveBeenCalledWith('[wechat.exchange]', {
      reason: 'upstream_rejected',
      code: 40013,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('secret-do-not-return');
      }),
    );
    expect((await post('/auth/wechat/callback', { code: 'private-code' })).status).toBe(500);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /secret-do-not-return|never-return-this|private-code|session_key/,
    );
  });

  it('首次自动建号，后续回到同一会员，不泄露微信身份和密钥', async () => {
    const a = await wechat(),
      b = await wechat();
    expect(a.user.id).toBe(b.user.id);
    expect(a.user.canSetCredentials).toBe(true);
    expect(a.user.role).toBe('member');
    expect(a.user.email).toBeUndefined();
    expect(JSON.stringify(a)).not.toMatch(/openid|session_key|never-return|secret-do-not-return/);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(wechatIdentities)).toHaveLength(1);
  });
  it('设置后跨端密码登录同一 userId，撤销旧 refresh，重复设置拒绝', async () => {
    const a = await wechat();
    const response = await post(
      '/me/setup-account',
      { username: 'cross-client', password: 'Password123' },
      a.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const b = (await json(response)).data;
    expect(b.user.id).toBe(a.user.id);
    expect(b.user.canSetCredentials).toBe(false);
    expect(b.user.nickname).toBe(a.user.nickname);
    const tokens = await db.select().from(refreshTokens);
    expect(tokens.filter((t) => t.revokedAt === null)).toHaveLength(1);
    const login = await post('/auth/login', { username: 'cross-client', password: 'Password123' });
    expect(login.status).toBe(200);
    expect((await json(login)).data.user.id).toBe(a.user.id);
    expect((await wechat()).user.id).toBe(a.user.id);
    expect(
      (
        await post(
          '/me/setup-account',
          { username: 'again', password: 'Password123' },
          b.accessToken,
        )
      ).status,
    ).toBe(409);
  });
  it('用户名冲突整体保留原状态和刷新令牌，随后可重试', async () => {
    await post('/auth/register', {
      username: 'occupied',
      email: 'test@example.com',
      password: 'Password123',
    });
    const a = await wechat();
    expect(
      (
        await post(
          '/me/setup-account',
          { username: 'occupied', password: 'Password123' },
          a.accessToken,
        )
      ).status,
    ).toBe(409);
    const u = (await db.select().from(users).where(eq(users.id, a.user.id)))[0];
    if (!u) throw new Error('missing user');
    expect(u.credentialsConfigured).toBe(false);
    expect(u.username).toBe(a.user.username);
    expect((await post('/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(200);
  });
  it('并发首次登录只建一人，设置只成功一次且失败方不撤销成功方令牌', async () => {
    const [a, b] = await Promise.all([wechat(), wechat()]);
    expect(a.user.id).toBe(b.user.id);
    expect(await db.select().from(users)).toHaveLength(1);
    const result = await Promise.all(
      ['first', 'second'].map((username) =>
        post('/me/setup-account', { username, password: 'Password123' }, a.accessToken),
      ),
    );
    expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.select().from(refreshTokens)).filter((t) => !t.revokedAt)).toHaveLength(1);
  });
  it('禁用会员不能微信登录或设置；未设置会员不能密码登录', async () => {
    const a = await wechat();
    expect(
      (await post('/auth/login', { username: a.user.username, password: 'Password123' })).status,
    ).toBe(401);
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, a.user.id));
    const r = await post('/auth/wechat/callback', { code: 'same' });
    expect((await json(r)).code).toBe(1005);
    const setup = await post(
      '/me/setup-account',
      { username: 'disabled', password: 'Password123' },
      a.accessToken,
    );
    expect((await json(setup)).code).toBe(1005);
  });
  it('管理员重置关闭首次设置，支持原用户名密码登录', async () => {
    const a = await wechat();
    await resetPassword(a.user.id, 'ResetPass123');
    expect((await wechat()).user.canSetCredentials).toBe(false);
    expect(
      (await post('/auth/login', { username: a.user.username, password: 'ResetPass123' })).status,
    ).toBe(200);
    expect(
      (
        await post(
          '/me/setup-account',
          { username: 'blocked', password: 'Password123' },
          a.accessToken,
        )
      ).status,
    ).toBe(409);
  });
  it('校验参数/令牌，微信 code 错误与上游异常不返回敏感原文', async () => {
    expect((await post('/auth/wechat/callback', {})).status).toBe(400);
    expect(
      (await post('/me/setup-account', { username: 'x', password: 'Password123' })).status,
    ).toBe(401);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ errcode: 40029, errmsg: 'sensitive' })),
    );
    const invalid = await post('/auth/wechat/callback', { code: 'invalid' });
    expect(invalid.status).toBe(401);
    expect((await json(invalid)).code).toBe(1002);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('secret-do-not-return');
      }),
    );
    const unavailable = await post('/auth/wechat/callback', { code: 'valid' });
    expect(unavailable.status).toBe(500);
    expect(await unavailable.text()).not.toContain('secret-do-not-return');
  });
  it('新迁移可重复执行，历史账号默认已设置且不改变原密码', async () => {
    await post('/auth/register', {
      username: 'old',
      email: 'old@example.com',
      password: 'Password123',
    });
    const old = (await db.select().from(users))[0];
    await migrate(db);
    const after = (await db.select().from(users))[0];
    if (!old || !after) throw new Error('missing user');
    expect(after.credentialsConfigured).toBe(true);
    expect(after.passwordHash).toBe(old.passwordHash);
    expect((await post('/auth/login', { username: 'old', password: 'Password123' })).status).toBe(
      200,
    );
    expect(await db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
});
