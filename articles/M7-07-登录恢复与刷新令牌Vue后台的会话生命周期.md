# 成为全栈·Vue 管理后台篇·登录恢复与刷新令牌：Vue 后台的会话生命周期

> 登录不是点一下按钮、存一个 token 就结束了。真正的会话还要跨过浏览器刷新、多个并发请求、令牌轮换、账号停用和主动退出。本文按 Vue 后台代码追踪这些状态如何闭环。

{{IMG:M7-07-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `src/main.ts`、`src/lib/request/index.ts`、`src/lib/request/session.ts`、`src/stores/auth.ts`、`src/api/auth.ts` 和路由守卫。

## 前言：会话是一个生命周期，不是一行 localStorage

很多教程把登录流程简化成“请求成功后把 token 存进 localStorage”。这种写法容易上手，却把 token 泄漏风险、过期处理、刷新、并发、退出和多端差异都留给页面临时处理。这个项目的冻结契约定义了短期 access token 与可轮换 refresh token；浏览器端用 HttpOnly Cookie 携带 refresh token，移动端则由安全存储后放入请求体。Web 管理后台要遵循浏览器路径，不应照搬 APP 的存储方式。

Vue 项目把 access token、用户和会话启动状态放在 Pinia 内存 store。刷新令牌也只作为当前会话的内存字段由 API 响应维护，不通过 Pinia 持久化插件写入 localStorage。冷启动时浏览器依靠 HttpOnly Cookie 请求刷新接口；因此脚本无法直接读取 cookie，也不需要把长期凭证暴露给 JavaScript。

## 登录：成功后建立内存会话

`api/auth.ts` 将登录请求交给统一 request 层，然后把返回的认证结果写入 auth store：

```ts
export const login = async (payload: LoginRequest) => {
  const result = await http.post<AuthResult>('/auth/login', payload, {
    skipAuth: true,
    skipAuthRedirect: true,
    skipRefresh: true,
  })
  useAuthStore(pinia).setSession(result)
  return result
}
```

登录请求不应先附带旧 access token，也不应遇到 401 再触发刷新，所以它明确跳过认证、自动跳转和 refresh 分支。登录成功后，页面依据角色和原始访问地址决定进入控制台、个人中心或 no-access 页面。认证状态由 API 层更新，页面负责用户反馈和路由选择。

{{IMG:M7-07-启动恢复}}

## 启动恢复：先建立会话，再挂载应用

`main.ts` 在 `app.mount('#app')` 前等待 `bootstrapSession()`：

```ts
app.use(pinia)
app.use(VueQueryPlugin, { queryClient })
app.use(router)
await bootstrapSession()
useAuthStore(pinia).setBootStatus('ready')
await router.isReady()
app.mount('#app')
```

这样路由守卫第一次判断受保护页面时，认证恢复已有结果，不会先把用户误送到登录页，再闪回原页面。冷启动时 auth store 没有内存 access token，`bootstrapSession()` 调用 `refreshOnce()`。请求携带 `credentials: 'include'`，后端可从浏览器 Cookie 读取 refresh token；若该次运行时 store 有 refreshToken，也会按契约兼容字段发送请求体，但它不会跨浏览器重启保存。

恢复成功后，新的 access token、用户和 refreshToken（若响应包含）进入内存 store；失败则清空状态，应用仍可启动为未登录访客。启动恢复失败不应该让整个 SPA 白屏。`bootStatus` 区分初始化阶段与就绪状态，也避免重复触发引导流程。

## 为什么 access token 留在内存？

access token 会被放到受保护 API 的 `Authorization: Bearer ...` header 中。它需要在当前页面运行期间可用，但不必为了重载页面写入浏览器可读的持久存储。浏览器刷新后，通过 Cookie refresh 换一个新的 access token。

内存存储不能消除所有 XSS 风险；若恶意脚本已能在页面中执行，仍可能借当前会话发请求。它的意义是减少长期凭证的持久暴露面，并把刷新职责交给 HttpOnly Cookie 与服务端令牌体系。Cookie 的 `Secure`、`HttpOnly`、`SameSite`、域和 CORS 配置需和部署拓扑匹配，前端的 `credentials: include` 本身不构成安全保障。

{{IMG:M7-07-并发刷新}}

## 并发刷新：只让一个请求更新令牌

用户页面可能同时发出多个查询。若 access token 刚好过期，多个请求可能同时收到可刷新的 401。若每个请求各自发 refresh，而服务端对 refresh token 采用旋转策略，只有第一个刷新可以成功，后续仍用旧 token 的刷新请求可能被判断为重放，并使整个令牌家族失效。

请求内核用模块级 `refreshInFlight` 保存正在进行的 Promise：

```ts
let refreshInFlight: Promise<string> | null = null

const refreshOnce = () => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}
```

在这次 Promise 结束之前，所有遇到过期响应的请求等待同一个刷新结果。刷新成功后 store 已更新 access token，等待中的请求分别用新 token 重发。finally 清除锁，下一次真正需要刷新时才能再发请求。

“单例 Promise”解决的是同一页面 JavaScript 执行上下文内的并发。多标签页之间是否共享锁、刷新轮换是否支持并行，是另一个跨标签协同问题；不能把这个局部机制描述成解决了所有浏览器并发。

## 单次重放：失败要停止，不能无限循环

原请求刷新成功后最多重试一次：

```ts
await refreshOnce()
return rawRequest<T>(path, options, { ...flags, retried: true })
```

若重放请求仍然返回 401，`retried` 会阻止再次刷新，避免无限循环。刷新调用本身也带有 `isRefreshCall`，并设置 `skipRefresh`，否则刷新失败就可能递归调用自己。账号停用错误码和普通过期错误要分别处理，前者显示禁用原因，后者按会话过期路径清理并返回登录。

这些 flag 属于 request 内核的内部状态，不是业务功能的通用开关。若页面调用时随意关闭跳转或跳过刷新，可能造成认证失效后仍继续展示受保护页面。

## 退出：服务端作废与本地清理都要执行

`logout()` 在 `try/finally` 中请求退出，并确保无论网络请求成功与否，本地 auth store 最终清除：

```ts
export const logout = async () => {
  const auth = useAuthStore(pinia)
  try {
    await http.post<void>('/auth/logout',
      auth.refreshToken ? { refreshToken: auth.refreshToken } : {},
      { skipAuthRedirect: true, skipRefresh: true },
    )
  } finally {
    auth.clear()
  }
}
```

服务端退出负责作废令牌家族并清理 refresh cookie；本地清理负责立即移除 access token、用户和当前内存 refresh token。网络断开时，客户端不能声称服务端已成功撤销，但界面仍应退出当前会话。后续恢复时，服务端 Cookie 状态决定刷新是否仍能成功。

密码变更、管理员重置密码或账号禁用也可能让服务端令牌失效。前端要把服务端返回的认证错误统一映射到清理流程，而不是只清理某个页面状态。

## 路由守卫与会话状态的配合

路由守卫检查 `accessToken` 与 `user` 是否同时存在，再判断 `requiresAuth`、角色入口和能力权限。会话恢复完成后才挂载应用，保证这些判断不是基于初始空 store 做出的瞬时决定。被拦截的目标路径存入 navigation state，登录完成后可以回到原地址。

授权还分为几层：菜单是否展示、路由能否访问、页面操作是否可见，以及后端是否允许这次读写。前端守卫减少错误导航和误操作，却不能代替 API 的服务端鉴权。直接构造请求的用户不受菜单控制，后端仍必须验证 token、角色和资源归属。

## 测试与验收边界

request 测试能证明：两个过期请求共享一次刷新、重放时使用新 Bearer token；它不能证明生产域名上的 Cookie 属性、CORS 响应头、TLS 或真实账号状态正确。线上验收要在浏览器网络面板核对登录、Set-Cookie、刷新、带凭证请求、退出清 cookie 的实际行为，同时避免把 token 值复制到日志或截图。

也要区分“浏览器刷新页面后会恢复登录”和“把 refreshToken 存到 localStorage 后恢复”。本项目选前者：由 HttpOnly Cookie 完成浏览器会话恢复，页面脚本只持有运行时 access token。移动端采用不同凭证载体，正是契约为不同客户端明确区分行为的例子。

## 小结：会话闭环由客户端与服务端共同完成

Vue 后台的会话生命周期是：登录建立内存态，启动时用 Cookie 恢复，过期时合并并发刷新，失败请求最多重放一次，登出时服务端撤销并在本地无条件清理。access token 不持久化，refresh token 的浏览器长期载体由 HttpOnly Cookie 管理。安全属性、令牌轮换和撤销最终由服务端契约及部署配置共同保障。

下一篇将从会话进入路由边界：如何把登录回跳、角色入口和能力级 403 放在 Vue Router 中，同时让菜单、直接 URL 和后端授权保持各自职责。

## 延伸阅读

- [用 fetch 建一层可控的请求内核]({{LINK:M7-06}})
- [按钮级权限：能力映射、菜单过滤与自锁保护](https://blog.csdn.net/fungleo/article/details/166233264)
- [API 契约：刷新令牌与令牌轮换](../docs/api/openapi.v1.yaml)
- [MDN：Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、身份认证、JWT、Cookie、令牌刷新、前端安全

### 文章简介（250 字以内）

本文沿 Vue 管理后台实现，完整分析登录后建立 Pinia 内存会话、启动时通过浏览器 Cookie 恢复、并发 401 合并刷新、失败请求单次重放、账号禁用处理及退出清理。重点区分 Web 的 HttpOnly Cookie 与移动端安全存储路径，并说明前端会话代码、后端令牌撤销和部署 CORS/Cookie 属性各自的责任及验证边界。

### 建议发布分类

前端 / Vue.js

### 封面短标题

登录会话完整生命周期

### 配图 AI 提示词

1. M7-07-封面：登录、内存 access token、HttpOnly refresh cookie、并发刷新合并、单次重放、退出撤销构成完整环形流程图；白色浅蓝底、深色文字，简洁安全工程风格。
2. M7-07-并发刷新：多个过期 API 请求汇聚到单个 refresh promise，成功后各自携新 access token 重放一次；失败进入统一清理和登录跳转。明确标注“同一页面执行上下文”。
3. M7-07-启动恢复：放在正文同名占位处，会话恢复时序：应用启动先建立会话、再挂载路由，避免未认证闪烁。

### 发布前核对

- [ ] 对照 auth store、bootstrapSession、refreshOnce、forceLogout 和 logout 的实现核对流程。
- [ ] 核对 OpenAPI 浏览器 Cookie 与移动端请求体凭证差异。
- [ ] 不把本地代码测试描述成生产 Cookie/CORS 验收。
- [ ] 用实际配图替换三处 IMG 占位，并将延伸阅读中的 LINK 占位替换为已发布文章地址。
- [ ] 发布时删除本段辅助信息，勿在截图或日志中泄露凭证。
<!-- PUBLISH_ASSIST_END -->
