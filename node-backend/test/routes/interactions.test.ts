/**
 * test/routes/interactions.test.ts
 * B6 验收：收藏 / 历史 / 点赞 / 通知（15 端点）。
 * 覆盖：收藏增删查 + 幂等 + 未发布 404、history upsert 不重复、like 切换与状态、notification 未读计数随已读变化、
 * 越权访问他人数据被拒（404 而非 403，不泄露存在性）。
 */
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, getDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';
import { notifications, users } from '@/db/schema';

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
  data: { id: number; status: string };
}
interface ListResp<T> {
  code: number;
  data: { list: T[]; pagination: { total: number } };
}
interface CountResp {
  code: number;
  data: { count: number };
}
interface LikeStatusResp {
  code: number;
  data: { liked: boolean; likeCount: number };
}

const register = (username: string, password = 'password123') =>
  app.request(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password }),
  });
const login = (username: string, password = 'password123') =>
  app.request(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
// 提权必须在登录之前（JWT 角色是登录快照）
const tokenOf = async (username: string, role?: 'admin' | 'editor' | 'member'): Promise<string> => {
  await register(username);
  if (role) await getDb().update(users).set({ role }).where(eq(users.username, username)).run();
  const r = await json<TokenResp>(await login(username));
  return r.data.accessToken;
};
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request(`${BASE}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
const publishArticle = async (token: string, title: string): Promise<number> => {
  const r = await json<ArticleResp>(
    await createArticle(token, { title, content: 'c', status: 'published' }),
  );
  return r.data.id;
};
/** 取已注册用户 id（测试辅助，直查 DB，抛错保证非空）。 */
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

/** 直接写入一条通知（B6 仅实现读取端，生成逻辑不在范围内，测试用 DB 直插模拟）。 */
const seedNotification = (
  userId: number,
  opts: { isRead?: boolean; type?: string; title?: string } = {},
) =>
  getDb()
    .insert(notifications)
    .values({
      userId,
      type: (opts.type ?? 'system') as 'article_published' | 'comment_approved' | 'system',
      title: opts.title ?? '测试通知',
      isRead: opts.isRead ?? false,
      createdAt: new Date(),
    })
    .run();

describe('B6 收藏', () => {
  it('收藏 → 列表可见 → 取消收藏（仅本人）', async () => {
    const u = await tokenOf('b6f1');
    const admin = await tokenOf('b6f2', 'admin');
    const aid = await publishArticle(admin, 'Fav');
    expect(
      (
        await app.request(`${BASE}/me/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
          body: JSON.stringify({ articleId: aid }),
        })
      ).status,
    ).toBe(200);
    // 重复收藏幂等
    expect(
      (
        await app.request(`${BASE}/me/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
          body: JSON.stringify({ articleId: aid }),
        })
      ).status,
    ).toBe(200);
    const list = await json<ListResp<{ id: number }>>(
      await app.request(`${BASE}/me/favorites`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    expect(list.data.list).toHaveLength(1);
    expect(list.data.pagination.total).toBe(1);
    // 取消
    expect(
      (
        await app.request(`${BASE}/me/favorites/${aid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
    const after = await json<ListResp<unknown>>(
      await app.request(`${BASE}/me/favorites`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    expect(after.data.list).toHaveLength(0);
    // 取消不存在的收藏仍 200（幂等）
    expect(
      (
        await app.request(`${BASE}/me/favorites/${aid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
  });

  it('未登录收藏 → 401；收藏未发布文章 → 404', async () => {
    const admin = await tokenOf('b6f3', 'admin');
    const draft = await json<ArticleResp>(
      await createArticle(admin, { title: 'D', content: 'c', status: 'draft' }),
    );
    expect(
      (
        await app.request(`${BASE}/me/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: draft.data.id }),
        })
      ).status,
    ).toBe(401);
    const u = await tokenOf('b6f4');
    expect(
      (
        await app.request(`${BASE}/me/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
          body: JSON.stringify({ articleId: draft.data.id }),
        })
      ).status,
    ).toBe(404);
  });
});

describe('B6 阅读历史', () => {
  it('上报 upsert 不重复，仅更新 lastReadAt', async () => {
    const u = await tokenOf('b6h1');
    const admin = await tokenOf('b6h2', 'admin');
    const aid = await publishArticle(admin, 'Hist');
    const body = { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` };
    await app.request(`${BASE}/me/history`, {
      method: 'POST',
      headers: body,
      body: JSON.stringify({ articleId: aid, progress: 10 }),
    });
    await app.request(`${BASE}/me/history`, {
      method: 'POST',
      headers: body,
      body: JSON.stringify({ articleId: aid, progress: 80 }),
    });
    const list = await json<ListResp<{ progress: number | null; lastReadAt: string }>>(
      await app.request(`${BASE}/me/history`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    expect(list.data.list).toHaveLength(1);
    const hist = list.data.list[0];
    if (!hist) throw new Error('expected 1 history item');
    expect(hist.progress).toBe(80);
    // 清空
    expect(
      (
        await app.request(`${BASE}/me/history`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
    const after = await json<ListResp<unknown>>(
      await app.request(`${BASE}/me/history`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    expect(after.data.list).toHaveLength(0);
  });

  it('删除单条历史幂等；未登录 → 401', async () => {
    const u = await tokenOf('b6h3');
    const admin = await tokenOf('b6h4', 'admin');
    const aid = await publishArticle(admin, 'Hist2');
    await app.request(`${BASE}/me/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
      body: JSON.stringify({ articleId: aid }),
    });
    expect(
      (
        await app.request(`${BASE}/me/history/${aid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`${BASE}/me/history/${aid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`${BASE}/me/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: aid }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('B6 点赞', () => {
  it('点赞 → 状态 liked=true 且 likeCount+1；取消 → liked=false 且 -1；均幂等', async () => {
    const u = await tokenOf('b6l1');
    const admin = await tokenOf('b6l2', 'admin');
    const aid = await publishArticle(admin, 'Like');
    const statusUrl = `${BASE}/articles/${aid}/like/status`;
    const before = await json<LikeStatusResp>(await app.request(statusUrl));
    expect(before.data).toEqual({ liked: false, likeCount: 0 });
    // 点赞
    const liked = await json<LikeStatusResp>(
      await app.request(`${BASE}/articles/${aid}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(liked.data).toEqual({ liked: true, likeCount: 1 });
    // 重复点赞幂等
    const liked2 = await json<LikeStatusResp>(
      await app.request(`${BASE}/articles/${aid}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(liked2.data).toEqual({ liked: true, likeCount: 1 });
    // 我的点赞列表含该文（裸数组）
    const mine = await json<{ code: number; data: { id: number }[] }>(
      await app.request(`${BASE}/me/likes`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    expect(Array.isArray(mine.data)).toBe(true);
    expect(mine.data.some((a) => a.id === aid)).toBe(true);
    // 取消
    const unliked = await json<LikeStatusResp>(
      await app.request(`${BASE}/articles/${aid}/like`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(unliked.data).toEqual({ liked: false, likeCount: 0 });
    // 再取消幂等
    const unliked2 = await json<LikeStatusResp>(
      await app.request(`${BASE}/articles/${aid}/like`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(unliked2.data).toEqual({ liked: false, likeCount: 0 });
  });

  it('like/status 公开（匿名 liked=false）；点赞不存在文章 → 404', async () => {
    const admin = await tokenOf('b6l3', 'admin');
    const aid = await publishArticle(admin, 'LikePub');
    const anon = await json<LikeStatusResp>(
      await app.request(`${BASE}/articles/${aid}/like/status`),
    );
    expect(anon.data).toEqual({ liked: false, likeCount: 0 });
    expect(
      (
        await app.request(`${BASE}/articles/999999/like`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${admin}` },
        })
      ).status,
    ).toBe(404);
  });
});

describe('B6 通知', () => {
  it('未读计数随已读变化；PATCH 非本人 → 404', async () => {
    const u = await tokenOf('b6n1');
    const other = await tokenOf('b6n2');
    const myId = await userIdOf('b6n1');
    const otherId = await userIdOf('b6n2');
    seedNotification(myId, { isRead: false });
    seedNotification(myId, { isRead: false });
    seedNotification(otherId, { isRead: false });
    const cnt = await json<CountResp>(
      await app.request(`${BASE}/me/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(cnt.data.count).toBe(2);
    // 全部已读
    expect(
      (
        await app.request(`${BASE}/me/notifications/read-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${u}` },
        })
      ).status,
    ).toBe(200);
    const cnt2 = await json<CountResp>(
      await app.request(`${BASE}/me/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(cnt2.data.count).toBe(0);
    // 列表 + isRead 筛选
    const list = await json<ListResp<{ id: number; isRead: boolean }>>(
      await app.request(`${BASE}/me/notifications?isRead=false`, {
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(list.data.list).toHaveLength(0);
    // PATCH 他人通知 → 404（不泄露存在性）
    const others = await json<ListResp<{ id: number }>>(
      await app.request(`${BASE}/me/notifications`, {
        headers: { Authorization: `Bearer ${other}` },
      }),
    );
    const targetRow = others.data.list[0];
    if (!targetRow) throw new Error('expected other notification');
    const targetId = targetRow.id;
    expect(
      (
        await app.request(`${BASE}/me/notifications/${targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
          body: JSON.stringify({ isRead: true }),
        })
      ).status,
    ).toBe(404);
  });

  it('标记单条已读后未读计数 -1', async () => {
    const u = await tokenOf('b6n3');
    const myId = await userIdOf('b6n3');
    seedNotification(myId, { isRead: false });
    seedNotification(myId, { isRead: false });
    const list = await json<ListResp<{ id: number }>>(
      await app.request(`${BASE}/me/notifications`, { headers: { Authorization: `Bearer ${u}` } }),
    );
    const firstRow = list.data.list[0];
    if (!firstRow) throw new Error('expected notification');
    const firstId = firstRow.id;
    expect(
      (
        await app.request(`${BASE}/me/notifications/${firstId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u}` },
          body: JSON.stringify({ isRead: true }),
        })
      ).status,
    ).toBe(200);
    const cnt = await json<CountResp>(
      await app.request(`${BASE}/me/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${u}` },
      }),
    );
    expect(cnt.data.count).toBe(1);
  });
});
