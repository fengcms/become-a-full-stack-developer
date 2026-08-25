/**
 * src/index.ts
 * Node 运行时入口（@hono/node-server）。本地开发 / 自管 Linux 部署走这里。
 * Cloudflare Workers 入口见 src/worker.ts，复用同一套 createApp（双部署，裁决 Q5）。
 */
import { serve } from '@hono/node-server';
import { createApp } from '@/app';
import { readEnv } from '@/config/env';
import { createLocalDb, setDb } from '@/db/client';
import { migrate } from '@/db/migrate';

const env = readEnv(process.env as Record<string, string | undefined>);
const db = createLocalDb(env.DB_FILE);

// 审阅 B03：migrate 为异步建表，必须 await 后再起服，避免"带空表起服 / 建表未完首请求即失败"的竞态。
// 顶层 await 在 ESM + Node 22 下原生支持；若运行环境不支持可改为 async main() 包裹。
await migrate(db);
setDb(db);

const app = createApp(env);
const port = Number(env.PORT);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[node-backend] listening on http://localhost:${info.port}`);
});
