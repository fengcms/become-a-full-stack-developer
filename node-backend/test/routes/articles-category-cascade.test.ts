/**
 * test/routes/articles-category-cascade.test.ts
 * 分类级联回归（方案 B）：category 按 slug 匹配该分类自身及其所有后代子分类。
 * 验证点：① 父分类返回子分类文章；② 叶子分类行为不变；③ 不存在的 slug 返回空不报错。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { getDb } from '@/db/client';
import { articles, categories, users } from '@/db/schema';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

/** 信封 data 形状（列表）。 */
interface ListEnvelope {
  code: number;
  message: string;
  data: { list: { id: number; categoryName: string | null }[]; pagination: { total: number } };
}

beforeAll(async () => {
  const now = new Date();
  // 内存库无种子用户，需先建一个 id=1 的用户以满足 articles.author_id 外键约束
  await getDb()
    .insert(users)
    .values({
      id: 1,
      username: 'seed-author',
      passwordHash: 'x',
      role: 'member',
      status: 'active',
      level: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  await getDb()
    .insert(categories)
    .values([
      {
        id: 901,
        name: 'Frontend',
        slug: 'frontend',
        parentId: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 902,
        name: 'React',
        slug: 'react',
        parentId: 901,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 903,
        name: 'Vue',
        slug: 'vue',
        parentId: 901,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  await getDb()
    .insert(articles)
    .values([
      {
        id: 9001,
        title: 'React 文章',
        content: 'react body',
        authorId: 1,
        status: 'published',
        categoryId: 902,
        categoryName: 'React',
        categorySlug: 'react',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 9002,
        title: 'Vue 文章',
        content: 'vue body',
        authorId: 1,
        status: 'published',
        categoryId: 903,
        categoryName: 'Vue',
        categorySlug: 'vue',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
});

describe('分类级联（category 含后代子分类）', () => {
  it('category=frontend 返回 react + vue 全部文章（级联）', async () => {
    const res = await app.request('/api/v1/articles?category=frontend');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.code).toBe(0);
    expect(body.data.pagination.total).toBe(2);
    const names = body.data.list.map((a) => a.categoryName).sort();
    expect(names).toEqual(['React', 'Vue']);
  });

  it('category=react（叶子分类）行为不变，仅返回自身文章', async () => {
    const res = await app.request('/api/v1/articles?category=react');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.code).toBe(0);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.list[0]?.categoryName).toBe('React');
  });

  it('category=不存在的 slug 返回空列表且不报错', async () => {
    const res = await app.request('/api/v1/articles?category=does-not-exist');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListEnvelope;
    expect(body.code).toBe(0);
    expect(body.data.pagination.total).toBe(0);
    expect(body.data.list).toHaveLength(0);
  });
});
