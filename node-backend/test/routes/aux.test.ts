/**
 * test/routes/aux.test.ts
 * B7 验收：辅助接口 / 站点（adjacent / related / toc / stats / search / site/settings）。
 * 覆盖（对应 07-aux-site.md 验收门禁）：
 *  - adjacent 取对上下篇、首篇无上篇、末篇无下篇、未发布 404
 *  - related 命中同分类/共享标签、无关文章不出现、limit 生效、未发布 404
 *  - toc 解析 Markdown 标题、跳过代码围栏、重复标题锚点去重、未发布 404
 *  - stats 数值合理（published 文章 / approved 评论 / active 用户 / 阅读量累计）
 *  - search 命中标题/摘要/正文、未命中返回空、空关键词 400、type=member 返回 members
 *  - site/settings 公开可读、admin 可读可改、匿名改 401、会员改 403、部分更新不误改
 */
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, getDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { articles, comments, users } from '@/db/schema';

const app = createApp(readEnv(process.env as Record<string, string | undefined>));

beforeEach(async () => {
  const db = createLocalDb(':memory:');
  await migrate(db);
  setDb(db);
});

const BASE = '/api/v1';
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface TokenResp {
  code: number;
  data: { accessToken: string };
}
interface ArticleResp {
  code: number;
  data: { id: number };
}
interface SiteSettingResp {
  code: number;
  data: {
    id: number;
    siteName: string;
    siteTitle: string | null;
    siteDescription: string;
    siteKeywords: string | null;
    logoUrl: string | null;
    copyright: string | null;
    updatedAt: string;
  };
}
interface AdjacentResp {
  code: number;
  data: {
    prev: { id: number; title: string; slug: string | null } | null;
    next: { id: number; title: string; slug: string | null } | null;
  };
}
interface RelatedResp {
  code: number;
  data: { id: number; title: string; slug: string | null; viewCount: number }[];
}
interface TocResp {
  code: number;
  data: { level: number; text: string; anchor: string }[];
}
interface StatsResp {
  code: number;
  data: { articleCount: number; commentCount: number; memberCount: number; viewTotal: number };
}
interface SearchResp {
  code: number;
  data: {
    articles: { list: { id: number }[]; pagination: { total: number } } | null;
    members: {
      list: { id: number; nickname: string; articleCount: number }[];
      pagination: { total: number };
    } | null;
  };
}

const tokenOf = async (username: string, role?: 'admin' | 'editor' | 'member'): Promise<string> => {
  await app.request(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'password123' }),
  });
  if (role) await getDb().update(users).set({ role }).where(eq(users.username, username)).run();
  const r = await json<TokenResp>(
    await app.request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password123' }),
    }),
  );
  return r.data.accessToken;
};

const publish = async (
  token: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<number> => {
  const r = await json<ArticleResp>(
    await app.request(`${BASE}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, content: 'c', status: 'published', ...extra }),
    }),
  );
  return r.data.id;
};

const userIdOf = async (username: string): Promise<number> => {
  const row = (
    await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
      .all()
  )[0];
  if (!row) throw new Error(`seed user ${username} missing`);
  return row.id;
};

/** 直写 DB 控制文章字段（publishedAt/tags/categoryId/viewCount），绕过 API 校验以精确构造场景。 */
const setArticle = (
  id: number,
  patch: Partial<{ publishedAt: Date; tags: string; categoryId: number | null; viewCount: number }>,
) => getDb().update(articles).set(patch).where(eq(articles.id, id)).run();

describe('B7 上一篇/下一篇', () => {
  it('取对上下篇；首篇无上篇、末篇无下篇；未发布 → 404', async () => {
    const admin = await tokenOf('b7a1', 'admin');
    const [a1, a2, a3] = [
      await publish(admin, 'A1'),
      await publish(admin, 'A2'),
      await publish(admin, 'A3'),
    ];
    const t = (mins: number) => new Date(Date.UTC(2025, 0, 1, 0, mins, 0));
    setArticle(a1, { publishedAt: t(0) });
    setArticle(a2, { publishedAt: t(10) });
    setArticle(a3, { publishedAt: t(20) });

    const mid = await json<AdjacentResp>(await app.request(`${BASE}/articles/${a2}/adjacent`));
    expect(mid.data.prev?.id).toBe(a1);
    expect(mid.data.next?.id).toBe(a3);

    const first = await json<AdjacentResp>(await app.request(`${BASE}/articles/${a1}/adjacent`));
    expect(first.data.prev).toBeNull();
    expect(first.data.next?.id).toBe(a2);

    const last = await json<AdjacentResp>(await app.request(`${BASE}/articles/${a3}/adjacent`));
    expect(last.data.prev?.id).toBe(a2);
    expect(last.data.next).toBeNull();

    // 未发布文章按公开可见性铁律 → 404
    const draft = await json<ArticleResp>(
      await app.request(`${BASE}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ title: 'Draft', content: 'c', status: 'draft' }),
      }),
    );
    expect((await app.request(`${BASE}/articles/${draft.data.id}/adjacent`)).status).toBe(404);
  });
});

describe('B7 相关文章', () => {
  it('命中同分类/共享标签；无关文章不出现；limit 生效', async () => {
    const admin = await tokenOf('b7r1', 'admin');
    const a1 = await publish(admin, 'R1');
    const a2 = await publish(admin, 'R2');
    const a3 = await publish(admin, 'R3');
    setArticle(a1, { tags: JSON.stringify(['node', 'ts']), categoryId: 7 });
    setArticle(a2, { tags: JSON.stringify(['node']), categoryId: 7 }); // 共享 node + 同分类
    setArticle(a3, { tags: JSON.stringify(['go']), categoryId: 8 }); // 无交集

    const rel = await json<RelatedResp>(
      await app.request(`${BASE}/articles/${a1}/related?limit=10`),
    );
    const ids = rel.data.map((r) => r.id);
    expect(ids).toContain(a2);
    expect(ids).not.toContain(a3);
    expect(ids).not.toContain(a1); // 排除自身

    const limited = await json<RelatedResp>(
      await app.request(`${BASE}/articles/${a1}/related?limit=1`),
    );
    expect(limited.data).toHaveLength(1);
  });

  it('未发布文章 related → 404', async () => {
    const admin = await tokenOf('b7r2', 'admin');
    const draft = await json<ArticleResp>(
      await app.request(`${BASE}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ title: 'D', content: 'c', status: 'draft' }),
      }),
    );
    expect((await app.request(`${BASE}/articles/${draft.data.id}/related`)).status).toBe(404);
  });
});

describe('B7 目录解析', () => {
  it('解析 Markdown 标题，跳过代码围栏，重复标题锚点去重', async () => {
    const admin = await tokenOf('b7t1', 'admin');
    const content = '# 标题一\n正文段落\n\n## 标题二\n\n```js\n# 这不是标题\n```\n\n# 标题一\n';
    const id = await publish(admin, 'TOC', { content });
    const toc = await json<TocResp>(await app.request(`${BASE}/articles/${id}/toc`));
    const texts = toc.data.map((x) => x.text);
    expect(texts).toEqual(['标题一', '标题二', '标题一']);
    expect(toc.data[0]?.level).toBe(1);
    expect(toc.data[0]?.anchor).toBe('标题一');
    expect(toc.data[1]?.level).toBe(2);
    // 重复标题 → 锚点追加 -1 去重
    expect(toc.data[2]?.anchor).toBe('标题一-1');
    // 代码围栏内的 # 应被跳过（无 "这不是标题"）
    expect(texts).not.toContain('这不是标题');
  });

  it('未发布文章 toc → 404', async () => {
    const admin = await tokenOf('b7t2', 'admin');
    const draft = await json<ArticleResp>(
      await app.request(`${BASE}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ title: 'D', content: '# X', status: 'draft' }),
      }),
    );
    expect((await app.request(`${BASE}/articles/${draft.data.id}/toc`)).status).toBe(404);
  });
});

describe('B7 全站统计', () => {
  it('返回 published 文章数 / approved 评论 / active 用户 / 阅读量累计', async () => {
    const admin = await tokenOf('b7s1', 'admin');
    const a1 = await publish(admin, 'S1');
    const a2 = await publish(admin, 'S2');
    await publish(admin, 'Sdraft', { status: 'draft' }); // 不计入
    setArticle(a1, { viewCount: 10 });
    setArticle(a2, { viewCount: 5 });
    const uid = await userIdOf('b7s1');
    const now = new Date();
    await getDb()
      .insert(comments)
      .values([
        {
          articleId: a1,
          userId: uid,
          userName: 'x',
          content: 'c',
          status: 'approved',
          createdAt: now,
        },
        {
          articleId: a1,
          userId: uid,
          userName: 'x',
          content: 'c',
          status: 'approved',
          createdAt: now,
        },
        {
          articleId: a1,
          userId: uid,
          userName: 'x',
          content: 'c',
          status: 'rejected',
          createdAt: now,
        },
      ])
      .run();
    // 注入一名 disabled 用户，验证 memberCount 仅计 active
    await getDb()
      .insert(users)
      .values({
        username: 'b7disabled',
        email: 'b7disabled@example.com',
        passwordHash: 'x',
        role: 'member',
        status: 'disabled',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const stats = await json<StatsResp>(await app.request(`${BASE}/stats`));
    expect(stats.data.articleCount).toBe(2);
    expect(stats.data.commentCount).toBe(2); // 仅 approved
    expect(stats.data.memberCount).toBe(1); // 仅 b7s1 active
    expect(stats.data.viewTotal).toBe(15);
  });
});

describe('B7 搜索', () => {
  it('命中标题/摘要/正文；未命中返回空；空关键词 → 400', async () => {
    const admin = await tokenOf('b7se1', 'admin');
    await publish(admin, '标题关键词TITLEKW', {
      summary: '摘要关键词SUMMKW',
      content: '正文关键词CONTENTKW',
    });
    await publish(admin, '其他文章', { content: '普通内容' });

    const byTitle = await json<SearchResp>(await app.request(`${BASE}/search?q=TITLEKW`));
    expect(byTitle.data.articles?.list.length).toBeGreaterThanOrEqual(1);
    expect(byTitle.data.members).toBeNull();

    const bySummary = await json<SearchResp>(await app.request(`${BASE}/search?q=SUMMKW`));
    expect(bySummary.data.articles?.list.length).toBeGreaterThanOrEqual(1);

    const byContent = await json<SearchResp>(await app.request(`${BASE}/search?q=CONTENTKW`));
    expect(byContent.data.articles?.list.length).toBeGreaterThanOrEqual(1);

    const miss = await json<SearchResp>(await app.request(`${BASE}/search?q=不存在的词xyz`));
    expect(miss.data.articles?.list ?? []).toHaveLength(0);

    expect((await app.request(`${BASE}/search`)).status).toBe(400);
  });

  it('type=member 搜索命中昵称/用户名，返回 members 且 articles 为 null', async () => {
    await tokenOf('b7mem');
    const memId = await userIdOf('b7mem');
    await getDb().update(users).set({ displayName: 'XKEY昵称' }).where(eq(users.id, memId)).run();

    const res = await json<SearchResp>(await app.request(`${BASE}/search?type=member&q=XKEY`));
    expect(res.data.members?.list.length).toBeGreaterThanOrEqual(1);
    expect(res.data.articles).toBeNull();
    const hit = res.data.members?.list.find((x) => x.nickname === 'XKEY昵称');
    expect(hit).toBeDefined();
  });
});

describe('B7 站点设置', () => {
  it('公开可读；admin 可改；匿名改 401；会员改 403；部分更新不误改', async () => {
    // 公开读（匿名）
    const pub0 = await json<SiteSettingResp>(await app.request(`${BASE}/site/settings`));
    expect(pub0.data.siteName).toBe('成为全栈开发工程师');

    const admin = await tokenOf('b7site1', 'admin');
    expect(
      (
        await app.request(`${BASE}/admin/site/settings`, {
          headers: { Authorization: `Bearer ${admin}` },
        })
      ).status,
    ).toBe(200);

    const patched = await json<SiteSettingResp>(
      await app.request(`${BASE}/admin/site/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ siteName: '新站名' }),
      }),
    );
    expect(patched.data.siteName).toBe('新站名');

    // 公开读反映新值
    const pub1 = await json<SiteSettingResp>(await app.request(`${BASE}/site/settings`));
    expect(pub1.data.siteName).toBe('新站名');

    // 部分更新：仅改 description，siteName 不变
    const part = await json<SiteSettingResp>(
      await app.request(`${BASE}/admin/site/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ siteDescription: '新简介' }),
      }),
    );
    expect(part.data.siteName).toBe('新站名');
    expect(part.data.siteDescription).toBe('新简介');

    // 匿名改 → 401（缺令牌）
    expect(
      (
        await app.request(`${BASE}/admin/site/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteName: 'x' }),
        })
      ).status,
    ).toBe(401);

    // 会员改 → 403（角色不足）
    const member = await tokenOf('b7site2');
    expect(
      (
        await app.request(`${BASE}/admin/site/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member}` },
          body: JSON.stringify({ siteName: 'y' }),
        })
      ).status,
    ).toBe(403);
  });
});
