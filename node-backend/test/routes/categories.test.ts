/**
 * test/routes/categories.test.ts
 * B3 分类验收：公开列表/树/面包屑/统计、创建/更新/删除、未授权 403、slug 冲突 409、
 * 环检测 409、深度超限 409、删除守卫（有子节点/文章引用 → 409）。
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

const BASE = '/api/v1/categories';
const authH = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface TokenResp {
  code: number;
  data: { accessToken: string };
}
interface CategoryResp {
  code: number;
  data: {
    id: number;
    name: string;
    slug: string;
    parentId: number | null;
    sortOrder: number;
    description: string | null;
  };
}
interface NodeResp {
  id: number;
  name: string;
  slug: string;
  children: NodeResp[];
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
const tokenOf = async (username: string): Promise<string> => {
  await register(username);
  const r = await json<TokenResp>(await login(username));
  return r.data.accessToken;
};
const elevate = (username: string, role: 'admin' | 'editor') =>
  getDb().update(users).set({ role }).where(eq(users.username, username)).run();
const createCategory = (token: string, payload: Record<string, unknown>) =>
  app.request(BASE, { method: 'POST', headers: authH(token), body: JSON.stringify(payload) });
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request('/api/v1/articles', {
    method: 'POST',
    headers: authH(token),
    body: JSON.stringify(payload),
  });

describe('B3 分类 · 公开读取', () => {
  it('GET / 空表返回空数组', async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await json<{ code: number; data: unknown[] }>(res);
    expect(body.data).toEqual([]);
  });

  it('GET /tree 递归正确且按 sortOrder 排序', async () => {
    await register('tr_ed');
    await elevate('tr_ed', 'editor');
    const ed = await tokenOf('tr_ed');
    const root = await json<CategoryResp>(await createCategory(ed, { name: '根', slug: 'root' }));
    const rootId = root.data.id;
    await json<CategoryResp>(
      await createCategory(ed, { name: '乙', slug: 'b', parentId: rootId, sortOrder: 2 }),
    );
    await json<CategoryResp>(
      await createCategory(ed, { name: '甲', slug: 'a', parentId: rootId, sortOrder: 1 }),
    );
    const grand = await json<CategoryResp>(
      await createCategory(ed, { name: '孙', slug: 'g', parentId: rootId + 1 }),
    );
    const grandId = grand.data.id;

    const res = await app.request(`${BASE}/tree`);
    const tree = await json<{ code: number; data: NodeResp[] }>(res);
    expect(tree.data.length).toBe(1);
    const r = tree.data[0];
    if (!r) throw new Error('root missing');
    expect(r.slug).toBe('root');
    expect(r.children.map((c) => c.slug)).toEqual(['a', 'b']); // 按 sortOrder 1→2
    const b = r.children.find((c) => c.slug === 'b');
    expect(b?.children[0]?.id).toBe(grandId);
  });

  it('GET /:id/breadcrumb 返回 根→当前 路径', async () => {
    await register('br_ed');
    await elevate('br_ed', 'editor');
    const ed = await tokenOf('br_ed');
    const root = await json<CategoryResp>(await createCategory(ed, { name: '根', slug: 'root' }));
    const child = await json<CategoryResp>(
      await createCategory(ed, { name: '子', slug: 'child', parentId: root.data.id }),
    );
    const grand = await json<CategoryResp>(
      await createCategory(ed, { name: '孙', slug: 'grand', parentId: child.data.id }),
    );

    const res = await app.request(`${BASE}/${grand.data.id}/breadcrumb`);
    const body = await json<{ code: number; data: { slug: string }[] }>(res);
    expect(body.data.map((b) => b.slug)).toEqual(['root', 'child', 'grand']);
  });

  it('GET /stats 返回各分类已发布文章数', async () => {
    await register('st_ed');
    await elevate('st_ed', 'editor');
    const ed = await tokenOf('st_ed');
    const cat = await json<CategoryResp>(await createCategory(ed, { name: '技术', slug: 'tech' }));
    await json<CategoryResp>(await createCategory(ed, { name: '生活', slug: 'life' }));
    await json<{ code: number; data: { id: number } }>(
      await createArticle(ed, {
        title: 'a',
        content: 'x',
        status: 'published',
        categoryId: cat.data.id,
      }),
    );

    const res = await app.request(`${BASE}/stats`);
    const body = await json<{ code: number; data: { slug: string; articleCount: number }[] }>(res);
    const tech = body.data.find((s) => s.slug === 'tech');
    const life = body.data.find((s) => s.slug === 'life');
    expect(tech?.articleCount).toBe(1);
    expect(life?.articleCount).toBe(0);
  });
});

describe('B3 分类 · 写操作权限与冲突', () => {
  it('创建需 editor；member → 403；slug 重复 → 409', async () => {
    await register('c_m');
    const m = await tokenOf('c_m');
    await register('c_e');
    await elevate('c_e', 'editor');
    const e = await tokenOf('c_e');

    expect((await createCategory(m, { name: 'x', slug: 'dup' })).status).toBe(403);
    expect(
      (await json<CategoryResp>(await createCategory(e, { name: 'x', slug: 'dup' }))).code,
    ).toBe(0);
    const dup = await createCategory(e, { name: 'y', slug: 'dup' });
    expect(dup.status).toBe(409);
    expect((await json<ErrResp>(dup)).code).toBe(3002);
  });

  it('深度超限（>4 级）→ 409', async () => {
    await register('d_ed');
    await elevate('d_ed', 'editor');
    const ed = await tokenOf('d_ed');
    let parent = 0;
    for (let i = 0; i < 4; i++) {
      const r = await json<CategoryResp>(
        await createCategory(ed, { name: `L${i}`, slug: `l${i}`, parentId: parent || null }),
      );
      parent = r.data.id;
    }
    const tooDeep = await createCategory(ed, { name: 'L4', slug: 'l4', parentId: parent });
    expect(tooDeep.status).toBe(409);
    expect((await json<ErrResp>(tooDeep)).code).toBe(3002);
  });

  it('更新成环（父设为自己/子孙）→ 409', async () => {
    await register('cy_ed');
    await elevate('cy_ed', 'editor');
    const ed = await tokenOf('cy_ed');
    const a = await json<CategoryResp>(await createCategory(ed, { name: 'A', slug: 'a' }));
    const b = await json<CategoryResp>(
      await createCategory(ed, { name: 'B', slug: 'b', parentId: a.data.id }),
    );
    const self = await app.request(`${BASE}/${a.data.id}`, {
      method: 'PUT',
      headers: authH(ed),
      body: JSON.stringify({ name: 'A', slug: 'a', parentId: a.data.id }),
    });
    expect(self.status).toBe(409);
    const cycle = await app.request(`${BASE}/${a.data.id}`, {
      method: 'PUT',
      headers: authH(ed),
      body: JSON.stringify({ name: 'A', slug: 'a', parentId: b.data.id }),
    });
    expect(cycle.status).toBe(409);
  });

  it('移动带子孙的子树使子孙超界 → 409（subtreeHeight 校验）', async () => {
    await register('mv_ed');
    await elevate('mv_ed', 'editor');
    const ed = await tokenOf('mv_ed');

    // P 链：p0(1) → p1(2) → P(3)
    const p0 = await json<CategoryResp>(await createCategory(ed, { name: 'p0', slug: 'p0' }));
    const p1 = await json<CategoryResp>(
      await createCategory(ed, { name: 'p1', slug: 'p1', parentId: p0.data.id }),
    );
    const P = await json<CategoryResp>(
      await createCategory(ed, { name: 'P', slug: 'pp', parentId: p1.data.id }),
    );

    // A 链：a0(1) → a1(2) → A(3) → B(4)
    const a0 = await json<CategoryResp>(await createCategory(ed, { name: 'a0', slug: 'a0' }));
    const a1 = await json<CategoryResp>(
      await createCategory(ed, { name: 'a1', slug: 'a1', parentId: a0.data.id }),
    );
    const A = await json<CategoryResp>(
      await createCategory(ed, { name: 'A', slug: 'aa', parentId: a1.data.id }),
    );
    const B = await json<CategoryResp>(
      await createCategory(ed, { name: 'B', slug: 'bb', parentId: A.data.id }),
    );

    // 把 A（含子孙 B）移到 P 下：P 深度 3 + 子树高度 2 = 5 > 4 → 拒绝
    const move = await app.request(`${BASE}/${A.data.id}`, {
      method: 'PUT',
      headers: authH(ed),
      body: JSON.stringify({ name: 'A', slug: 'aa', parentId: P.data.id }),
    });
    expect(move.status).toBe(409);
    expect((await json<ErrResp>(move)).code).toBe(3002);

    // 对照：把 B（depth4 叶子）移到 P 下应允许（3 + 高度1 = 4 ≤ 4）
    const moveB = await app.request(`${BASE}/${B.data.id}`, {
      method: 'PUT',
      headers: authH(ed),
      body: JSON.stringify({ name: 'B', slug: 'bb', parentId: P.data.id }),
    });
    expect(moveB.status).toBe(200);
  });

  it('删除守卫：有子节点 → 409；干净叶子 → 200 并不可再查', async () => {
    await register('del_ed');
    await elevate('del_ed', 'editor');
    const ed = await tokenOf('del_ed');
    const parent = await json<CategoryResp>(await createCategory(ed, { name: 'P', slug: 'p' }));
    const child = await json<CategoryResp>(
      await createCategory(ed, { name: 'C', slug: 'c', parentId: parent.data.id }),
    );

    const delParent = await app.request(`${BASE}/${parent.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ed}` },
    });
    expect(delParent.status).toBe(409); // 仍有子分类
    const delChild = await app.request(`${BASE}/${child.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ed}` },
    });
    expect(delChild.status).toBe(200); // 无子节点、无文章引用 → 可删
    const after = await app.request(`${BASE}/${child.data.id}/breadcrumb`);
    expect(after.status).toBe(404);
  });

  it('删除守卫：有文章引用 → 409', async () => {
    await register('ref_ed');
    await elevate('ref_ed', 'editor');
    const ed = await tokenOf('ref_ed');
    const cat = await json<CategoryResp>(
      await createCategory(ed, { name: '文章分类', slug: 'ac' }),
    );
    await json<{ code: number; data: { id: number } }>(
      await createArticle(ed, {
        title: 'a',
        content: 'x',
        status: 'published',
        categoryId: cat.data.id,
      }),
    );
    const del = await app.request(`${BASE}/${cat.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ed}` },
    });
    expect(del.status).toBe(409); // 仍有文章引用
  });
});
