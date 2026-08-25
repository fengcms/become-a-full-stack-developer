/**
 * test/routes/articles-admin.test.ts
 * B2 文章核心验收（二）：我的文章、后台列表、审核通过（approve）、任意置位（status）、
 * 角色权限（403）、N9-2 状态转移矩阵（合法 + 非法）、关键词过滤。
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

// 每个用例使用全新内存库，避免用例间数据互相污染（setup.ts 仅提供初始实例）。
beforeEach(async () => {
  const db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
});

const BASE = '/api/v1/articles';
const ADMIN = '/api/v1/admin/articles';
const ME = '/api/v1/me/articles';

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
interface TokenResp {
  data: { accessToken: string; user: { id: number } };
}
interface ArticleResp {
  data: { id: number; status: string };
}
interface ListResp {
  data: { list: { id: number }[]; pagination: { total: number } };
}
interface ErrResp {
  code: number;
}

const register = (username: string) =>
  app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'password123' }),
  });
const login = (username: string) =>
  app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
// 注册后再登录（守卫读取的是登录时 JWT 内的角色声明，故提权必须在登录之前完成）。
const tokenOf = async (username: string): Promise<string> => {
  await register(username); // 幂等：用户已存在则注册返回 409，忽略即可
  return (await json<TokenResp>(await login(username))).data.accessToken;
};
const elevate = (username: string, role: 'admin' | 'editor') =>
  getDb().update(users).set({ role }).where(eq(users.username, username)).run();
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 造一篇 pending 文章（member 创建 draft → submit），返回 id。 */
const makePending = async (memberToken: string): Promise<number> => {
  const id = (
    await json<ArticleResp>(await createArticle(memberToken, { title: 'P', content: 'x' }))
  ).data.id;
  await app.request(`${BASE}/${id}/submit`, { method: 'POST', headers: auth(memberToken) });
  return id;
};

describe('B2 我的文章 / 后台列表', () => {
  it('me/articles 返回本人全部状态（含 draft）', async () => {
    const t = await tokenOf('me_a');
    await createArticle(t, { title: '我的草稿', content: 'x' });
    await createArticle(t, { title: '我的发布', content: 'x', status: 'published' });
    const res = await app.request(ME, { headers: auth(t) });
    const body = await json<ListResp>(res);
    expect(res.status).toBe(200);
    expect(body.data.pagination.total).toBe(2);
  });

  it('admin 列表可见全部状态；status 筛选生效', async () => {
    await register('adm_list');
    await elevate('adm_list', 'admin');
    const t = await tokenOf('adm_list');
    await createArticle(t, { title: 'd', content: 'x' });
    await createArticle(t, { title: 'p', content: 'x', status: 'pending' });
    await createArticle(t, { title: 'pub', content: 'x', status: 'published' });
    const all = await json<ListResp>(await app.request(ADMIN, { headers: auth(t) }));
    expect(all.data.pagination.total).toBe(3);
    const pending = await json<ListResp>(
      await app.request(`${ADMIN}?status=pending`, { headers: auth(t) }),
    );
    expect(pending.data.pagination.total).toBe(1);
  });
});

describe('B2 审核通过 / 任意置位（N9-2 矩阵）', () => {
  it('approve：pending→published 成功并写入 publishedAt', async () => {
    await register('ap_a');
    await elevate('ap_a', 'admin');
    const a = await tokenOf('ap_a');
    const m = await tokenOf('ap_m');
    const id = await makePending(m);
    const res = await app.request(`${ADMIN}/${id}/approve`, { method: 'POST', headers: auth(a) });
    const body = await json<ArticleResp>(res);
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('published');
  });

  it('approve 非 pending 前态 → 3003', async () => {
    await register('ap2_a');
    await elevate('ap2_a', 'admin');
    const a = await tokenOf('ap2_a');
    const m = await tokenOf('ap2_m');
    const id = (await json<ArticleResp>(await createArticle(m, { title: 'd', content: 'x' }))).data
      .id;
    const res = await app.request(`${ADMIN}/${id}/approve`, { method: 'POST', headers: auth(a) });
    expect(res.status).toBe(409);
    expect((await json<ErrResp>(res)).code).toBe(3003);
  });

  it('setStatus（admin）任意置位生效；同态幂等 200', async () => {
    await register('st_a');
    await elevate('st_a', 'admin');
    const a = await tokenOf('st_a');
    const m = await tokenOf('st_m');
    const id = await makePending(m);
    await app.request(`${ADMIN}/${id}/approve`, { method: 'POST', headers: auth(a) }); // → published
    const down = await app.request(`${ADMIN}/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(a) },
      body: JSON.stringify({ status: 'draft' }),
    });
    expect((await json<ArticleResp>(down)).data.status).toBe('draft'); // 下架
    const same = await app.request(`${ADMIN}/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(a) },
      body: JSON.stringify({ status: 'draft' }),
    });
    expect(same.status).toBe(200); // 幂等
  });
});

describe('B2 角色权限', () => {
  it('member 访问后台列表 → 403；editor 可访问', async () => {
    await register('perm_e');
    await elevate('perm_e', 'editor');
    const e = await tokenOf('perm_e');
    const m = await tokenOf('perm_m');
    expect((await app.request(ADMIN, { headers: auth(m) })).status).toBe(403);
    expect((await app.request(ADMIN, { headers: auth(e) })).status).toBe(200);
  });

  it('member 审核 → 403；editor 审核成功；editor 置位 → 403（需 admin）', async () => {
    await register('perm2_e');
    await elevate('perm2_e', 'editor');
    const e = await tokenOf('perm2_e');
    const m = await tokenOf('perm2_m');
    const id = await makePending(m);
    expect(
      (await app.request(`${ADMIN}/${id}/approve`, { method: 'POST', headers: auth(m) })).status,
    ).toBe(403);
    expect(
      (await app.request(`${ADMIN}/${id}/approve`, { method: 'POST', headers: auth(e) })).status,
    ).toBe(200);
    const id2 = await makePending(m);
    const st = await app.request(`${ADMIN}/${id2}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(e) },
      body: JSON.stringify({ status: 'draft' }),
    });
    expect(st.status).toBe(403);
  });
});

describe('B2 过滤与去规范化', () => {
  it('关键词过滤仅匹配 title/summary', async () => {
    // 已发布需 editor/admin 才能置位，提权后再创建
    await register('kw_a');
    await elevate('kw_a', 'admin');
    const t = await tokenOf('kw_a');
    await createArticle(t, { title: '苹果手机评测', content: 'x', status: 'published' });
    await createArticle(t, { title: '安卓手机评测', content: 'x', status: 'published' });
    const res = await app.request(`${BASE}?keyword=苹果&sort=createdAt`);
    const body = await json<ListResp>(res);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.list[0]?.id).toBeDefined();
  });
});
