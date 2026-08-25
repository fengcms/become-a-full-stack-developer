/**
 * test/routes/users.test.ts
 * B5 验收：用户 / 资料 / 上传批次 11 端点。
 * 覆盖：admin 提升 member→editor、普通用户改自己资料、未授权改他人 403、
 * change-password 旧密码错失败、upload 返回 URL 且可再查到、删他人附件 403、
 * 公开会员主页脱敏 / disabled 404、admin 重置密码后可用新密码登录。
 */
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, getDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { users } from '@/db/schema';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

beforeEach(async () => {
  const db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
});

const BASE = '/api/v1';
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface AuthResp {
  code: number;
  data: {
    accessToken: string;
    user: { id: number; username: string; nickname: string; email?: string; role: string };
  };
}
interface ErrResp {
  code: number;
  data: null | { errors?: { field: string; message: string }[] };
}
interface UserResp {
  code: number;
  data: {
    id: number;
    username: string;
    nickname: string;
    avatar?: string | null;
    role: string;
    status: string;
    email?: string;
  };
}

const register = (username: string) =>
  app.request(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'password123',
      nickname: username,
    }),
  });
const login = async (username: string): Promise<AuthResp> =>
  json<AuthResp>(
    await app.request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password123' }),
    }),
  );

/** 注册 + 可选提权 + 登录，返回 {id, token}。提权须在登录前（JWT 角色是登录快照）。 */
const createUser = async (
  username: string,
  role?: 'admin' | 'editor' | 'member',
): Promise<{ id: number; token: string }> => {
  await register(username);
  if (role) await getDb().update(users).set({ role }).where(eq(users.username, username)).run();
  const r = await login(username);
  return { id: r.data.user.id, token: r.data.accessToken };
};

describe('B5 用户管理（admin）', () => {
  it('admin 提升 member → editor', async () => {
    const admin = await createUser('b5admin', 'admin');
    const { id: tomId } = await createUser('b5tom');
    const res = await app.request(`${BASE}/users/${tomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(res.status).toBe(200);
    expect((await json<UserResp>(res)).data.role).toBe('editor');
  });

  it('member 改他人资料 → 403', async () => {
    const a = await createUser('b5a');
    const b = await createUser('b5b');
    const res = await app.request(`${BASE}/users/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ level: 9 }),
    });
    expect(res.status).toBe(403);
    expect((await json<ErrResp>(res)).code).toBe(2001);
  });

  it('member 访问用户列表 → 403', async () => {
    const m = await createUser('b5m');
    const res = await app.request(`${BASE}/users`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${m.token}` },
    });
    expect(res.status).toBe(403);
  });

  it('admin 列出用户含分页', async () => {
    const admin = await createUser('b5admin2', 'admin');
    await createUser('b5list1');
    const res = await app.request(`${BASE}/users?page=1&pageSize=10`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(res.status).toBe(200);
    const body = await json<{
      code: number;
      data: { list: unknown[]; pagination: { total: number } };
    }>(res);
    expect(body.code).toBe(0);
    expect(body.data.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('admin 重置密码后可用新密码登录', async () => {
    const admin = await createUser('b5admin3', 'admin');
    const { id: uid } = await createUser('b5victim');
    const res = await app.request(`${BASE}/admin/users/${uid}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ newPassword: 'newpassword99' }),
    });
    expect(res.status).toBe(200);
    // 旧密码失败
    const oldLogin = await app.request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'b5victim', password: 'password123' }),
    });
    expect(oldLogin.status).toBe(401);
    // 新密码成功
    const newLogin = await app.request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'b5victim', password: 'newpassword99' }),
    });
    expect(newLogin.status).toBe(200);
  });
});

describe('B5 个人资料与密码', () => {
  it('未登录取资料 → 401', async () => {
    const res = await app.request(`${BASE}/me/profile`, { method: 'GET' });
    expect(res.status).toBe(401);
    expect((await json<ErrResp>(res)).code).toBe(1004);
  });

  it('普通用户改自己资料', async () => {
    const u = await createUser('b5self');
    const res = await app.request(`${BASE}/me/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ nickname: '新昵称', avatar: 'https://example.com/a.png' }),
    });
    expect(res.status).toBe(200);
    const body = await json<UserResp>(res);
    expect(body.data.nickname).toBe('新昵称');
    expect(body.data.avatar).toBe('https://example.com/a.png');
  });

  it('change-password 旧密码错误 → 400 code 4001', async () => {
    const u = await createUser('b5pw');
    const res = await app.request(`${BASE}/me/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ oldPassword: 'wrongpass1', newPassword: 'anotherpass1' }),
    });
    expect(res.status).toBe(400);
    const body = await json<ErrResp>(res);
    expect(body.code).toBe(4001);
    expect(body.data?.errors?.[0]?.field).toBe('oldPassword');
  });

  it('change-password 正确后可用新密码登录', async () => {
    const u = await createUser('b5pw2');
    const res = await app.request(`${BASE}/me/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ oldPassword: 'password123', newPassword: 'brandnewpass1' }),
    });
    expect(res.status).toBe(200);
    const newLogin = await app.request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'b5pw2', password: 'brandnewpass1' }),
    });
    expect(newLogin.status).toBe(200);
  });
});

describe('B5 上传与附件', () => {
  const buildForm = (): FormData => {
    const fd = new FormData();
    fd.append('file', new File([Buffer.from('hello-world')], 'test.png', { type: 'image/png' }));
    return fd;
  };

  it('upload 返回 URL 且可再查到', async () => {
    const u = await createUser('b5up');
    const res = await app.request(`${BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}` },
      body: buildForm(),
    });
    expect(res.status).toBe(200);
    const body = await json<{ code: number; data: { id: number; url: string; storage: string } }>(
      res,
    );
    expect(body.code).toBe(0);
    expect(body.data.url).toContain('/files');
    expect(body.data.storage).toBe('local');

    const list = await app.request(`${BASE}/me/attachments`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${u.token}` },
    });
    const listBody = await json<{
      data: { list: { id: number }[]; pagination: { total: number } };
    }>(list);
    expect(listBody.data.list.some((a) => a.id === body.data.id)).toBe(true);
  });

  it('上传类型不合法 → 400 code 4001', async () => {
    const u = await createUser('b5uptype');
    const fd = new FormData();
    fd.append('file', new File([Buffer.from('x')], 'a.txt', { type: 'text/plain' }));
    const res = await app.request(`${BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}` },
      body: fd,
    });
    expect(res.status).toBe(400);
    expect((await json<ErrResp>(res)).code).toBe(4001);
  });

  it('删他人附件 → 403；删自己 → 200', async () => {
    const a = await createUser('b5owner');
    const b = await createUser('b5other');
    const up = await app.request(`${BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}` },
      body: buildForm(),
    });
    const { data } = await json<{ data: { id: number } }>(up);

    const forbidden = await app.request(`${BASE}/attachments/${data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(forbidden.status).toBe(403);
    expect((await json<ErrResp>(forbidden)).code).toBe(2001);

    const ownDelete = await app.request(`${BASE}/attachments/${data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.token}` },
    });
    expect(ownDelete.status).toBe(200);
  });
});

describe('B5 公开会员主页', () => {
  it('GET /members/{id} 脱敏（无 email）', async () => {
    const { id } = await createUser('b5member');
    const res = await app.request(`${BASE}/members/${id}`, { method: 'GET' });
    expect(res.status).toBe(200);
    const body = await json<{
      data: { id: number; nickname: string; level: number; articleCount: number };
    }>(res);
    expect(body.data.id).toBe(id);
    expect(body.data.nickname).toBe('b5member');
    // 公开端点不返回 email 等敏感字段
    expect('email' in body.data).toBe(false);
  });

  it('disabled 会员主页 → 404', async () => {
    const { id } = await createUser('b5disabled');
    const admin = await createUser('b5admin4', 'admin');
    await app.request(`${BASE}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ status: 'disabled' }),
    });
    const res = await app.request(`${BASE}/members/${id}`, { method: 'GET' });
    expect(res.status).toBe(404);
    expect((await json<ErrResp>(res)).code).toBe(3001);
  });
});
