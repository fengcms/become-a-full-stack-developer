/**
 * test/routes/tags.test.ts
 * B3 标签验收：公开列表（含 articleCount）/ 创建 / 更新 / 删除、未授权 403、slug 冲突 409、
 * 删除守卫（有文章引用 → 409）、articleCount 由 article_tags 关联精确聚合。
 */
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, getDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { articleTags, users } from '@/db/schema';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

beforeEach(async () => {
  const db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
});

const BASE = '/api/v1/tags';
const authH = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface TokenResp {
  code: number;
  data: { accessToken: string };
}
interface TagResp {
  code: number;
  data: { id: number; name: string; slug: string; articleCount: number };
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
const createTag = (token: string, payload: Record<string, unknown>) =>
  app.request(BASE, { method: 'POST', headers: authH(token), body: JSON.stringify(payload) });
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request('/api/v1/articles', {
    method: 'POST',
    headers: authH(token),
    body: JSON.stringify(payload),
  });

describe('B3 标签 · 公开列表与 articleCount', () => {
  it('GET / 返回空列表（初始 articleCount 全 0）', async () => {
    const res = await app.request(BASE);
    const body = await json<{ code: number; data: { slug: string; articleCount: number }[] }>(res);
    expect(body.data).toEqual([]);
  });

  it('articleCount 由 article_tags 关联精确聚合（已发布计入，草稿不计入）', async () => {
    await register('cnt_ed');
    await elevate('cnt_ed', 'editor');
    const ed = await tokenOf('cnt_ed');
    const tag = await json<TagResp>(await createTag(ed, { name: 'Go', slug: 'go' }));
    const tagId = tag.data.id;

    const pub = await json<{ code: number; data: { id: number } }>(
      await createArticle(ed, { title: 'a', content: 'x', status: 'published' }),
    );
    const draft = await json<{ code: number; data: { id: number } }>(
      await createArticle(ed, { title: 'b', content: 'x', status: 'draft' }),
    );
    // 白盒：直接写入关联表（文章打标签入口属 B2/B4，本批不实现，此处验证聚合查询正确性）
    await getDb()
      .insert(articleTags)
      .values([
        { articleId: pub.data.id, tagId, createdAt: new Date() },
        { articleId: draft.data.id, tagId, createdAt: new Date() },
      ])
      .run();

    const res = await app.request(BASE);
    const body = await json<{ code: number; data: { slug: string; articleCount: number }[] }>(res);
    const go = body.data.find((t) => t.slug === 'go');
    expect(go?.articleCount).toBe(1); // 仅已发布文章计入
  });
});

describe('B3 标签 · 写操作权限与冲突', () => {
  it('创建需 editor；member → 403；slug 重复 → 409', async () => {
    await register('t_m');
    const m = await tokenOf('t_m');
    await register('t_e');
    await elevate('t_e', 'editor');
    const e = await tokenOf('t_e');

    expect((await createTag(m, { name: 'x', slug: 'dup' })).status).toBe(403);
    expect((await json<TagResp>(await createTag(e, { name: 'x', slug: 'dup' }))).code).toBe(0);
    const dup = await createTag(e, { name: 'y', slug: 'dup' });
    expect(dup.status).toBe(409);
    expect((await json<ErrResp>(dup)).code).toBe(3002);
  });

  it('更新 slug 冲突（排除自身）→ 409', async () => {
    await register('u_ed');
    await elevate('u_ed', 'editor');
    const ed = await tokenOf('u_ed');
    await json<TagResp>(await createTag(ed, { name: 'A', slug: 'a' }));
    const b = await json<TagResp>(await createTag(ed, { name: 'B', slug: 'b' }));
    const res = await app.request(`${BASE}/${b.data.id}`, {
      method: 'PUT',
      headers: authH(ed),
      body: JSON.stringify({ name: 'B', slug: 'a' }),
    });
    expect(res.status).toBe(409);
  });

  it('删除守卫：有文章引用 → 409；无引用 → 200', async () => {
    await register('d_ed');
    await elevate('d_ed', 'editor');
    const ed = await tokenOf('d_ed');
    const tag = await json<TagResp>(await createTag(ed, { name: 'TS', slug: 'ts' }));
    const art = await json<{ code: number; data: { id: number } }>(
      await createArticle(ed, { title: 'a', content: 'x', status: 'published' }),
    );
    await getDb()
      .insert(articleTags)
      .values({ articleId: art.data.id, tagId: tag.data.id, createdAt: new Date() })
      .run();

    const locked = await app.request(`${BASE}/${tag.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ed}` },
    });
    expect(locked.status).toBe(409); // 仍有文章引用
    await getDb().delete(articleTags).where(eq(articleTags.tagId, tag.data.id)).run();
    const ok = await app.request(`${BASE}/${tag.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ed}` },
    });
    expect(ok.status).toBe(200);
  });
});
