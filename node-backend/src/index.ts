/**
 * src/index.ts
 * Node 运行时入口（@hono/node-server）。本地开发 / 自管 Linux 部署走这里。
 * Cloudflare Workers 入口见 src/worker.ts，复用同一套 createApp。
 */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { readEnv } from './config/env';
import { createLocalDb, setDb } from './db/client';
import { migrate } from './db/migrate';

const env = readEnv(process.env as Record<string, string | undefined>);
const db = createLocalDb(env.DB_FILE);
migrate(db);
setDb(db);

const app = createApp(env);
const port = Number(env.PORT);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[node-backend] listening on http://localhost:${info.port}`);
});
