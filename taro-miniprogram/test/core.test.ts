import test from "node:test";
import assert from "node:assert/strict";
import { DataCache, cache, privateCache } from "../src/core/cache";
import { api } from "../src/core/api";
import { session, sessionEpoch, setSession } from "../src/core/session";
import { parseMarkdown, highlight } from "../src/core/markdown";
import { groupComments } from "../src/core/comments";
import {
  deleteDraft,
  draftPayload,
  emptyDraft,
  readDraft,
  saveDraft,
  validateDraft,
} from "../src/core/drafts";
import { mockRequest } from "./taro-mock";
import type { Auth, Comment } from "../src/core/models";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const auth = (id: number, token = "old"): Auth => ({
  user: { id, username: `member${id}`, nickname: null, avatar: null, level: 1, role: "member" },
  accessToken: token,
  refreshToken: `refresh-${token}`,
  expiresIn: 900,
});
const ok = (data: unknown) => ({ statusCode: 200, data: { code: 0, data } });
const expired = () => ({ statusCode: 401, data: { code: 1002, message: "expired" } });

test("缓存复用、强刷与并发请求合并", async () => {
  const c = new DataCache(),
    wait = deferred<number>();
  let calls = 0;
  const fetcher = () => {
    calls++;
    return wait.promise;
  };
  const a = c.read("key", fetcher),
    b = c.read("key", fetcher);
  wait.resolve(3);
  assert.deepEqual(await Promise.all([a, b]), [3, 3]);
  assert.equal(calls, 1);
  assert.equal(await c.read("key", async () => 4), 3);
  assert.equal(await c.read("key", async () => 4, 60000, true), 4);
});
test("失效栅栏阻止旧请求填回，有界逐出", async () => {
  const c = new DataCache(2),
    wait = deferred<number>();
  const pending = c.read("a", () => wait.promise);
  c.clear();
  wait.resolve(1);
  await pending;
  assert.equal(await c.read("a", async () => 2), 2);
  await c.read("b", async () => 3);
  await c.read("c", async () => 4);
  assert.equal(await c.read("a", async () => 5), 5);
});
test("失效权限响应驱逐旧缓存", async () => {
  const c = new DataCache();
  await c.read("a", async () => "private");
  await assert.rejects(
    c.read(
      "a",
      async () => {
        throw new Error("404");
      },
      60000,
      true,
    ),
  );
  assert.equal(await c.read("a", async () => "new"), "new");
});
test("单飞刷新，两次失败请求只交换一次 refresh", async () => {
  setSession(auth(1));
  let refresh = 0;
  mockRequest(async (o) => {
    if (o.url.endsWith("/auth/refresh")) {
      refresh++;
      await new Promise((r) => setTimeout(r, 5));
      return ok(auth(1, "new"));
    }
    return o.header.Authorization === "Bearer old" ? expired() : ok("accepted");
  });
  assert.deepEqual(await Promise.all([api("/me/profile"), api("/me/notifications")]), [
    "accepted",
    "accepted",
  ]);
  assert.equal(refresh, 1);
});
test("切换账号后旧请求不能返回私有值或覆盖新会话", async () => {
  setSession(auth(1));
  const wait = deferred<unknown>();
  mockRequest(async () => wait.promise);
  const old = api("/me/profile");
  setSession(auth(2));
  wait.resolve(ok("private-old"));
  await assert.rejects(old, /账号已切换/);
  assert.equal(session()?.user.id, 2);
});
test("网络失败不重试写请求", async () => {
  setSession(auth(1));
  let calls = 0;
  mockRequest(async () => {
    calls++;
    throw new Error("timeout");
  });
  await assert.rejects(api("/articles", "POST", {}));
  assert.equal(calls, 1);
});
test("阅读历史上报不驱逐公共阅读缓存", async () => {
  setSession(auth(1));
  await cache.read("public", async () => 1);
  const before = cache.revision(),
    priv = privateCache.revision();
  mockRequest(async () => ok({}));
  await api("/me/history", "POST", { articleId: 1 });
  assert.equal(cache.revision(), before);
  assert.ok(privateCache.revision() > priv);
});
test("草稿按账号与稿件隔离，载荷标签去重", () => {
  const d = { ...emptyDraft(), title: "标题", content: "正文", tags: "React，React, TS" };
  saveDraft(1, "new", d);
  assert.equal(readDraft(2, "new"), null);
  assert.equal(readDraft(1, "3"), null);
  assert.equal(readDraft(1, "new")?.title, "标题");
  assert.deepEqual(draftPayload(d).tags, ["React", "TS"]);
  assert.equal(validateDraft(d), "");
  assert.ok(validateDraft(emptyDraft()));
  deleteDraft(1, "new");
  assert.equal(readDraft(1, "new"), null);
});
test("Markdown 目录唯一、代码语言与高亮、HTML 不执行", () => {
  const parsed = parseMarkdown(
    "# 标题\n## 标题\n<script>alert(1)</script>\n```typescript\nconst a = 1\n```",
  );
  assert.deepEqual(
    parsed.headings.map((h) => h.id),
    ["heading-0", "heading-1"],
  );
  assert.equal(
    parsed.nodes.some((n) => n.type === "html_block"),
    false,
  );
  assert.ok(highlight("const a = 1", "typescript").includes("style="));
  assert.equal(highlight("<script>", "unknown"), "&lt;script&gt;");
});
test("评论多层归并、缺失父楼与循环保护", () => {
  const c = (id: number, parentId: number | null): Comment => ({
    id,
    parentId,
    userId: 1,
    userName: "会员",
    content: "hi",
    createdAt: "2026-10-07",
    status: "approved",
  });
  const groups = groupComments([c(3, 2), c(1, null), c(2, 1), c(4, 9)]);
  assert.equal(groups.find((g) => g.id === 1)?.replies.length, 2);
  assert.equal(groups.find((g) => g.id === 9)?.root, undefined);
  assert.equal(
    groupComments([c(1, 2), c(2, 1)]).flatMap((g) => [...(g.root ? [g.root] : []), ...g.replies])
      .length >= 2,
    true,
  );
});
test("退出会话增加代际并保持公共缓存", () => {
  const old = sessionEpoch(),
    version = cache.revision();
  setSession(null);
  assert.ok(sessionEpoch() > old);
  assert.equal(cache.revision(), version);
});
