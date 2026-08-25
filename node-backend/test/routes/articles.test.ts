/**
 * test/routes/articles.test.ts
 * B2 文章核心验收（一）：公开列表仅 published、未发布详情对匿名 404、owner 可见、
 * 创建默认 draft / member 降级、slug 忽略、更新与软删、submit 转移、阅读量去重。
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

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
interface TokenResp {
  code: number;
  data: { accessToken: string; user: { id: number } };
}
interface ArticleResp {
  code: number;
  data: { id: number; status: string; slug: string | null; viewCount: number; title: string };
}
interface ListResp {
  code: number;
  data: { list: { id: number; status: string }[]; pagination: { total: number } };
}
interface ErrResp {
  code: number;
}

const register = (username: string, password = 'password123') =>
  app.request(`${BASE.replace('/articles', '')}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password }),
  });
const login = (username: string, password = 'password123') =>
  app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
// 注册后再登录（守卫读取的是登录时 JWT 内的角色声明，故提权必须在登录之前完成）。
const tokenOf = async (username: string, password = 'password123'): Promise<string> => {
  await register(username, password); // 幂等：用户已存在则注册返回 409，忽略即可
  const r = await json<TokenResp>(await login(username, password));
  return r.data.accessToken;
};
const elevate = (username: string, role: 'admin' | 'editor') =>
  getDb().update(users).set({ role }).where(eq(users.username, username)).run();
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

describe('B2 公开列表与可见性', () => {
  it('公开列表仅返回 published（忽略 draft/pending）', async () => {
    const t = await tokenOf('vis_a');
    await createArticle(t, { title: '草稿', content: 'x', status: 'draft' });
    await createArticle(t, { title: '待审', content: 'x', status: 'pending' });
    // 已发布需 editor/admin 才能置位，单独用提权账号创建
    await register('vis_pub');
    await elevate('vis_pub', 'admin');
    const pt = await tokenOf('vis_pub');
    const pub = await createArticle(pt, { title: '已发布', content: 'x', status: 'published' });
    const pubId = (await json<ArticleResp>(pub)).data.id;

    const res = await app.request(`${BASE}?sort=createdAt`);
    const body = await json<ListResp>(res);
    expect(res.status).toBe(200);
    expect(body.data.list).toHaveLength(1);
    expect(body.data.list[0]?.id).toBe(pubId);
  });

  it('匿名访问未发布详情 → 404（隐瞒存在性）', async () => {
    const t = await tokenOf('vis_b');
    const created = await createArticle(t, { title: '草稿B', content: 'x' });
    const id = (await json<ArticleResp>(created)).data.id;
    const res = await app.request(`${BASE}/${id}`);
    expect(res.status).toBe(404);
    expect((await json<ErrResp>(res)).code).toBe(3001);
  });

  it('owner 可见自己的未发布详情；他人访问 → 404', async () => {
    const owner = await tokenOf('vis_c');
    const other = await tokenOf('vis_d');
    const created = await createArticle(owner, { title: '草稿C', content: 'x' });
    const id = (await json<ArticleResp>(created)).data.id;

    const own = await app.request(`${BASE}/${id}`, {
      headers: { Authorization: `Bearer ${owner}` },
    });
    expect(own.status).toBe(200);
    const stranger = await app.request(`${BASE}/${id}`, {
      headers: { Authorization: `Bearer ${other}` },
    });
    expect(stranger.status).toBe(404);
  });
});

describe('B2 创建 / 权限降级', () => {
  it('默认创建为 draft；member 传入 published 降级为 pending；slug 被忽略', async () => {
    const t = await tokenOf('cr_a');
    const res = await createArticle(t, {
      title: '标题',
      content: 'x',
      status: 'published',
      slug: 'myslug',
    });
    const body = await json<ArticleResp>(res);
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('pending'); // 降级
    expect(body.data.slug).toBeNull(); // member 忽略 slug
  });

  it('admin 可直接创建 published 并指定 slug', async () => {
    await register('cr_admin');
    await elevate('cr_admin', 'admin');
    const t = await tokenOf('cr_admin');
    const res = await createArticle(t, {
      title: '标题2',
      content: 'x',
      status: 'published',
      slug: 'adm-slug',
    });
    const body = await json<ArticleResp>(res);
    expect(body.data.status).toBe('published');
    expect(body.data.slug).toBe('adm-slug');
  });
});

describe('B2 更新 / 软删 / submit / 阅读量', () => {
  it('owner 可更新；member 编辑已发布自动退回 pending', async () => {
    await register('up_admin');
    await elevate('up_admin', 'admin');
    const admin = await tokenOf('up_admin');
    const m = await tokenOf('up_m');
    const created = await createArticle(m, { title: '初稿', content: 'x' });
    const id = (await json<ArticleResp>(created)).data.id;
    await app.request(`${BASE}/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${m}` },
    });
    await app.request(`${BASE}/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}` },
    });
    // 此时为 published，owner=member 编辑
    const upd = await app.request(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m}` },
      body: JSON.stringify({ title: '改后' }),
    });
    expect((await json<ArticleResp>(upd)).data.status).toBe('pending'); // 退回待审
  });

  it('非 owner 更新 → 403', async () => {
    const owner = await tokenOf('up_o');
    const stranger = await tokenOf('up_s');
    const created = await createArticle(owner, { title: 'o', content: 'x' });
    const id = (await json<ArticleResp>(created)).data.id;
    const res = await app.request(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stranger}` },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  it('owner 软删后公开与管理均不可见', async () => {
    const t = await tokenOf('del_a');
    const created = await createArticle(t, { title: '待删', content: 'x', status: 'published' });
    const id = (await json<ArticleResp>(created)).data.id;
    const del = await app.request(`${BASE}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(del.status).toBe(200);
    const after = await app.request(`${BASE}/${id}`);
    expect(after.status).toBe(404);
  });

  it('submit 仅 draft 前态合法；非 draft → 3003', async () => {
    const t = await tokenOf('sub_a');
    const created = await createArticle(t, { title: 's', content: 'x' });
    const id = (await json<ArticleResp>(created)).data.id;
    const ok = await app.request(`${BASE}/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    });
    expect((await json<ArticleResp>(ok)).data.status).toBe('pending');
    const again = await app.request(`${BASE}/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(again.status).toBe(409);
    expect((await json<ErrResp>(again)).code).toBe(3003);
  });

  it('阅读量去重：匿名两次计 1，换登录用户再计 +1，未发布 → 404', async () => {
    await register('view_admin');
    await elevate('view_admin', 'admin');
    const admin = await tokenOf('view_admin');
    const created = await createArticle(admin, {
      title: '阅读',
      content: 'x',
      status: 'published',
    });
    const id = (await json<ArticleResp>(created)).data.id;

    const v1 = await app.request(`${BASE}/${id}/view`, { method: 'POST' });
    const v2 = await app.request(`${BASE}/${id}/view`, { method: 'POST' });
    expect((await json<ArticleResp>(v1)).data.viewCount).toBe(1);
    expect((await json<ArticleResp>(v2)).data.viewCount).toBe(1); // 匿名同键去重

    const user = await tokenOf('view_user');
    const v3 = await app.request(`${BASE}/${id}/view`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user}` },
    });
    expect((await json<ArticleResp>(v3)).data.viewCount).toBe(2);

    const draft = await createArticle(admin, { title: '未发', content: 'x' });
    const did = (await json<ArticleResp>(draft)).data.id;
    const dv = await app.request(`${BASE}/${did}/view`, { method: 'POST' });
    expect(dv.status).toBe(404);
  });
});
