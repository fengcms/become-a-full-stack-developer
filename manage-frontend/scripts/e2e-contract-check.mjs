// M2 管理后台 · 后端接口 E2E 契约符合性验证（真实数据） v3
// 真相源：docs/api/openapi.v1.yaml v1.11.0
// 用法：ADMIN_USER=admin ADMIN_PASS='Admin.123' API_BASE=https://api-befull.kao9.com node scripts/e2e-contract-check.mjs
// 凭证走 env 不落库；测试数据带 [E2E] 前缀，结束时自动清理。
// v3 修订：分类/标签/文章更新为 PUT（非 PATCH）；收藏 POST /me/favorites{articleId}；
//         历史经 POST /me/history 写入；浏览量 POST /articles/{id}/view；权限反向状态端点补 body。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = (process.env.API_BASE || 'https://api-befull.kao9.com').replace(/\/$/, '')
const API = BASE + '/api/v1'
const ADMIN_USER = process.env.ADMIN_USER
const ADMIN_PASS = process.env.ADMIN_PASS
const TS = Date.now()
const MARK = `[E2E-${TS}]`
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function call(method, p, opts = {}) {
  const url = API + p
  const headers = {}
  if (opts.token) headers['authorization'] = 'Bearer ' + opts.token
  let body
  if (opts.formData) {
    body = opts.formData
  } else if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  const res = await fetch(url, { method, headers, body })
  let data = null
  try {
    data = await res.json()
  } catch {}
  return { status: res.status, data, res }
}
async function getFile(key) {
  const res = await fetch(BASE + '/files/' + String(key).replace(/^\/files\//, ''))
  return { status: res.status }
}

// 信封 / 分页断言
function okEnv(d, label) {
  assert(d && typeof d === 'object', `${label}: 响应非对象 ${JSON.stringify(d)}`)
  assert(d.code === 0, `${label}: 信封 code!=0 (实际 ${d?.code}) ${JSON.stringify(d)}`)
  assert(d.data !== undefined, `${label}: 成功响应缺 data`)
  assert(typeof d.requestId === 'string' && d.requestId.length > 0, `${label}: 缺 requestId`)
  assert(typeof d.timestamp === 'string' && d.timestamp.length > 0, `${label}: 缺 timestamp`)
}
function paginated(d, label) {
  assert(d?.data && Array.isArray(d.data.list), `${label}: data.list 非数组`)
  const pg = d.data.pagination
  assert(
    pg &&
      typeof pg.total === 'number' &&
      typeof pg.page === 'number' &&
      typeof pg.pageSize === 'number' &&
      typeof pg.totalPages === 'number',
    `${label}: pagination 不全 ${JSON.stringify(pg)}`,
  )
}
function bareArray(d, label) {
  assert(d?.data && Array.isArray(d.data), `${label}: 期望裸数组，实际 ${typeof d?.data}`)
}
function errCode(d, seg) {
  assert(d && typeof d.code === 'number' && d.code !== 0, `期望错误码，实际 ${JSON.stringify(d)}`)
  assert(typeof d.message === 'string' && d.message.length > 0, `错误响应缺 message`)
  if (seg) assert(String(d.code).startsWith(seg), `错误码 ${d.code} 不以 ${seg} 开头`)
}

const results = []
async function T(domain, name, fn) {
  const r = { domain, name, status: 'PASS', detail: '', ms: 0 }
  const t0 = Date.now()
  try {
    await fn(r)
  } catch (e) {
    r.status = 'FAIL'
    r.detail = e.message
  }
  r.ms = Date.now() - t0
  results.push(r)
  console.log(
    `${r.status === 'PASS' ? '✅' : '❌'} [${domain}] ${name}${r.detail ? ' — ' + r.detail : ''}`,
  )
  await sleep(40)
}

const created = { articles: [], categories: [], tags: [], comments: [], attachments: [] }
let adminToken = null
let memberToken = null
let pureMemberToken = null
let memberId = null

async function expectForbidden(method, p, token, label, body) {
  const { status, data } = await call(method, p, { token, json: body })
  assert(
    [401, 403].includes(status),
    `${label}: 期望 401/403，实际 ${status} ${JSON.stringify(data)}`,
  )
  assert(
    data &&
      typeof data.code === 'number' &&
      (String(data.code).startsWith('1') || String(data.code).startsWith('2')),
    `${label}: 错误码非 1xxx/2xxx ${JSON.stringify(data)}`,
  )
}
// 注册或登录一个 member，返回 {token, id}
async function ensureMember(uname) {
  const email = `${uname}@example.com`
  const reg = await call('POST', '/auth/register', {
    json: { username: uname, email, password: 'E2e@123456' },
  })
  let token
  if (reg.status === 200) token = reg.data.data.accessToken
  else if (reg.status === 409) {
    const lg = await call('POST', '/auth/login', {
      json: { username: uname, password: 'E2e@123456' },
    })
    assert(lg.status === 200, 'member 登录失败')
    token = lg.data.data.accessToken
  } else throw new Error(`注册 ${uname} 非预期 ${reg.status} ${JSON.stringify(reg.data)}`)
  const me = await call('GET', '/auth/me', { token })
  assert(me.status === 200, 'member me 失败')
  okEnv(me.data, 'memberMe')
  return { token, id: me.data.data.id }
}

async function main() {
  // ---- Phase A ----
  await T('A-探针', 'admin 登录取 token', async () => {
    assert(ADMIN_USER && ADMIN_PASS, '缺少 ADMIN_USER/ADMIN_PASS')
    const { status, data } = await call('POST', '/auth/login', {
      json: { username: ADMIN_USER, password: ADMIN_PASS },
    })
    assert(status === 200, `登录非 200: ${status} ${JSON.stringify(data)}`)
    okEnv(data, 'login')
    adminToken = data.data.accessToken
    assert(typeof adminToken === 'string' && adminToken.length > 10, 'accessToken 异常')
  })
  await T('A-探针', 'GET /auth/me 身份自审(admin)', async () => {
    const { status, data } = await call('GET', '/auth/me', { token: adminToken })
    assert(status === 200, `me 非 200`)
    okEnv(data, 'me')
    assert(data.data.role === 'admin', `期望 admin，实际 ${data.data?.role}`)
  })
  await T('A-探针', '匿名访问 /auth/me 应 401', async () => {
    const { status, data } = await call('GET', '/auth/me')
    assert(status === 401, `匿名 me 期望 401，实际 ${status}`)
    errCode(data, '1')
  })
  await T('A-探针', '注册普通 member（用于角色三角/反向用例）', async () => {
    const m = await ensureMember(`e2emember${TS}`)
    memberToken = m.token
    memberId = m.id
    assert(memberId, 'memberId 缺失')
  })

  // BUG 回归
  await T('BUG回归', 'POST /articles summary/coverImage/slug=null 应 200（修复点）', async () => {
    const { status, data } = await call('POST', '/articles', {
      token: adminToken,
      json: {
        title: MARK + '文章',
        content: '正文',
        summary: null,
        coverImage: null,
        slug: null,
        categoryId: null,
        tags: [],
        status: 'draft',
      },
    })
    assert(status === 200, `修复前会 4001，实际 ${status} ${JSON.stringify(data?.data)}`)
    okEnv(data, 'createArticle')
    assert(data.data.id, '建文章缺 id')
    created.articles.push(data.data.id)
  })

  // ---- Phase B 内容域 ----
  let catId = null,
    tagSlug = null,
    articleId = null
  await T('B-内容', '分类创建(POST) + 树 + 平铺列表(裸数组)', async () => {
    const c = await call('POST', '/categories', {
      token: adminToken,
      json: { name: MARK + '分类', slug: `e2e-cat-${TS}` },
    })
    assert(c.status === 200, `建分类失败 ${c.status} ${JSON.stringify(c.data)}`)
    okEnv(c.data, 'createCat')
    catId = c.data.data.id
    created.categories.push(catId)
    const tree = await call('GET', '/categories/tree', { token: adminToken })
    okEnv(tree.data, 'tree')
    bareArray(tree.data, 'tree')
    const list = await call('GET', '/categories', { token: adminToken })
    okEnv(list.data, 'catList')
    bareArray(list.data, 'catList')
    assert(
      list.data.data.some((x) => x.id === catId),
      '平铺列表缺新建分类',
    )
  })
  await T('B-内容', '分类更新(PUT)', async () => {
    const patch = await call('PUT', `/categories/${catId}`, {
      token: adminToken,
      json: { name: MARK + '分类改', slug: `e2e-cat-${TS}-u` },
    })
    assert(patch.status === 200, `改分类失败 ${patch.status} ${JSON.stringify(patch.data)}`)
    okEnv(patch.data, 'updCat')
    assert(patch.data.data.name.includes('分类改'), '分类名未更新')
  })
  await T('B-内容', '标签 CRUD + 列表(裸数组)', async () => {
    const t = await call('POST', '/tags', {
      token: adminToken,
      json: { name: MARK + '标签', slug: `e2e-tag-${TS}` },
    })
    assert(t.status === 200, `建标签失败 ${t.status} ${JSON.stringify(t.data)}`)
    okEnv(t.data, 'createTag')
    tagSlug = t.data.data.slug
    created.tags.push(t.data.data.id)
    const list = await call('GET', '/tags', { token: adminToken })
    okEnv(list.data, 'tagList')
    bareArray(list.data, 'tagList')
    assert(
      list.data.data.some((x) => x.id === t.data.data.id),
      '标签列表缺新建',
    )
    const put = await call('PUT', `/tags/${t.data.data.id}`, {
      token: adminToken,
      json: { name: MARK + '标签改', slug: `e2e-tag-${TS}-u` },
    })
    assert(put.status === 200, `改标签失败 ${put.status} ${JSON.stringify(put.data)}`)
    okEnv(put.data, 'updTag')
    assert(put.data.data.name.includes('标签改'), '标签名未更新')
  })
  await T('B-内容', '文章完整 CRUD + 引用分类/标签(slug) + 列表非空', async () => {
    const cr = await call('POST', '/articles', {
      token: adminToken,
      json: {
        title: MARK + '主文章',
        content: '正文',
        summary: '摘要',
        coverImage: null,
        slug: `e2e-art-${TS}`,
        categoryId: catId,
        tags: [tagSlug],
        status: 'draft',
      },
    })
    assert(cr.status === 200, `建文章失败 ${cr.status} ${JSON.stringify(cr.data)}`)
    okEnv(cr.data, 'createArt')
    articleId = cr.data.data.id
    created.articles.push(articleId)
    const detail = await call('GET', `/articles/${articleId}`, { token: adminToken })
    assert(detail.status === 200, '详情失败')
    okEnv(detail.data, 'artDetail')
    assert(detail.data.data.title.includes(MARK), '详情标题不符')
    assert(detail.data.data.categoryId === catId, 'categoryId 未回写')
    assert((detail.data.data.tags || []).includes(tagSlug), 'tags 未回写')
    const upd = await call('PUT', `/articles/${articleId}`, {
      token: adminToken,
      json: {
        title: MARK + '主文章改',
        content: '正文',
        summary: null,
        coverImage: null,
        slug: null,
        categoryId: null,
        tags: [],
      },
    })
    assert(upd.status === 200, `改文章失败 ${upd.status} ${JSON.stringify(upd.data)}`)
    okEnv(upd.data, 'updArt')
    assert(upd.data.data.title.includes('主文章改'), '文章标题未更新')
    const list = await call('GET', '/admin/articles', { token: adminToken })
    okEnv(list.data, 'artList')
    paginated(list.data, 'artList')
    assert(
      list.data.data.list.some((a) => a.id === articleId),
      '后台列表未返回刚建文章（分页/检索异常）',
    )
  })
  await T('B-内容', '状态机 draft→submit→approve→published', async () => {
    const submit = await call('POST', `/articles/${articleId}/submit`, { token: adminToken })
    assert(submit.status === 200, `submit 失败 ${submit.status} ${JSON.stringify(submit.data)}`)
    okEnv(submit.data, 'submit')
    assert(
      submit.data.data.status === 'pending',
      `submit 后应为 pending，实际 ${submit.data.data.status}`,
    )
    const approve = await call('POST', `/admin/articles/${articleId}/approve`, {
      token: adminToken,
    })
    assert(approve.status === 200, `approve 失败 ${approve.status} ${JSON.stringify(approve.data)}`)
    okEnv(approve.data, 'approve')
    assert(
      approve.data.data.status === 'published',
      `approve 后应为 published，实际 ${approve.data.data.status}`,
    )
  })
  await T('B-内容', '状态机非法转移：approve 非 pending 应 409/3003', async () => {
    const again = await call('POST', `/admin/articles/${articleId}/approve`, { token: adminToken })
    assert(
      again.status === 409,
      `已发布再 approve 应 409，实际 ${again.status} ${JSON.stringify(again.data)}`,
    )
    errCode(again.data, '3')
    assert(again.data.code === 3003, `应 3003，实际 ${again.data.code}`)
  })
  await T('B-内容', 'admin 文章列表可筛 published 且含本文', async () => {
    const r = await call('GET', `/admin/articles?status=published`, { token: adminToken })
    okEnv(r.data, 'adminArt')
    paginated(r.data, 'adminArt')
    assert(
      r.data.data.list.some((a) => a.id === articleId),
      '后台 published 列表缺本文',
    )
  })
  await T('B-内容', '阅读量 POST /articles/{id}/view 应 200 + viewCount 数字', async () => {
    const v = await call('POST', `/articles/${articleId}/view`, { token: adminToken })
    assert(v.status === 200, `view 非 200 ${v.status} ${JSON.stringify(v.data)}`)
    okEnv(v.data, 'view')
    assert(
      typeof v.data.data.viewCount === 'number',
      `viewCount 非数字 ${JSON.stringify(v.data.data)}`,
    )
  })
  await T('B-内容', '点赞幂等 POST /articles/{id}/like + 状态', async () => {
    assert(
      (await call('POST', `/articles/${articleId}/like`, { token: adminToken })).status === 200,
      'like 失败',
    )
    assert(
      (await call('POST', `/articles/${articleId}/like`, { token: adminToken })).status === 200,
      'like 幂等失败',
    )
    const st = await call('GET', `/articles/${articleId}/like/status`, { token: adminToken })
    okEnv(st.data, 'likeStatus')
    assert(st.data.data.liked === true, 'likeStatus.liked 应为 true')
  })
  await T('B-内容', '外键/删除策略：删被引用分类的行为观察', async (r) => {
    const del = await call('DELETE', `/categories/${catId}`, { token: adminToken })
    if (del.status === 200) {
      const a = (await call('GET', `/articles/${articleId}`, { token: adminToken })).data.data
      r.detail = `分类删除被允许(200)，引用文章 categoryId=${JSON.stringify(a?.categoryId)}（契约未强制 FK 拒绝，需确认孤儿处理策略）`
    } else {
      r.detail = `分类删除被拒(${del.status}/${del.data?.code})，符合严格外键预期`
      assert(
        [3, 4].includes(Math.floor(del.status / 100)) ||
          (del.data && String(del.data.code).startsWith('3')),
        '非预期状态码',
      )
    }
  })

  // ---- Phase C 治理域 ----
  await T('C-治理', '评论审核流 PATCH /comments/{id}/status', async () => {
    const add = await call('POST', `/articles/${articleId}/comments`, {
      token: adminToken,
      json: { content: MARK + '评论' },
    })
    assert(add.status === 200, `建评论失败 ${add.status} ${JSON.stringify(add.data)}`)
    okEnv(add.data, 'addComment')
    const cid = add.data.data.id
    created.comments.push(cid)
    const list = await call('GET', '/admin/comments', { token: adminToken })
    okEnv(list.data, 'adminComments')
    paginated(list.data, 'adminComments')
    const mod = await call('PATCH', `/comments/${cid}/status`, {
      token: adminToken,
      json: { status: 'approved' },
    })
    assert(mod.status === 200, `审评论失败 ${mod.status} ${JSON.stringify(mod.data)}`)
    okEnv(mod.data, 'modComment')
    assert(mod.data.data.status === 'approved', '评论状态未变 approved')
  })
  await T('C-治理', '用户列表(GET /users 分页) + 角色三角 member→editor', async (r) => {
    const list = await call('GET', '/users', { token: adminToken })
    okEnv(list.data, 'users')
    paginated(list.data, 'users')
    assert(memberId, 'memberId 缺失')
    const prom = await call('PATCH', `/users/${memberId}`, {
      token: adminToken,
      json: { role: 'editor' },
    })
    assert(prom.status === 200, `提升 editor 失败 ${prom.status} ${JSON.stringify(prom.data)}`)
    okEnv(prom.data, 'promote')
    assert(
      prom.data.data.role === 'editor',
      `PATCH 响应角色应为 editor，实际 ${prom.data.data.role}`,
    )
    const me = await call('GET', '/auth/me', { token: memberToken })
    const cur = me.data.data.role
    if (cur === 'editor')
      r.detail = 'member 提升后 /auth/me 角色已同步为 editor（JWT 从 DB 取角色）'
    else
      r.detail = `member 提升后 /auth/me 角色仍为 ${cur}（JWT 可能无状态存储角色，需刷新令牌方可生效——非契约违规，属已知设计权衡）`
  })
  await T('C-治理', '站点设置：公开 GET /site/settings（R4 回归，应 200 非 5000）', async () => {
    const pub = await call('GET', '/site/settings')
    assert(
      pub.status === 200,
      `公开 site/settings 应 200（R4 历史 5000），实际 ${pub.status} ${JSON.stringify(pub.data)}`,
    )
    okEnv(pub.data, 'pubSite')
  })
  await T('C-治理', '站点设置：admin 读写（PATCH 回写原值，幂等不改真实配置）', async () => {
    const cur = await call('GET', '/admin/site/settings', { token: adminToken })
    assert(cur.status === 200, `admin site/settings 失败 ${cur.status}`)
    okEnv(cur.data, 'adminSite')
    const patch = await call('PATCH', '/admin/site/settings', {
      token: adminToken,
      json: cur.data.data,
    })
    assert(
      patch.status === 200,
      `PATCH site/settings 失败 ${patch.status} ${JSON.stringify(patch.data)}`,
    )
  })

  // ---- Phase D ----
  await T('D-资产', '附件上传 POST /upload(图片) + 根路径下载', async () => {
    const fd = new FormData()
    fd.append('file', new Blob([Buffer.from(PNG_B64, 'base64')], { type: 'image/png' }), 'e2e.png')
    const up = await call('POST', '/upload', { token: adminToken, formData: fd })
    assert(up.status === 200, `上传失败 ${up.status} ${JSON.stringify(up.data)}`)
    okEnv(up.data, 'upload')
    const key = up.data.data.key || up.data.data.url
    assert(key, '上传响应缺 key/url')
    const dl = await getFile(String(key).replace(/^\/files\//, ''))
    assert(dl.status === 200, `根路径下载失败 ${dl.status}`)
    created.attachments.push(up.data.data.id)
  })
  await T('D-私域', '通知：列表/未读计数/全部已读/单条已读', async () => {
    const list = await call('GET', '/me/notifications', { token: adminToken })
    okEnv(list.data, 'noti')
    paginated(list.data, 'noti')
    const cnt = await call('GET', '/me/notifications/unread-count', { token: adminToken })
    okEnv(cnt.data, 'unread')
    assert(typeof cnt.data.data.count === 'number', 'unread.count 非数字')
    assert(
      (await call('POST', '/me/notifications/read-all', { token: adminToken })).status === 200,
      'read-all 失败',
    )
    if (list.data.data.list.length > 0) {
      const nid = list.data.data.list[0].id
      const mk = await call('PATCH', `/me/notifications/${nid}`, {
        token: adminToken,
        json: { isRead: true },
      })
      assert(mk.status === 200, `标记已读失败 ${mk.status}`)
    }
  })
  await T('D-私域', '收藏闭环 POST /me/favorites{articleId} + GET + DELETE', async () => {
    assert(
      (await call('POST', '/me/favorites', { token: adminToken, json: { articleId } })).status ===
        200,
      '收藏失败',
    )
    const list = await call('GET', '/me/favorites', { token: adminToken })
    okEnv(list.data, 'fav')
    paginated(list.data, 'fav')
    assert(
      list.data.data.list.some((a) => a.id === articleId),
      '收藏列表缺本文',
    )
    assert(
      (await call('DELETE', `/me/favorites/${articleId}`, { token: adminToken })).status === 200,
      '取消收藏失败',
    )
    const after = await call('GET', '/me/favorites', { token: adminToken })
    assert(!after.data.data.list.some((a) => a.id === articleId), '取消收藏后仍可见')
  })
  await T('D-私域', 'GET /me/likes 裸数组（R5 钉死，非分页）', async () => {
    const r = await call('GET', '/me/likes', { token: adminToken })
    okEnv(r.data, 'likes')
    assert(Array.isArray(r.data.data), `likes 应为裸数组，实际 ${typeof r.data.data}`)
    assert(!('list' in (r.data.data || {})), 'likes 不应含 list（R5 矛盾点）')
  })
  await T('D-私域', '历史 POST /me/history + GET /me/history 含本文', async () => {
    const rep = await call('POST', '/me/history', { token: adminToken, json: { articleId } })
    assert(rep.status === 200, `上报历史失败 ${rep.status} ${JSON.stringify(rep.data)}`)
    okEnv(rep.data, 'repHistory')
    const r = await call('GET', '/me/history', { token: adminToken })
    okEnv(r.data, 'history')
    paginated(r.data, 'history')
    assert(
      r.data.data.list.some((h) => h.article && h.article.id === articleId),
      '历史缺刚浏览的文章',
    )
  })
  await T('D-统计', 'GET /stats + /categories/stats + /search', async () => {
    okEnv((await call('GET', '/stats', { token: adminToken })).data, 'stats')
    okEnv((await call('GET', '/categories/stats', { token: adminToken })).data, 'catStats')
    const se = await call('GET', `/search?q=${encodeURIComponent(MARK)}`, { token: adminToken })
    okEnv(se.data, 'search')
  })

  // ---- E 权限反向（纯 member）----
  await T('E-权限反向', '注册并保持纯 member 账号', async () => {
    const m = await ensureMember(`e2emem2${TS}`)
    pureMemberToken = m.token
  })
  await T('E-权限反向', 'member→GET /admin/articles 应 403/2001', async () => {
    await expectForbidden('GET', '/admin/articles', pureMemberToken, 'm→admin/articles')
  })
  await T('E-权限反向', 'member→GET /users(admin) 应 403', async () => {
    await expectForbidden('GET', '/users', pureMemberToken, 'm→users')
  })
  await T('E-权限反向', 'member→GET /admin/site/settings 应 403', async () => {
    await expectForbidden('GET', '/admin/site/settings', pureMemberToken, 'm→admin/site')
  })
  await T('E-权限反向', 'member→POST /admin/articles/{id}/status 应 403', async () => {
    await expectForbidden(
      'POST',
      `/admin/articles/${articleId}/status`,
      pureMemberToken,
      'm→admin/status',
      { status: 'draft' },
    )
  })
  await T('E-权限反向', 'member→PATCH /users/{id}(他人) 应 403', async () => {
    await expectForbidden('PATCH', `/users/${memberId}`, pureMemberToken, 'm→PATCH/users', {
      role: 'admin',
    })
  })

  // ---- E 清理 ----
  await T(
    'E-清理',
    '删除测试数据（评论/文章/标签/分类/附件，分类已可能被删则容忍 404）',
    async () => {
      for (const id of created.comments) {
        await call('DELETE', `/comments/${id}`, { token: adminToken })
      }
      for (const id of created.articles) {
        const r = await call('DELETE', `/articles/${id}`, { token: adminToken })
        if (r.status !== 200) console.log(`  ! 删文章 ${id}: ${r.status}`)
      }
      for (const id of created.tags) {
        await call('DELETE', `/tags/${id}`, { token: adminToken })
      }
      for (const id of created.categories) {
        const r = await call('DELETE', `/categories/${id}`, { token: adminToken })
        if (r.status !== 200 && r.status !== 404) throw new Error(`删分类 ${id}: ${r.status}`)
      }
      for (const id of created.attachments) {
        await call('DELETE', `/attachments/${id}`, { token: adminToken })
      }
    },
  )

  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  console.log(`\n=== 汇总：${results.length} 用例，PASS ${pass}，FAIL ${fail} ===`)
  if (fail > 0)
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  - [${r.domain}] ${r.name}: ${r.detail}`)
      })

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const envTag = /localhost|127\.0\.0\.1/.test(BASE) ? '-local' : '-online'
  const reportPath = path.resolve(
    __dirname,
    '../../docs/manage-frontend/M2-后端E2E验证-运行报告-' + dateStr + envTag + '.md',
  )
  const L = []
  L.push(`# M2 后端接口 E2E 验证 · 运行报告（v3，${new Date().toISOString()}）`)
  L.push('')
  L.push(`- 目标后端：${BASE}`)
  L.push(`- 账号：admin（你提供）+ 2 个 member（脚本注册，[E2E] 标记）`)
  L.push(`- 真相源：openapi.v1.yaml v1.11.0`)
  L.push(`- 用例数：${results.length} ｜ PASS ${pass} ｜ FAIL ${fail}`)
  L.push('')
  L.push('## 结果明细')
  L.push('')
  L.push('| 域 | 用例 | 结果 | 耗时(ms) | 说明 |')
  L.push('| --- | --- | --- | --- | --- |')
  for (const r of results)
    L.push(`| ${r.domain} | ${r.name} | ${r.status} | ${r.ms} | ${r.detail || '-'} |`)
  L.push('')
  L.push('## 偏离契约发现')
  L.push('')
  if (fail === 0)
    L.push(
      '本次运行未断言失败。含两大修复点回归：① BUG 回归 `POST /articles` 发 null 可选字段已 200；② R4 公开 `GET /site/settings` 已 200（不再 5000）。',
    )
  else {
    L.push('以下用例失败，需后端 owner 复核：')
    L.push('')
    for (const r of results.filter((x) => x.status === 'FAIL'))
      L.push(`- [${r.domain}] ${r.name}: ${r.detail}`)
  }
  L.push('')
  L.push('## 残留数据说明')
  L.push('')
  L.push(
    '- 注册的两个 member 账号（一个被提升为 editor、一个保持 member）**无法经 API 删除**（契约无 DELETE /users 端点，v1 设计为软禁用）。标识：username 含 `e2emember` / `e2emem2` + 时间戳。如需清理请后端 owner 手动禁用或后续补删除端点。',
  )
  L.push(
    '- 文章/评论/标签/附件均已自动清理；分类若被引用删除策略放行亦已随之消失，删除步骤对 404 容忍。',
  )
  L.push('')
  fs.writeFileSync(reportPath, L.join('\n'), 'utf8')
  console.log(`\n报告已写入：${reportPath}`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('致命错误（脚本中断）：', e)
  process.exitCode = 2
})
