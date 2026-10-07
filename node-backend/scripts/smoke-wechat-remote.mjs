/** 明确允许后才创建一次性测试会员；不模拟线上微信接口、不记录令牌。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const api = 'https://api-befull.kao9.com/api/v1';
const wrangler = resolve('../web-frontend/node_modules/.bin/wrangler');
const report = { target: api, realWechatLogin: 'NOT_TESTED_MISSING_CONFIGURATION', checks: [] };
async function post(path, data, token) {
  const r = await fetch(api + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  return { status: r.status, body: await r.json(), cookie: r.headers.has('set-cookie') };
}
function sql(command) {
  const output = execFileSync(wrangler, ['d1', 'execute', 'node-backend', '--config', 'wrangler.toml', '--remote', '--command', command, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}
assert.equal((await post('/me/setup-account', { username: 'probe', password: 'ProbePassword123' })).status, 401);
assert.equal((await post('/auth/wechat/callback', {})).status, 400);
const unavailable = await post('/auth/wechat/callback', { code: 'not-a-real-wechat-code' });
assert.equal(unavailable.status, 500); assert.equal(unavailable.body.code, 5000);
report.checks.push('setup requires authentication', 'callback validates body', 'missing WeChat configuration fails closed');
if (process.env.ALLOW_REMOTE_WRITE !== '1') {
  console.log(JSON.stringify(report, null, 2)); process.exit(0);
}
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
const initialName = `m5test_${suffix}`, finalName = `m5set_${suffix}`;
const password = randomUUID() + 'A1';
let userId;
try {
  const registered = await post('/auth/register', { username: initialName, email: `${initialName}@example.invalid`, password });
  assert.equal(registered.status, 200);
  const original = registered.body.data; userId = original.user.id;
  assert.ok(Number.isSafeInteger(userId)); assert.equal(original.user.canSetCredentials, false);
  // 仅为新建的一次性测试用户构造待设置状态，用于测真实 Worker/D1 设置流程。
  // 这是数据库测试夹具，不是微信 code 交换成功，不与任何真实 OpenID 关联。
  sql(`INSERT INTO wechat_identities(app_id,open_id,user_id,created_at) VALUES ('integration-fixture','${suffix}',${userId},${Date.now()}); UPDATE users SET credentials_configured=0 WHERE id=${userId} AND username='${initialName}';`);
  const setup = await post('/me/setup-account', { username: finalName, password }, original.accessToken);
  assert.equal(setup.status, 200); assert.equal(setup.cookie, true);
  assert.equal(setup.body.data.user.id, userId); assert.equal(setup.body.data.user.canSetCredentials, false);
  assert.equal(setup.body.data.user.nickname, original.user.nickname);
  assert.equal((await post('/me/setup-account', { username: finalName, password }, setup.body.data.accessToken)).status, 409);
  const login = await post('/auth/login', { username: finalName, password });
  assert.equal(login.status, 200); assert.equal(login.body.data.user.id, userId);
  assert.equal((await post('/auth/refresh', { refreshToken: original.refreshToken })).status, 401);
  report.checks.push('legacy registration', 'setup on explicit synthetic fixture', 'stable userId and nickname', 'refresh cookie', 'repeat setup rejected', 'password login', 'old refresh revoked');
} finally {
  if (userId) {
    const guard = `SELECT id FROM users WHERE id=${userId} AND username IN ('${initialName}','${finalName}')`;
    sql(`DELETE FROM wechat_identities WHERE user_id IN (${guard}) AND app_id='integration-fixture' AND open_id='${suffix}'; DELETE FROM refresh_tokens WHERE user_id IN (${guard}); DELETE FROM users WHERE id IN (${guard});`);
    const remaining = sql(`SELECT COUNT(*) AS remaining FROM users WHERE id=${userId};`)[0].results[0].remaining;
    assert.equal(remaining, 0); report.checks.push('test fixture removed');
  }
}
console.log(JSON.stringify(report, null, 2));
