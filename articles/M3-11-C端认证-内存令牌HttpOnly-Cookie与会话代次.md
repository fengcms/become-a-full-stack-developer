# 成为全栈·Next.js 网站前台篇·C 端认证：内存令牌、HttpOnly Cookie 与会话代次

> access token 放在内存可以缩短暴露时间，refresh token 放进 HttpOnly Cookie 可以避开 JavaScript 读取。但真正困难的部分，是多个请求同时 401、刷新时退出登录，以及旧账号请求晚到这些竞态。

![成为全栈·Next.js 网站前台篇·C 端认证：内存令牌、HttpOnly Cookie 与会话代次](https://i-blog.csdnimg.cn/direct/199c99b9ef1b4e9588af4c0d34c82307.png)

## 前言

公开内容站加入会员功能以后，认证经常被简化成三步：登录拿 token、请求加 Authorization、401 就刷新。单条请求这样写很容易，页面一打开同时请求资料、收藏和通知时，系统却会进入并发世界。

如果三个请求同时 401，它们可能同时拿同一个 refresh token 去刷新。后端采用刷新令牌旋转时，第一个请求成功并换发新令牌，后两个继续使用旧令牌，随后失败并把用户踢出登录。

更隐蔽的是，用户在刷新请求未完成时点击退出；旧刷新结果晚到后，又把已经结束的会话“复活”。所以这篇不只讨论 token 存哪里，而是把会话当成有生命周期和代次的并发状态。

## 两种令牌承担不同风险

| 凭证 | 当前存放位置 | 生命周期 | JavaScript 能否读取 | 主要用途 |
| --- | --- | --- | --- | --- |
| access token | Zustand 内存 | 较短 | 可以 | API Authorization |
| refresh token | HttpOnly Cookie | 较长 | 不可以 | 静默恢复与换发 access token |

access token 不进入 localStorage，刷新页面后自然丢失。浏览器仍会把同源 HttpOnly Cookie 自动带给刷新接口，应用启动时有机会恢复会话。

这不是“绝对安全”的宣言。XSS 仍可能在当前页面生命周期内以用户身份发请求；Cookie 仍需要 SameSite、Secure、Path 和跨站写入保护。存储方案只是减少某些攻击面，不能代替完整防御。

![令牌生命周期](https://i-blog.csdnimg.cn/direct/03e27de71bf3495fa3e0efa2005f550c.png)

## Zustand 只保存浏览器当前需要的会话状态

```ts
interface AuthState {
  generation: number
  accessToken: string | null
  user: PublicUser | null
  bootStatus: 'idle' | 'booting' | 'ready'
  setSession: (auth: AuthResult) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  generation: 0,
  accessToken: null,
  user: null,
  bootStatus: 'idle',
  setSession: (auth) => set({
    accessToken: auth.accessToken,
    user: auth.user,
    bootStatus: 'ready',
  }),
  clear: () => set((state) => ({
    generation: state.generation + 1,
    accessToken: null,
    user: null,
    bootStatus: 'ready',
  })),
}))
```

`bootStatus` 区分“还没尝试恢复”和“已经确认是游客”，避免会员页面在启动瞬间误跳登录。`generation` 则是本篇最重要的字段：每次清除会话都递增，旧异步任务即使完成，也不能再写回新生命周期。

## 启动恢复需要去重，也要允许游客失败

```ts
let bootInFlight: Promise<boolean> | null = null

export const bootstrapSession = (): Promise<boolean> => {
  if (bootInFlight) return bootInFlight

  const store = useAuthStore.getState()
  if (store.bootStatus === 'ready') {
    return Promise.resolve(Boolean(store.accessToken))
  }

  const generation = store.generation
  store.setBootStatus('booting')

  bootInFlight = refreshOnce()
    .then(() => true)
    .catch(() => {
      if (generation === useAuthStore.getState().generation) {
        useAuthStore.getState().clear()
      }
      return false
    })
    .finally(() => {
      useAuthStore.getState().setBootStatus('ready')
      bootInFlight = null
    })

  return bootInFlight
}
```

首次访问的游客没有 refresh Cookie，恢复失败是正常分支，不应弹出“登录失败”。Promise 去重还能兼容开发环境 StrictMode 或多个组件同时等待启动状态。

## 所有并发 401 必须共用一次刷新

```ts
let refreshInFlight: Promise<string> | null = null

const refreshOnce = (): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}
```

真正刷新时记录会话代次：

```ts
const performRefresh = async (): Promise<string> => {
  const generation = useAuthStore.getState().generation

  const auth = await rawRequest<AuthResult>('/auth/refresh', {
    method: 'POST',
    body: {},
    skipAuth: true,
    skipAuthRedirect: true,
    skipRefresh: true,
  }, { isRefreshCall: true })

  if (generation !== useAuthStore.getState().generation) {
    throw new Error('会话已结束，请重新登录')
  }

  useAuthStore.getState().setSession(auth)
  return auth.accessToken
}
```

等待中的业务请求拿到同一个新 access token 后各自重放。刷新接口自身设置 `skipRefresh`，重放请求带 `retried` 标记，防止 401 递归刷新形成死循环。

## 旧请求不能覆盖新账号

请求发出时同时记录代次和令牌：

```ts
const generation = useAuthStore.getState().generation
const sentToken = skipAuth ? null : useAuthStore.getState().accessToken

const response = await fetch(url, { headers, cache: 'no-store' })

if (!skipAuth && generation !== useAuthStore.getState().generation) {
  throw new Error('会话已切换，请重试')
}
```

还要处理另一种顺序：请求 A 带旧 access token 发出，请求 B 已经完成刷新并写入新 token，随后请求 A 才返回 401。此时无需再次刷新，直接用内存中的新 token 重放：

```ts
if (
  response.status === 401 &&
  !flags.retried &&
  sentToken !== useAuthStore.getState().accessToken &&
  useAuthStore.getState().accessToken
) {
  return rawRequest(path, options, { ...flags, retried: true })
}
```

这条分支减少无意义刷新，也避免用已经旋转失效的 Cookie重复换发。

## 401 不是一种错误，而是一组业务语义

| 401 原因 | 是否尝试刷新 | 页面行为 |
| --- | --- | --- |
| access token 过期 | 是 | 刷新成功后重放一次 |
| refresh token 过期或撤销 | 否或刷新失败 | 清会话并转登录 |
| 账号被禁用 | 否 | 清会话并说明禁用状态 |
| 登录凭据错误 | 否 | 留在登录表单显示字段错误 |
| 刷新接口自身 401 | 否 | 防止递归刷新 |

请求层根据业务错误码决定 `isRefreshable` 和 `shouldForceLogout`，不能看到 HTTP 401 就无条件刷新。否则密码错误也可能触发一次毫无意义的刷新请求。

## 身份切换时只清理私有查询

项目曾在身份变化时调用 `queryClient.clear()`，结果把公开文章流也清掉。现在根据 query key 保留公开内容：

```tsx
const unsubscribe = useAuthStore.subscribe((next, previous) => {
  if (next.user?.id !== previous.user?.id) {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'public-feed',
    })
  }
})
```

更大的项目可以建立清楚的 public/private key 工厂，不必只靠第一个字符串判断。核心原则是：会话改变必须清除用户数据，但不能误删与身份无关的公开内容。

## 客户端守卫不等于权限边界

会员 layout 可以在 `bootStatus === 'ready'` 且没有用户时跳转登录，这解决的是用户体验：避免未登录者看到一闪而过的会员页面。

真正的授权仍由后端完成。攻击者可以绕过 React 页面直接请求 API；只有后端对 token、角色和资源归属的校验才能阻止越权。前端内存令牌与守卫都不是后端权限检查的替代物。

## 用时间顺序验证会话竞态

```text
场景 A：三个私有请求同时 401
预期：只出现一次 /auth/refresh，三个请求各重放一次

场景 B：refresh 在飞时点击退出
预期：generation 递增，旧 refresh 成功结果不能恢复会话

场景 C：A 账号资料请求在飞时登录 B
预期：A 的响应被代次检查拒绝，不能写进 B 的页面

场景 D：旧 token 请求晚到 401，新 token 已存在
预期：直接使用新 token 重放，不再次刷新
```
![并发刷新时序](https://i-blog.csdnimg.cn/direct/e3669b9ef6ac47f495f42e5192084fdc.png)

还要检查 token 不出现在 localStorage、sessionStorage、URL 和错误日志里；刷新响应 JSON 中也不应把 refresh token交给客户端 JavaScript。

## 适用边界

这套架构适合公开内容为主、会员交互为辅的前台。若整个应用都在受保护服务端页面中运行，可以考虑服务端会话与 BFF 代持访问令牌，但仍要处理刷新旋转和并发。

若系统采用一次性会话、WebAuthn 或第三方身份平台，具体令牌形态会不同。不过“旧生命周期的异步结果不得写回新会话”仍是通用并发原则。

## 小结

token 放在哪里只是认证设计的第一层。完整的会话还需要启动恢复、刷新 Promise 去重、单次重放、业务错误分流，以及阻止旧请求跨越退出和账号切换。

`generation` 看起来只是一个整数，它真正表达的是：会话已经进入下一代。旧世界里完成的异步任务，没有资格修改新世界的用户状态。

## 延伸阅读

- [服务端组件与客户端组件](https://blog.csdn.net/fungleo/article/details/166737733)
- [同源 BFF 代理](https://blog.csdn.net/fungleo/article/details/166991347)
- [会员中心：资料、密码与个人数据](https://blog.csdn.net/fungleo/article/details/166991388)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`JWT`、`HttpOnly Cookie`、`Token 刷新`、`Zustand`、`前端安全`

### 文章简介（250 字以内）

access token 存内存、refresh token 存 HttpOnly Cookie 只是认证的起点。本文结合真实请求层，拆解启动恢复、并发 401 共用刷新 Promise、单次重放、会话代次与账号切换隔离，说明如何阻止退出后旧请求复活会话。

### 建议发布分类

前端开发 / Next.js / Web 安全

### 封面短标题

不要让旧请求复活会话

### 配图 AI 提示词

1. `M3-11-封面`：16:9 技术博客封面，内存中的短期 access token 与 HttpOnly Cookie 中的 refresh token 分列两侧，中间是一条标有 generation 的会话时间轴，旧请求被隔离门拦住；中文短标题“不要让旧请求复活会话”，深蓝背景、青绿安全线路、橙色旧请求，无 Logo 和水印。
2. `M3-11-令牌生命周期`：16:9 双轨生命周期图，上轨 access token 位于浏览器内存并随刷新消失，下轨 refresh token 位于 HttpOnly Cookie 并用于启动恢复，标出 JavaScript 可读与不可读边界，中文清晰。
3. `M3-11-并发刷新时序`：16:9 时序图，三个 API 请求同时 401 后汇入唯一 refresh Promise，成功后分别重放；下方展示退出登录使 generation 增加，旧刷新结果被拒绝，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-02、12、13 发布后回填站内链接
- [ ] 确认没有把客户端守卫描述成权限边界
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中时序文本、表格和代码块正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
