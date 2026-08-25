/**
 * test/routes/comments.test.ts
 * B4 验收：评论批次 5 端点。
 * 覆盖：自动流默认态（approved/rejected）、公开列表仅见 approved、敏感词→rejected、
 * 未登录发表 401、未发布文章评论/列表 404、admin 改 approved/rejected/reviewing、
 * owner 删自己 / 他人 403 / admin 删他人、后台全状态列表、级联删除子回复。
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

const COMMENTS = '/api/v1/comments';
const ADMIN_COMMENTS = '/api/v1/admin/comments';
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface TokenResp {
  code: number;
  data: { accessToken: string };
}
interface ArticleResp {
  code: number;
  data: { id: number; status: string };
}
interface CommentResp {
  code: number;
  data: { id: number; articleId: number; userId: number; status: string; content: string };
}
interface ListResp {
  code: number;
  data: { list: { id: number; status: string }[]; pagination: { total: number } };
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
const tokenOf = async (username: string, role?: 'admin' | 'editor' | 'member'): Promise<string> => {
  await register(username);
  if (role) {
    await getDb().update(users).set({ role }).where(eq(users.username, username)).run();
  }
  const r = await json<TokenResp>(await login(username));
  return r.data.accessToken;
};
const createArticle = (token: string, payload: Record<string, unknown>) =>
  app.request('/api/v1/articles', {
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
const postComment = (
  articleIdOrSlug: string | number,
  token: string,
  content: string,
  parentId?: number,
) =>
  app.request(`/api/v1/articles/${articleIdOrSlug}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(parentId != null ? { content, parentId } : { content }),
  });

describe('B4 发表评论（自动敏感词过滤）', () => {
  it('干净内容 → 默认 approved，进入公开列表', async () => {
    const admin = await tokenOf('c1', 'admin');
    const artId = await publishArticle(admin, 'A');
    const member = await tokenOf('c1m', 'member');

    const created = await json<CommentResp>(await postComment(artId, member, '写得很棒'));
    expect(created.code).toBe(0);
    expect(created.data.status).toBe('approved');

    const list = await json<ListResp>(await app.request(`/api/v1/articles/${artId}/comments`));
    expect(list.data.list).toHaveLength(1);
    expect(list.data.list[0]?.status).toBe('approved');
  });

  it('命中敏感词 → rejected，不进入公开列表，但后台可见', async () => {
    const admin = await tokenOf('c2', 'admin');
    const artId = await publishArticle(admin, 'B');
    const member = await tokenOf('c2m', 'member');

    const created = await json<CommentResp>(await postComment(artId, member, '这是广告代开发票'));
    expect(created.data.status).toBe('rejected');
    expect(created.data.content).not.toContain('广告');
    expect(created.data.content).not.toContain('代开发票');

    const list = await json<ListResp>(await app.request(`/api/v1/articles/${artId}/comments`));
    expect(list.data.list).toHaveLength(0); // 公开不显示 rejected

    const adminList = await json<ListResp>(
      await app.request(ADMIN_COMMENTS, { headers: { Authorization: `Bearer ${admin}` } }),
    );
    expect(adminList.data.pagination.total).toBe(1);
    expect(adminList.data.list[0]?.status).toBe('rejected');
  });

  it('未登录发表 → 401', async () => {
    const admin = await tokenOf('c3', 'admin');
    const artId = await publishArticle(admin, 'C');
    const res = await postComment(artId, '', 'hi');
    expect(res.status).toBe(401);
  });

  it('未发布文章评论 → 404', async () => {
    const admin = await tokenOf('c4', 'admin');
    const draft = await json<ArticleResp>(
      await createArticle(admin, { title: 'D', content: 'c', status: 'draft' }),
    );
    const member = await tokenOf('c4m', 'member');
    const res = await postComment(draft.data.id, member, 'hi');
    expect(res.status).toBe(404);
  });

  it('parentId 指向不存在评论 → 404', async () => {
    const admin = await tokenOf('c4b', 'admin');
    const artId = await publishArticle(admin, 'Db');
    const member = await tokenOf('c4bm', 'member');
    const res = await postComment(artId, member, '回复一条幽灵评论', 999999);
    expect(res.status).toBe(404);
  });

  it('parentId 指向他文评论 → 404', async () => {
    const admin = await tokenOf('c4c', 'admin');
    const artA = await publishArticle(admin, 'Dc-A');
    const artB = await publishArticle(admin, 'Dc-B');
    const member = await tokenOf('c4cm', 'member');
    const parent = await json<CommentResp>(await postComment(artA, member, 'A 下的评论'));
    const res = await postComment(artB, member, '挂在 B 下却指向 A 的评论', parent.data.id);
    expect(res.status).toBe(404);
  });
});

describe('B4 公开评论列表（仅 approved）', () => {
  it('rejected / reviewing 不出现，仅 approved 可见', async () => {
    const admin = await tokenOf('c5', 'admin');
    const artId = await publishArticle(admin, 'E');
    const member = await tokenOf('c5m', 'member');

    const ok = await json<CommentResp>(await postComment(artId, member, '正常评论'));
    const bad = await json<CommentResp>(await postComment(artId, member, '广告内容'));

    // admin 把 bad 置为 reviewing，验证 reviewing 也不出现在公开列表
    await app.request(`${COMMENTS}/${bad.data.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ status: 'reviewing' }),
    });

    const list = await json<ListResp>(await app.request(`/api/v1/articles/${artId}/comments`));
    expect(list.data.list).toHaveLength(1);
    expect(list.data.list[0]?.id).toBe(ok.data.id);
  });

  it('未发布文章公开列表 → 404（匿名不可见存在性）', async () => {
    const admin = await tokenOf('c6', 'admin');
    const draft = await json<ArticleResp>(
      await createArticle(admin, { title: 'F', content: 'c', status: 'draft' }),
    );
    const res = await app.request(`/api/v1/articles/${draft.data.id}/comments`);
    expect(res.status).toBe(404);
  });
});

describe('B4 人工复核置位（editor+）', () => {
  it('admin 改 approved / rejected / reviewing，approved 时清空 rejectedReason', async () => {
    const admin = await tokenOf('c7', 'admin');
    const artId = await publishArticle(admin, 'G');
    const member = await tokenOf('c7m', 'member');
    const { data: cmt } = await json<CommentResp>(await postComment(artId, member, '广告'));

    const toReviewing = await json<CommentResp>(
      await app.request(`${COMMENTS}/${cmt.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ status: 'reviewing', reason: '待复核' }),
      }),
    );
    expect(toReviewing.data.status).toBe('reviewing');

    const toApproved = await json<CommentResp>(
      await app.request(`${COMMENTS}/${cmt.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ status: 'approved' }),
      }),
    );
    expect(toApproved.data.status).toBe('approved');
    expect(toApproved.data.content).not.toContain('广告');

    // 非 admin/editor 改状态 → 403
    const member2 = await tokenOf('c7m2', 'member');
    const blocked = await app.request(`${COMMENTS}/${cmt.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member2}` },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(blocked.status).toBe(403);
  });
});

describe('B4 删除评论（owner 或 editor+，级联子回复）', () => {
  it('owner 删自己 → 200；他人 member 删 → 403；admin 删他人 → 200', async () => {
    const admin = await tokenOf('c8', 'admin');
    const artId = await publishArticle(admin, 'H');
    const owner = await tokenOf('c8o', 'member');
    const stranger = await tokenOf('c8s', 'member');

    const { data: cmt } = await json<CommentResp>(await postComment(artId, owner, '我的评论'));

    const selfDel = await app.request(`${COMMENTS}/${cmt.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner}` },
    });
    expect(selfDel.status).toBe(200);

    // 重新发一条，验证陌生人 403、admin 200
    const { data: cmt2 } = await json<CommentResp>(await postComment(artId, owner, '第二条'));
    const strangerDel = await app.request(`${COMMENTS}/${cmt2.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${stranger}` },
    });
    expect(strangerDel.status).toBe(403);

    const adminDel = await app.request(`${COMMENTS}/${cmt2.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(adminDel.status).toBe(200);
  });

  it('级联删除子回复：删父评论后其子回复一并消失', async () => {
    const admin = await tokenOf('c9', 'admin');
    const artId = await publishArticle(admin, 'I');
    const member = await tokenOf('c9m', 'member');

    const parent = await json<CommentResp>(await postComment(artId, member, '父评论'));
    await postComment(artId, member, '子回复', parent.data.id);

    await app.request(`${COMMENTS}/${parent.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${member}` },
    });

    const adminList = await json<ListResp>(
      await app.request(`${ADMIN_COMMENTS}?articleId=${artId}`, {
        headers: { Authorization: `Bearer ${admin}` },
      }),
    );
    expect(adminList.data.pagination.total).toBe(0); // 父 + 子均被级联删除
  });
});

describe('B4 后台评论列表（全状态，editor+）', () => {
  it('可按 status 筛选；非 editor 访问 → 403', async () => {
    const admin = await tokenOf('c10', 'admin');
    const artId = await publishArticle(admin, 'J');
    const member = await tokenOf('c10m', 'member');
    await postComment(artId, member, '正常');
    await postComment(artId, member, '广告');

    const allList = await json<ListResp>(
      await app.request(ADMIN_COMMENTS, { headers: { Authorization: `Bearer ${admin}` } }),
    );
    expect(allList.data.pagination.total).toBe(2);

    const rejectedOnly = await json<ListResp>(
      await app.request(`${ADMIN_COMMENTS}?status=rejected`, {
        headers: { Authorization: `Bearer ${admin}` },
      }),
    );
    expect(rejectedOnly.data.pagination.total).toBe(1);
    expect(rejectedOnly.data.list[0]?.status).toBe('rejected');

    const blocked = await app.request(ADMIN_COMMENTS, {
      headers: { Authorization: `Bearer ${member}` },
    });
    expect(blocked.status).toBe(403);
  });
});
