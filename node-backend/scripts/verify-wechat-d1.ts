/** 仅本机 workerd/D1：真实 batch + 应用 HTTP 流程，微信上游由固定测试桩替代。 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createApp } from '../src/app';
import { readEnv } from '../src/config/env';
import { createD1Db, setDb } from '../src/db/client';

const require = createRequire(
  realpathSync(resolve('../web-frontend/node_modules/wrangler/package.json')),
);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    d1Databases: ['DB'],
  }),
);
try {
  const binding = await mf.getD1Database('DB');
  for (const file of ['0000_windy_songbird.sql', '0001_wechat_credentials.sql']) {
    const source = readFileSync(resolve('migrations', file), 'utf8').replace(/^--.*$/gm, '');
    await binding.batch(
      source
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => binding.prepare(s)),
    );
  }
  setDb(createD1Db(binding));
  const app = createApp(
    readEnv({
      JWT_SECRET: 'local-d1-test',
      NODE_ENV: 'test',
      WECHAT_MINI_APP_ID: 'local-test',
      WECHAT_MINI_APP_SECRET: 'not-real',
    }),
  );
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ openid: 'local-d1-openid', session_key: 'not-returned' });
  const post = (path: string, body: object, token?: string) =>
    app.request(`/api/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const first = await post('/auth/wechat/callback', { code: 'test' });
    assert.equal(first.status, 200);
    const a = (await first.json()) as { data: { accessToken: string; user: { id: number } } };
    const repeated = await post('/auth/wechat/callback', { code: 'test' });
    assert.equal(repeated.status, 200);
    const concurrent = await Promise.all(
      ['d1-a', 'd1-b'].map((username) =>
        post('/me/setup-account', { username, password: 'D1Password123' }, a.data.accessToken),
      ),
    );
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    const row = await binding
      .prepare('SELECT id, username, credentials_configured FROM users')
      .first();
    assert.equal(row.id, a.data.user.id);
    assert.equal(row.credentials_configured, 1);
    assert.equal((await binding.prepare('SELECT COUNT(*) AS n FROM users').first()).n, 1);
    assert.equal(
      (
        await binding
          .prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NULL')
          .first()
      ).n,
      1,
    );
    assert.equal(
      (await post('/auth/login', { username: row.username, password: 'D1Password123' })).status,
      200,
    );
    // 身份唯一冲突必须把前面的用户插入回滚，不留下孤立会员。
    await assert.rejects(
      binding.batch([
        binding.prepare(
          "INSERT INTO users(username,password_hash,created_at,updated_at) VALUES ('orphan','hash',0,0)",
        ),
        binding
          .prepare(
            "INSERT INTO wechat_identities(app_id,open_id,user_id,created_at) VALUES ('local-test','local-d1-openid',?,0)",
          )
          .bind(row.id),
      ]),
    );
    assert.equal(
      (await binding.prepare("SELECT COUNT(*) AS n FROM users WHERE username='orphan'").first()).n,
      0,
    );
    console.log(
      'PASS: local D1 migrations, WeChat stub login, repeated identity, setup CAS, refresh revocation, password login, atomic rollback',
    );
  } finally {
    globalThis.fetch = original;
  }
} finally {
  await mf.dispose();
}
