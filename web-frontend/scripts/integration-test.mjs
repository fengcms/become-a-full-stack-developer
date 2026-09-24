/** @file Real API/proxy regression suite. Writes only to the isolated local preview backend. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const port = process.env.PREVIEW_PORT || '13001'
if (!['13001', '13002'].includes(port)) throw new Error('Only isolated preview ports are allowed')
const base = `http://127.0.0.1:${port}`
let cookie = ''
let token = ''
const checks = []
const call = async (path, method = 'GET', body, overrides = {}) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...overrides,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json()
  return { res, json, data: json.data }
}
const ok = async (name, fn) => {
  await fn()
  checks.push(name)
  console.log('PASS', name)
}
let first, second, articleId, user
await ok('proxy preserves page and pageSize', async () => {
  first = await call('/articles?page=1&pageSize=2')
  second = await call('/articles?page=2&pageSize=2')
  assert.equal(first.data.list.length, 2)
  assert.equal(second.data.pagination.page, 2)
  assert.notEqual(first.data.list[0].id, second.data.list[0].id)
  articleId = first.data.list[0].id
})
await ok('category tree and descendant filtering', async () => {
  const tree = await call('/categories/tree')
  assert.ok(tree.data[0].children[0].children[0].children.length)
  const scoped = await call('/articles?category=frontend&pageSize=100')
  assert.ok(scoped.data.pagination.total > 0)
  assert.ok(scoped.data.list.every((a) => ['React', '工程实践'].includes(a.categoryName)))
})
await ok('full-text search and tag filtering', async () => {
  const search = await call('/search?q=React&type=article')
  assert.ok(search.data.articles.list.length)
  const tag = await call('/articles?tag=nodejs&pageSize=100')
  assert.ok(tag.data.list.length)
})
await ok('cross-site writes are rejected', async () => {
  const r = await call('/auth/refresh', 'POST', {}, { Origin: 'https://unrelated.invalid' })
  assert.equal(r.res.status, 403)
})
const credentials = {
  username: `codex_reader_${Date.now()}`,
  password: 'PreviewOnly2026!',
  email: `codex-${Date.now()}@example.test`,
  nickname: '林同学',
}
await ok('registration and isolated HttpOnly cookie', async () => {
  const r = await call('/auth/register', 'POST', credentials)
  assert.equal(r.json.code, 0)
  assert.equal(r.data.refreshToken, undefined)
  const raw = r.res.headers.get('set-cookie')
  assert.ok(raw.startsWith('codex_refresh='))
  assert.match(raw, /HttpOnly/i)
  assert.match(raw, /SameSite=Lax/i)
  cookie = raw.split(';')[0]
  token = r.data.accessToken
  user = r.data.user
})
await ok('profile edits are reflected by the server', async () => {
  assert.equal((await call('/me/profile')).data.id, user.id)
  const r = await call('/me/profile', 'PATCH', { nickname: '林同学' })
  assert.equal(r.data.nickname, '林同学')
})
await ok('like/status, favorite and history round-trip', async () => {
  assert.equal((await call(`/articles/${articleId}/like/status`)).data.liked, false)
  assert.equal((await call(`/articles/${articleId}/like`, 'POST', {})).data.liked, true)
  await call('/me/favorites', 'POST', { articleId })
  assert.ok((await call('/me/favorites')).data.list.some((a) => a.id === articleId))
  await call('/me/history', 'POST', { articleId, progress: 40 })
  assert.equal((await call('/me/history')).data.list[0].progress, 40)
})
await ok('comments, reply and delete obey the contract', async () => {
  const c = await call(`/articles/${articleId}/comments`, 'POST', {
    content: '独立联调：评论交互正常。',
  })
  assert.equal(c.json.code, 0)
  const reply = await call(`/articles/${articleId}/comments`, 'POST', {
    content: '独立联调：回复正常。',
    parentId: c.data.id,
  })
  assert.equal(reply.json.code, 0)
  assert.equal((await call(`/comments/${reply.data.id}`, 'DELETE')).json.code, 0)
})
await ok('member article status and notification endpoints', async () => {
  await call('/articles', 'POST', {
    title: '独立联调草稿',
    content: '用于验证我的文章状态',
    status: 'draft',
  })
  const mine = await call('/me/articles?status=draft')
  assert.ok(mine.data.list.some((a) => a.title === '独立联调草稿'))
  assert.equal((await call('/me/notifications?isRead=false&pageSize=10')).json.code, 0)
  assert.equal((await call('/me/notifications/read-all', 'POST', {})).json.code, 0)
})
await ok('refresh rotates the cookie without exposing refresh tokens', async () => {
  const r = await call('/auth/refresh', 'POST', {})
  assert.equal(r.json.code, 0)
  const newer = r.res.headers.get('set-cookie').split(';')[0]
  assert.notEqual(newer, cookie)
  cookie = newer
  token = r.data.accessToken
  assert.equal(r.data.refreshToken, undefined)
})
await ok('removal operations are reflected in lists', async () => {
  assert.equal((await call(`/articles/${articleId}/like`, 'DELETE')).data.liked, false)
  await call(`/me/favorites/${articleId}`, 'DELETE')
  await call(`/me/history/${articleId}`, 'DELETE')
  assert.equal((await call('/me/favorites')).data.pagination.total, 0)
  assert.equal((await call('/me/history')).data.pagination.total, 0)
})
await ok('password change revokes refresh and new credentials work', async () => {
  const changed = await call('/me/change-password', 'POST', {
    oldPassword: credentials.password,
    newPassword: 'PreviewChanged2026!',
  })
  assert.equal(changed.json.code, 0)
  assert.notEqual((await call('/auth/refresh', 'POST', {})).json.code, 0)
  credentials.password = 'PreviewChanged2026!'
  const login = await call('/auth/login', 'POST', {
    username: credentials.username,
    password: credentials.password,
  })
  assert.equal(login.json.code, 0)
  token = login.data.accessToken
  cookie = login.res.headers.get('set-cookie').split(';')[0]
})
await ok('logout clears isolated cookie and invalidates refresh', async () => {
  const r = await call('/auth/logout', 'POST', {})
  assert.equal(r.json.code, 0)
  assert.match(r.res.headers.get('set-cookie'), /codex_refresh=;/)
  assert.notEqual((await call('/auth/refresh', 'POST', {})).json.code, 0)
})
writeFileSync(
  '.local/browser-account.json',
  JSON.stringify({ username: credentials.username, password: credentials.password }),
)
writeFileSync(
  `.local/integration-report-${port}.json`,
  JSON.stringify({ date: new Date().toISOString(), checks }, null, 2),
)
console.log(`${checks.length} integration groups passed; browser test account saved locally.`)
