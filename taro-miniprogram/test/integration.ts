import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api, read } from "../src/core/api";
import { setSession, session, API } from "../src/core/session";
import { mockRequest } from "./taro-mock";
import { draftPayload, emptyDraft } from "../src/core/drafts";
import { groupComments } from "../src/core/comments";
import type { Auth, Article, Page, Comment } from "../src/core/models";
mockRequest(async (options) => {
  const response = await fetch(options.url, {
    method: options.method,
    headers: options.header,
    body: options.data === undefined ? undefined : JSON.stringify(options.data),
  });
  return { statusCode: response.status, data: await response.json() };
});
const checks: string[] = [];
const suffix = randomUUID().slice(0, 8),
  password = randomUUID() + "A1";
const first = await api<Auth>(
  "/auth/register",
  "POST",
  { username: `mini_test_${suffix}`, email: `${suffix}@example.invalid`, password },
  false,
);
setSession(first);
const userId = first.user.id;
checks.push("真实后端注册与会话保存");
await api("/me/profile", "PATCH", { nickname: "小程序集成测试" });
assert.equal((await api<{ nickname: string }>("/me/profile")).nickname, "小程序集成测试");
checks.push("资料更新");
let article = await api<Article>("/articles", "POST", {
  ...draftPayload({
    ...emptyDraft(),
    title: "临时验证文章",
    content: "# 标题\n```ts\nconst x = 1\n```",
  }),
  status: "draft",
});
const articleId = article.id;
article = await api<Article>(`/articles/${articleId}`, "PUT", { summary: "保存后修改同一篇文章" });
assert.equal(article.id, articleId);
article = await api<Article>(`/articles/${articleId}/submit`, "POST");
assert.equal(article.status, "pending");
await api(`/articles/${articleId}`, "PUT", { status: "draft" });
checks.push("草稿创建、固定ID更新、提交与撤回");
// 测试脚本请求夹具服务只允许操作本次临时数据库中的稿件。
await fetch(`${API}/test/publish/${articleId}`, { method: "POST" });
assert.equal((await read<Article>(`/articles/${articleId}`)).status, "published");
await api(`/articles/${articleId}/like`, "POST");
assert.equal(
  (await api<{ liked: boolean; likeCount: number }>(`/articles/${articleId}/like/status`))
    .likeCount,
  1,
);
await api("/me/favorites", "POST", { articleId });
assert.equal((await read<Page<Article>>("/me/favorites", true, true)).list[0].id, articleId);
await api("/me/history", "POST", { articleId, progress: 42 });
assert.equal((await api<Page<{ progress: number }>>("/me/history")).list[0].progress, 42);
checks.push("点赞计数、收藏与阅读进度");
const comment = await api<Comment>(`/articles/${articleId}/comments`, "POST", {
  content: "测试主楼",
});
const reply = await api<Comment>(`/articles/${articleId}/comments`, "POST", {
  content: "测试回复",
  parentId: comment.id,
});
const comments = await read<Page<Comment>>(`/articles/${articleId}/comments`, true);
assert.equal(
  groupComments(comments.list).find((g) => g.id === comment.id)?.replies[0].id,
  reply.id,
);
await api(`/comments/${comment.id}`, "DELETE");
assert.equal((await read<Page<Comment>>(`/articles/${articleId}/comments`, true)).list.length, 0);
checks.push("评论回复叠楼与级联删除");
const second = await api<Auth>(
  "/auth/register",
  "POST",
  { username: `mini_other_${suffix}`, email: `other_${suffix}@example.invalid`, password },
  false,
);
setSession(second);
assert.equal((await read<Page<Article>>("/me/favorites", false, true)).list.length, 0);
await assert.rejects(api(`/articles/${articleId}`, "PUT", { title: "越权" }));
setSession(first);
await api(`/articles/${articleId}/like`, "DELETE");
await api(`/me/favorites/${articleId}`, "DELETE");
await api("/me/history", "DELETE");
await api(`/articles/${articleId}`, "DELETE");
checks.push("双账号数据隔离与越权拒绝、测试内容删除");
const login = await api<Auth>(
  "/auth/login",
  "POST",
  { username: first.user.username, password },
  false,
);
setSession(login);
await api("/auth/logout", "POST");
setSession(null);
assert.equal(session(), null);
checks.push("密码登录与退出");
console.log(JSON.stringify({ target: API, isolatedDatabase: true, userId, checks }, null, 2));
