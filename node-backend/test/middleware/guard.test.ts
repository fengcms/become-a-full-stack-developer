/**
 * test/middleware/guard.test.ts
 * 守卫工厂单测（审阅 B07）：验证第 4 铁律 ④(a) 角色阶梯 与 ④(b) ownerOverride 的放行 / 拒绝。
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { type AuthUser, type AuthVars, guard } from '@/middleware/auth';
import { errorHandler } from '@/middleware/error';

/** 构造一个注入了指定用户的 Hono 应用，挂载两种守卫路由。 */
const buildApp = (user: AuthUser): Hono<AuthVars> => {
  const app = new Hono<AuthVars>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('user', user);
    await next();
  });
  app.get('/editor', guard('editor'), (c) => c.json({ ok: true }));
  // ownerOverride：资源归属固定为 'u1'，member 仅当自身为 u1 时放行
  app.get(
    '/owner',
    guard('admin', () => 'u1'),
    (c) => c.json({ ok: true }),
  );
  return app;
};

describe('guard 第 4 铁律', () => {
  it('④(a) member 被 editor 守卫拒绝 → 403', async () => {
    const res = await buildApp({ id: 'u9', role: 'member' }).request('/editor');
    expect(res.status).toBe(403);
  });

  it('④(a) editor 通过 editor 守卫 → 200', async () => {
    const res = await buildApp({ id: 'u9', role: 'editor' }).request('/editor');
    expect(res.status).toBe(200);
  });

  it('④(a) admin 通过 editor 守卫 → 200（角色阶梯向上兼容）', async () => {
    const res = await buildApp({ id: 'u9', role: 'admin' }).request('/editor');
    expect(res.status).toBe(200);
  });

  it('④(b) member 非属主被 admin 守卫拒绝 → 403', async () => {
    const res = await buildApp({ id: 'u2', role: 'member' }).request('/owner');
    expect(res.status).toBe(403);
  });

  it('④(b) member 属主经 ownerOverride 放行 → 200', async () => {
    const res = await buildApp({ id: 'u1', role: 'member' }).request('/owner');
    expect(res.status).toBe(200);
  });
});
