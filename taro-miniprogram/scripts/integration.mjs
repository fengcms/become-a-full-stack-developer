import { build } from "esbuild";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const backend = resolve("../node-backend");
const temp = mkdtempSync(join(tmpdir(), "befull-mini-integration-"));
const entry = resolve("../node-backend/.wrangler/miniprogram-test-server.ts");
mkdirSync(resolve("../node-backend/.wrangler"), { recursive: true });
writeFileSync(
  entry,
  `import { serve } from '@hono/node-server';
import { createApp } from '../src/app';
import { createLocalDb, setDb } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { readEnv } from '../src/config/env';
import { sql } from 'drizzle-orm';
const db = createLocalDb(process.env.DB_FILE!); await migrate(db); setDb(db);
const app = createApp(readEnv(process.env));
app.post('/api/v1/test/publish/:id', async c => { const id=Number(c.req.param('id')); await db.run(sql\`UPDATE articles SET status='published', published_at=\${Date.now()} WHERE id=\${id}\`); return c.json({ok:true}); });
serve({fetch:app.fetch,port:13997,hostname:"127.0.0.1"}); console.log('READY');
`,
);
const server = spawn(process.execPath, [resolve(backend, "node_modules/tsx/dist/cli.mjs"), entry], {
  cwd: backend,
  env: {
    ...process.env,
    NODE_ENV: "test",
    DB_FILE: join(temp, "db.sqlite"),
    JWT_SECRET: "isolated-integration-only-key",
    PORT: "13997",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("server startup timeout")), 15000);
    server.stdout.on("data", (b) => {
      if (b.toString().includes("READY")) {
        clearTimeout(timer);
        res();
      }
    });
    server.stderr.on("data", (b) => process.stderr.write(b));
    server.on("exit", (code) => {
      clearTimeout(timer);
      rej(new Error("server exited " + code));
    });
  });
  mkdirSync(".test-build", { recursive: true });
  await build({
    entryPoints: ["test/integration.ts"],
    outfile: ".test-build/integration.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    define: { __API_BASE__: JSON.stringify("http://127.0.0.1:13997/api/v1") },
    alias: { "@tarojs/taro": resolve("test/taro-mock.ts") },
  });
  // ESM bundle React CJS requires a native require shim.
  execFileSync(process.execPath, [".test-build/integration.mjs"], { stdio: "inherit" });
} finally {
  server.kill();
  rmSync(entry, { force: true });
  rmSync(temp, { recursive: true, force: true });
}
