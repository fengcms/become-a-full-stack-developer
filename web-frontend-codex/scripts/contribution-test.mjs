/** Real member workflow against the isolated preview only. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const port = process.env.PREVIEW_PORT || '13001'
if (!['13001', '13002'].includes(port)) throw new Error('Only isolated preview ports are allowed')
const base = `http://127.0.0.1:${port}`
const checks = []
async function call(path, method = 'GET', body, token) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Origin: base,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const envelope = await response.json()
  return { status: response.status, data: envelope.data, envelope }
}
async function check(name, run) {
  await run()
  checks.push(name)
  console.log('PASS', name)
}
const stamp = Date.now()
const credentials = {
  username: `writer_${stamp}`,
  password: 'PreviewOnly2026!',
  email: `writer-${stamp}@example.test`,
}
const first = await call('/auth/register', 'POST', credentials)
assert.equal(first.status, 200)
const token = first.data.accessToken
const other = await call('/auth/register', 'POST', {
  username: `other_${stamp}`,
  password: credentials.password,
  email: `other-${stamp}@example.test`,
})
const categories = await call('/categories/tree')
let id
await check('create and read own draft', async () => {
  const created = await call(
    '/articles',
    'POST',
    {
      title: '投稿流程验收',
      content: '# 正文\n\n会员投稿测试',
      status: 'draft',
      categoryId: categories.data[0].id,
    },
    token,
  )
  assert.equal(created.status, 200)
  id = created.data.id
  assert.equal((await call(`/articles/${id}`, 'GET', undefined, token)).data.status, 'draft')
})
await check('anonymous and other member cannot read/update the draft', async () => {
  assert.equal((await call(`/articles/${id}`)).status, 404)
  assert.equal(
    (await call(`/articles/${id}`, 'GET', undefined, other.data.accessToken)).status,
    404,
  )
  assert.equal(
    (await call(`/articles/${id}`, 'PUT', { title: '越权' }, other.data.accessToken)).status,
    403,
  )
})
await check('multipart image upload is readable through frontend file route', async () => {
  const form = new FormData()
  form.append(
    'file',
    new Blob(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWQAAAAASUVORK5CYII=',
          'base64',
        ),
      ],
      { type: 'image/png' },
    ),
    'pixel.png',
  )
  form.append('articleId', String(id))
  const uploaded = await call('/upload', 'POST', form, token)
  assert.equal(uploaded.status, 200)
  const image = await fetch(new URL(uploaded.data.url, base))
  assert.equal(image.status, 200)
  assert.match(image.headers.get('content-type'), /image\/png/)
  const updated = await call(
    `/articles/${id}`,
    'PUT',
    {
      coverImage: new URL(uploaded.data.url, base).href,
      content: `# 正文\n![图片](${uploaded.data.url})`,
    },
    token,
  )
  assert.equal(updated.status, 200)
})
await check('submit, edit pending, withdraw and resubmit', async () => {
  assert.equal(
    (await call(`/articles/${id}/submit`, 'POST', undefined, token)).data.status,
    'pending',
  )
  assert.equal((await call(`/articles/${id}/submit`, 'POST', undefined, token)).status, 409)
  assert.equal(
    (await call(`/articles/${id}`, 'PUT', { title: '修改待审核文章' }, token)).data.status,
    'pending',
  )
  assert.equal(
    (await call(`/articles/${id}`, 'PUT', { status: 'draft' }, token)).data.status,
    'draft',
  )
  assert.equal(
    (await call(`/articles/${id}/submit`, 'POST', undefined, token)).data.status,
    'pending',
  )
})
await check('member cannot bypass moderation using published status', async () => {
  assert.equal(
    (await call(`/articles/${id}`, 'PUT', { status: 'published' }, token)).data.status,
    'pending',
  )
})
await check('withdraw then delete own draft', async () => {
  await call(`/articles/${id}`, 'PUT', { status: 'draft' }, token)
  assert.equal((await call(`/articles/${id}`, 'DELETE', undefined, token)).status, 200)
  assert.equal((await call(`/articles/${id}`, 'GET', undefined, token)).status, 404)
})
writeFileSync('.local/contribution-report.json', JSON.stringify({ checks, credentials }, null, 2))
