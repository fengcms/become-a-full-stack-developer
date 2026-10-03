# 成为全栈·Next.js 网站前台篇·同源 BFF 代理：API、附件、Cookie 与跨站写入保护

> Route Handler 代理不是把一个 URL 原样转发到另一个 URL。它还要限制目标地址、保留查询串、正确处理多个 Set-Cookie、隔离私有缓存，并拒绝明确的跨站写入。

![成为全栈·Next.js 网站前台篇·同源 BFF 代理：API、附件、Cookie 与跨站写入保护](https://i-blog.csdnimg.cn/direct/476540ec6b184e2ca8e98e101fd24c2a.png)

## 前言

当前前台和 M1 后端是两个独立应用。浏览器如果直接请求后端，要面对跨域配置、Cookie 域名和后端地址暴露；refresh Cookie 还可能与同一主机上的旧前台冲突。

于是 Next.js 提供 `/api/v1/[...path]` 同源入口：浏览器只和当前站点通信，Route Handler 再访问真实后端。看起来像几十行“转发器”，实际却站在浏览器、Next.js 和后端三套 HTTP 语义之间。

这篇不把 BFF 说成另一套业务后端。它的职责是适配边界：转发请求、转换 Cookie、收窄安全范围。文章、评论、权限和状态机仍由 M1 后端裁决。

## 为什么不让浏览器直接请求后端

| 关注点 | 浏览器直连后端 | 同源 BFF |
| --- | --- | --- |
| API 地址 | 暴露并进入客户端配置 | `API_ORIGIN` 留在服务端 |
| Cookie | 受跨站与域名策略影响 | 浏览器只处理当前站点 Cookie |
| CORS | 后端需要允许前台 origin | 浏览器请求同源 |
| 私有缓存头 | 依赖每个上游响应正确设置 | 代理统一补 `private, no-store` |
| 协议适配 | 客户端各处处理 | 集中转换 Cookie 和响应 |

BFF 增加了一跳和一处运行成本，换来的是协议集中与前端部署边界。是否采用它，取决于系统现状，而不是“Next.js 项目必须有 BFF”。

![BFF边界](https://i-blog.csdnimg.cn/direct/fa74981bf47f4f37b5da241e2b71640a.png)

## 动态路径首先要阻止越界

Route Handler 捕获路径片段，但不能把任意字符串直接拼给上游：

```ts
const { path } = await params

if (path.some((part) => part === '..' || part === '.' || /[\\/]/.test(part))) {
  return NextResponse.json(
    { code: 4000, message: '无效路径' },
    { status: 400 },
  )
}

const target = new URL(
  `/api/v1/${path.map(encodeURIComponent).join('/')}`,
  API_ORIGIN,
)
```

目标 origin 只能来自服务端配置，浏览器不能传一个完整 URL 让代理代为访问。否则 BFF 可能变成开放代理或服务端请求伪造入口。

## 查询串必须完整保留

列表、搜索、分页和排序都依赖 query。只转发 pathname 会造成一种很难察觉的故障：接口返回 200，但永远是默认第 1 页。

```ts
const target = new URL(`/api/v1/${encodedPath}`, API_ORIGIN)
target.search = request.nextUrl.search
```

这里直接复制经过 URL 解析的查询串，而不是手工遍历后再次编码。测试时至少要覆盖重复参数、中文关键词、空值和带符号排序字段。

## 请求头采用允许列表，而不是照单全收

```ts
const headers = new Headers()

for (const key of ['accept', 'content-type', 'authorization', 'user-agent']) {
  const value = request.headers.get(key)
  if (value) headers.set(key, value)
}

headers.set('accept-encoding', 'identity')
```

`Host`、`Content-Length`、`Connection` 等逐跳或传输相关头不应从浏览器原样送给上游。请求体由运行时重新构造，长度也应由底层计算。

方法与 body 则按 HTTP 语义转发：

```ts
const upstream = await fetch(target, {
  method: request.method,
  headers,
  body: ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.arrayBuffer(),
  cache: 'no-store',
  redirect: 'manual',
  signal: AbortSignal.timeout(15_000),
})
```

使用 `arrayBuffer()` 能保留 JSON、表单和附件二进制内容，不要无条件 `request.json()`。代理还设置超时，避免上游失联长期占住 Worker。

## Cookie 转换只转发当前应用需要的一枚

同一主机可能还运行旧前台。新应用使用独立名称 `codex_refresh`，发往后端时再转换成后端认识的 `refreshToken`：

```ts
export const backendCookie = (cookies: string): string => {
  const token = cookies
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('codex_refresh='))
    ?.slice('codex_refresh='.length)

  return token ? `refreshToken=${token}` : ''
}
```

代理不应把浏览器的所有 Cookie 送给后端。允许列表减少无关会话泄漏，也避免两个前端的刷新令牌互相覆盖。

后端返回时再改回前台名称，并调整当前环境需要的属性：

```ts
export const frontendCookie = (cookie: string, hostname: string): string => {
  let result = cookie
    .replace(/^refreshToken=/, 'codex_refresh=')
    .replace(/;\s*SameSite=[^;]+/i, '; SameSite=Lax')

  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    result = result.replace(/;\s*Secure/gi, '')
  }

  return result
}
```

生产 HTTPS 仍保留 Secure。只在字面量回环主机放宽，不能因为“开发环境”就对任意 HTTP 域名删掉安全属性。

## 多个 Set-Cookie 不能用逗号随便拆

`Expires=Wed, 21 Oct...` 自身含逗号，直接对 `set-cookie` 字符串执行 `split(',')` 会破坏日期。运行时提供独立 Cookie 列表时，应逐条追加：

```ts
const outgoing = new Headers()

upstream.headers.forEach((value, key) => {
  if (!blocked.includes(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
    outgoing.set(key, value)
  }
})

for (const cookie of upstream.headers.getSetCookie()) {
  outgoing.append('set-cookie', frontendCookie(cookie, request.nextUrl.hostname))
}
```

登录可能同时设置刷新 Cookie 和其他状态 Cookie，注销也可能通过过期 Cookie 清除会话。丢掉第二个 `Set-Cookie` 会产生“登录看似成功，刷新却掉线”或“退出后还能恢复”的问题。

## 刷新令牌不应再出现在响应 JSON

后端为了兼容其他客户端，登录、注册和刷新响应可能同时返回 refresh token。Web 前台已经使用 HttpOnly Cookie，就应从 JSON 中移除：

```ts
if (
  path[0] === 'auth' &&
  ['login', 'register', 'refresh'].includes(path[1]) &&
  upstream.ok
) {
  const envelope = await upstream.json()
  if (envelope.data) delete envelope.data.refreshToken

  return NextResponse.json(envelope, {
    status: upstream.status,
    headers: outgoing,
  })
}
```

这让浏览器 JavaScript 只拿到 access token，refresh token 的读取和轮换都停留在 Cookie 与服务端代理边界。

## 跨站写入要检查请求来源

SameSite=Lax 可以降低一部分 CSRF 风险，但服务端仍应拒绝明确的跨站写请求。当前代理对 POST、PUT、PATCH、DELETE 检查 `Sec-Fetch-Site` 与 Origin：

```ts
if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
  const source = request.headers.get('origin')
  let sourceHost = ''

  try {
    sourceHost = source ? new URL(source).host : ''
  } catch {
    sourceHost = 'invalid'
  }

  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (source && sourceHost !== request.headers.get('host'))
  ) {
    return NextResponse.json(
      { code: 4000, message: '请求来源无效' },
      { status: 403 },
    )
  }
}
```

Origin 比较的是主机部分，并显式处理非法 URL。这个保护不代替后端鉴权，也不意味着所有无 Origin 请求都可信；它是在 Cookie 自动携带的前提下增加一道同源写入约束。

## 私有响应必须禁止缓存

```ts
outgoing.set('cache-control', 'private, no-store')

return new NextResponse(upstream.body, {
  status: upstream.status,
  headers: outgoing,
})
```

上游 fetch 自身使用 `cache: 'no-store'`，下游响应再声明 `private, no-store`。前者防止 Next.js 复用上游结果，后者约束浏览器与中间缓存。会员资料、收藏和通知不能沿用公开文章的 60 秒缓存。

## 附件上传不需要在代理中理解文件内容

只要代理保留 `Content-Type` 并按字节转发 body，multipart boundary 仍由浏览器请求携带：

```ts
const body = ['GET', 'HEAD'].includes(request.method)
  ? undefined
  : await request.arrayBuffer()
```

不要读取 `formData()` 后再手工重建，除非 BFF 确实需要检查或变换字段。当前代理只做透明传输，文件大小、MIME、权限和存储规则由后端上传接口负责。

不过这会让附件经过 Next.js Worker 多走一跳。大文件场景更适合后端签发直传地址，前端直接上传对象存储；那属于新的契约和安全模型，不能由当前代理悄悄演变。

## BFF 验收矩阵

| 场景 | 预期结果 |
| --- | --- |
| `/articles?page=2&sort=-publishedAt` | 上游收到完整 query |
| 路径含 `..` 或斜线片段 | 400，不访问上游 |
| 登录返回两个 Set-Cookie | 两条分别保留并转换 |
| 登录响应含 refreshToken | 浏览器 JSON 中已删除 |
| 跨站 POST | 403 |
| 同源 GET | 正常转发，不要求 Origin |
| 上游超时 | 502 统一错误信封 |
| 会员资料响应 | `Cache-Control: private, no-store` |
| multipart 附件 | 字节和 Content-Type 保持一致 |

![代理验收矩阵](https://i-blog.csdnimg.cn/direct/6e866ea0e5054d7cb4d69001f3c027d0.png)

```bash
curl -i 'http://localhost:3000/api/v1/articles?page=2'
curl -i -X POST 'http://localhost:3000/api/v1/auth/refresh' \
  -H 'Origin: https://attacker.example' \
  -H 'Sec-Fetch-Site: cross-site'
```

浏览器验收还要覆盖登录、刷新页面恢复、退出后不能恢复、附件上传和两个账号切换。单独验证代理返回 200，不能证明 Cookie 生命周期完整。

## 适用边界

当前 BFF 是协议适配层，不应加入文章审核、评论权限或会员状态机。业务规则进入两处后，管理后台和其他客户端会得到不同结果。

若代理未来承担聚合多个服务、服务端会话或响应裁剪，应把它当正式后端组件治理，增加可观测性、限流和独立契约，而不是继续把所有逻辑堆进一个 Route Handler。

## 小结

同源代理真正难的地方不在 `fetch(target)`，而在 HTTP 细节：目标地址是否受控、查询串是否保留、哪些头可以转发、多个 Cookie 是否完整、私有响应是否缓存、跨站写入是否被拒绝。

把这些边界集中以后，浏览器得到简单的同源接口，后端继续拥有最终业务规则。BFF 的价值正来自这种克制。

## 延伸阅读

- [C 端认证：内存令牌、HttpOnly Cookie 与会话代次](https://blog.csdn.net/fungleo/article/details/166945972)
- [HTTP 协议：前端天天用却说不清的那些事]({{LINK:B-01}})
- [会员中心：资料、密码与个人数据](https://blog.csdn.net/fungleo/article/details/166991388)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`BFF`、`Route Handler`、`HttpOnly Cookie`、`CSRF`、`Web 安全`

### 文章简介（250 字以内）

Next.js 同源代理不只是转发 URL。本文结合 Route Handler 真实实现，拆解动态路径限制、查询串、请求头允许列表、附件字节转发、多 Set-Cookie、刷新令牌裁剪、私有缓存和 Origin 跨站写入校验。

### 建议发布分类

前端开发 / Next.js / Web 安全

### 封面短标题

BFF 的难点都在 HTTP 细节

### 配图 AI 提示词

1. `M3-12-封面`：16:9 技术博客封面，浏览器、Next.js BFF、后端 API 三层结构，中间代理层展示 Path、Query、Headers、Cookie、Body 五条受控通道；中文短标题“BFF 的难点都在 HTTP 细节”，深蓝背景、青绿数据流、橙色安全闸门，无人物、Logo 和水印。
2. `M3-12-BFF边界`：16:9 架构图，浏览器只访问同源 `/api/v1`，BFF 使用私密 API_ORIGIN 访问后端，并在中间完成 Cookie 改名、no-store 和 Origin 校验，中文清晰。
3. `M3-12-代理验收矩阵`：16:9 九宫格测试信息图，展示 query、非法路径、多 Cookie、token 裁剪、跨站 POST、上游超时、私有缓存与附件上传等场景，用绿色通过和红色拒绝标识，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-11、13 与 B-01 发布后回填站内链接
- [ ] 确认没有把 Origin 校验描述成后端鉴权替代
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中反斜线、Cookie 和 curl 命令正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
