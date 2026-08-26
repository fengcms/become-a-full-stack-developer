/**
 * test/routes/article-tag-sync.test.ts
 * B3.5 验收：article_tags 从「死表」变为真实生效的关联索引。
 * 覆盖：创建/更新同步关联、列表标签过滤精确化（关闭 B2 P3 子串误匹配）、
 * 标签删除守卫因关联非空而拒删（3002）。
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
import { backfillArticleTags } from '@/services/article-backfill';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

beforeEach(async () => {
  const db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
});

const ARTICLES = '/api/v1/articles';
const TAGS = '/api/v1/tags';
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface TokenResp {
  code: number;
  data: { accessToken: string };
}
interface ArticleResp {
  code: number;
  data: { id: number; status: string };
}
interface TagListResp {
  code: number;
  data: { id: number; name: string; slug: string; articleCount: number }[];
}
interface ErrResp {
  code: number;
}

const register = (username: string, password = 'password123') =>
  app.request('/api/v1/auth/register', {
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
// 提权必须在登录之前（JWT 角色是登录快照）
const tokenOf = async (username: string, role?: 'admin' | 'editor'): Promise<string> => {
  await register(username);
  if (role) {
    await getDb().update(users).set({ role }).where(eq(users.username, username)).run();
  }
  const r = await json<TokenResp>(await login(username));
  return r.data.accessToken;
};
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request(ARTICLES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
const createTag = (token: string, name: string, slug: string) =>
  app.request(TAGS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, slug }),
  });

const articleTagRows = async () =>
  (await getDb().select().from(articleTags).all()) as { articleId: number; tagId: number }[];
const countForTag = async (slug: string): Promise<number> => {
  const list = await json<TagListResp>(await app.request(TAGS));
  return list.data.find((t) => t.slug === slug)?.articleCount ?? -1;
};

describe('B3.5 创建/更新同步 article_tags', () => {
  it('新建带 tags 的文章 → article_tags 出现行；GET /tags 该标签 articleCount +1', async () => {
    const admin = await tokenOf('sync_a', 'admin');
    await createTag(admin, 'js', 'js');
    const created = await createArticle(admin, {
      title: 'T',
      content: 'x',
      status: 'published',
      tags: ['js'],
    });
    const id = (await json<ArticleResp>(created)).data.id;

    const rows = await articleTagRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.articleId).toBe(id);

    // 标签须已存在才能被计数（slug==name 约定解析）
    expect(await countForTag('js')).toBe(1);
  });

  it('更新文章 tags 增/减 → article_tags 同步增减', async () => {
    const admin = await tokenOf('sync_b', 'admin');
    await createTag(admin, 'a', 'a');
    await createTag(admin, 'b', 'b');
    const created = await createArticle(admin, {
      title: 'T',
      content: 'x',
      status: 'published',
      tags: ['a'],
    });
    const id = (await json<ArticleResp>(created)).data.id;

    // 增加 b
    await app.request(`${ARTICLES}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ tags: ['a', 'b'] }),
    });
    expect(await articleTagRows()).toHaveLength(2);
    expect(await countForTag('a')).toBe(1);
    expect(await countForTag('b')).toBe(1);

    // 减掉 a
    await app.request(`${ARTICLES}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ tags: ['b'] }),
    });
    const rows = await articleTagRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tagId).toBe(
      (await json<TagListResp>(await app.request(TAGS))).data.find((t) => t.slug === 'b')?.id,
    );
    expect(await countForTag('a')).toBe(0);
    expect(await countForTag('b')).toBe(1);
  });
});

describe('B3.5 列表标签过滤精确化（关闭 B2 P3 子串误匹配）', () => {
  it('?tag=js 仅匹配标签 js 的文章，不再子串命中 json', async () => {
    const admin = await tokenOf('filter_a', 'admin');
    await createTag(admin, 'js', 'js');
    await createTag(admin, 'json', 'json');
    const a = await createArticle(admin, {
      title: 'A',
      content: 'x',
      status: 'published',
      tags: ['js'],
    });
    const b = await createArticle(admin, {
      title: 'B',
      content: 'x',
      status: 'published',
      tags: ['json'],
    });
    const idA = (await json<ArticleResp>(a)).data.id;
    const idB = (await json<ArticleResp>(b)).data.id;

    const jsList = await json<{ code: number; data: { list: { id: number }[] } }>(
      await app.request(`${ARTICLES}?tag=js`),
    );
    const ids = jsList.data.list.map((x) => x.id);
    expect(ids).toContain(idA);
    expect(ids).not.toContain(idB); // 关键：旧 LIKE "js" 会误命中 json

    const jsonList = await json<{ code: number; data: { list: { id: number }[] } }>(
      await app.request(`${ARTICLES}?tag=json`),
    );
    const jsonIds = jsonList.data.list.map((x) => x.id);
    expect(jsonIds).toContain(idB);
    expect(jsonIds).not.toContain(idA);
  });

  it('?tag= 无对应 catalog 标签 → 返回空列表', async () => {
    const admin = await tokenOf('filter_b', 'admin');
    await createArticle(admin, { title: 'A', content: 'x', status: 'published', tags: ['js'] });
    const res = await json<{
      code: number;
      data: { list: unknown[]; pagination: { total: number } };
    }>(await app.request(`${ARTICLES}?tag=nope`));
    expect(res.data.list).toHaveLength(0);
    expect(res.data.pagination.total).toBe(0);
  });
});

describe('B3.5 标签删除守卫因 article_tags 生效而拒删', () => {
  it('标签被文章引用 → DELETE /tags/:id 返回 3002；清空关联后可删', async () => {
    const admin = await tokenOf('guard_a', 'admin');
    const tagResp = await createTag(admin, 'js', 'js');
    const tagId = (await json<{ code: number; data: { id: number } }>(tagResp)).data.id;
    await createArticle(admin, { title: 'A', content: 'x', status: 'published', tags: ['js'] });

    // 关联非空 → 拒删 409 / 3002
    const delBlocked = await app.request(`${TAGS}/${tagId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(delBlocked.status).toBe(409);
    expect((await json<ErrResp>(delBlocked)).code).toBe(3002);

    // 把文章标签清空（关联随之移除）→ 再删成功
    const list = await json<{ code: number; data: { list: { id: number }[] } }>(
      await app.request(`${ARTICLES}?tag=js`),
    );
    const artId = list.data.list[0]?.id;
    await app.request(`${ARTICLES}/${artId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ tags: [] }),
    });
    const delOk = await app.request(`${TAGS}/${tagId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(delOk.status).toBe(200);
  });
});

describe('B3.5 存量回填 backfillArticleTags（死表 → 生效）', () => {
  it('清空关联模拟历史死表，回填从 articles.tags 重建；可重复跑幂等', async () => {
    const admin = await tokenOf('bf_a', 'admin');
    await createTag(admin, 'js', 'js');
    await createTag(admin, 'ts', 'ts');
    // 文章带 tags（含一个 catalog 不存在的标签 zzz，应被跳过）
    await createArticle(admin, {
      title: 'A',
      content: 'x',
      status: 'published',
      tags: ['js', 'zzz'],
    });
    await createArticle(admin, { title: 'B', content: 'x', status: 'published', tags: ['ts'] });

    // 清空 article_tags，模拟 B3.5 之前「死表」状态（创建时尚未同步关联）
    await getDb().delete(articleTags).run();
    expect(await articleTagRows()).toHaveLength(0);

    const r1 = await backfillArticleTags(getDb());
    expect(r1.scanned).toBe(2); // 仅未软删文章
    expect(r1.linked).toBe(2); // js + ts 被链接；zzz 不存在跳过
    expect(await articleTagRows()).toHaveLength(2);
    expect(await countForTag('js')).toBe(1);
    expect(await countForTag('ts')).toBe(1);

    // 幂等：再跑一次不增不减
    const r2 = await backfillArticleTags(getDb());
    expect(r2.linked).toBe(2);
    expect(await articleTagRows()).toHaveLength(2);
  });
});
