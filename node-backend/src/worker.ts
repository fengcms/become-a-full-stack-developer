/**
 * src/worker.ts
 * Cloudflare Workers 入口（裁决 Q5）。复用同一套 Hono app，实现"一套代码双部署"。
 * D1 迁移在 deploy 阶段通过 drizzle-kit 应用，运行时不再迁移。
 */
import { createApp } from '@/app';
import { type AppEnv, readEnv } from '@/config/env';
import { createD1Db, setDb } from '@/db/client';

export default {
  /**
   * Workers 请求处理。注入 D1 绑定与校验后的环境，复用 app。
   * @param request 入站请求
   * @param env CF 绑定环境变量
   * @param _ctx 执行上下文（CF 预留，如 ctx.waitUntil）
   */
  async fetch(request: Request, env: AppEnv, _ctx: unknown): Promise<Response> {
    const appEnv = readEnv(env as Record<string, string | undefined>);
    setDb(createD1Db(appEnv.DB as Parameters<typeof createD1Db>[0]));
    return createApp(appEnv).fetch(request, appEnv, _ctx as never);
  },
};
