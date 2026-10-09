# 成为全栈·Vue 管理后台篇·用 fetch 建一层可控的请求内核

> 请求层是页面和后端之间的边界。它既不该散落在每个组件里，也不应把所有业务揉成一个巨大的客户端。本文拆解 Vue 后台的 fetch 内核，覆盖 URL、query、统一信封、错误、Bearer token 和 FormData。

{{IMG:M7-06-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `manage-frontend-vue/src/lib/request/index.ts`、`errors.ts`、`session.ts` 和 `index.test.ts`。

## 前言：为什么封装请求，而不是每页都写 fetch？

后台页面需要列表、编辑、上传、登录、刷新令牌等请求。如果每个页面直接调用 `fetch`，每一处都要重复处理基础 URL、Bearer token、JSON 编码、统一响应信封、错误码、无内容响应和网络断开。重复实现不只增加代码，更容易出现行为不一致：有些请求忘记带凭证，有些错误直接显示原始 JSON，还有些上传把浏览器需要的 multipart boundary 覆盖掉。

Vue 后台把这些横切规则放在 `src/lib/request/`，业务端点放在 `src/api/`，页面只组合用户交互和业务 API。这层内核依然使用标准 `fetch`，没有引入另一套大型网络框架。这样既能看清浏览器实际做了什么，也能通过 mock fetch 对关键行为编写测试。

## 先确认统一响应信封

请求层基于项目 API 的统一响应结构：成功或失败都包含数值 `code`、`data`、`message`，并可带 `requestId` 与时间戳。内核读取响应文本，再解析 JSON：

```ts
const text = await response.text()
const envelope = JSON.parse(text) as ApiResponse<T>

if (typeof envelope?.code !== 'number') {
  throw new ApiError({
    code: ErrCode.INTERNAL,
    status: response.status,
    message: '响应未遵循统一信封格式',
    data: envelope,
  })
}

if (envelope.code === ErrCode.OK) return envelope.data as T
```

这里先检查空响应，再解析 JSON，再验证信封的最低结构。若网络不可达、响应为空、JSON 格式错误或信封缺少数值 `code`，都会转换成 `ApiError`，供界面按统一方式展示。HTTP 状态码与业务错误码各自保留：前者来自 `Response.status`，后者来自信封 `code`。

需要理解一个类型边界：`JSON.parse(text) as ApiResponse<T>` 是 TypeScript 断言，不会运行时校验每个字段。内核检查了 `code` 形状，却没有用 schema validator 对整个 data 对象逐项验证。契约测试、服务端测试或运行时验证解决不同问题，不能把类型断言说成数据验证。

## URL 与 query 参数如何组合

请求内核的 `buildUrl` 接受相对业务路径，也支持传入绝对 HTTP(S) URL；相对路径会和 `API_BASE` 拼接。`query` 被逐项放入 `URLSearchParams`：

```ts
for (const [key, value] of Object.entries(query)) {
  if (value !== undefined && value !== null && value !== '') {
    params.set(key, String(value))
  }
}
```

因此 `0` 和 `false` 会保留，`undefined`、`null` 和空字符串会省略。不能用 `if (value)` 作为过滤条件，否则页码 0 或布尔 false 会被误删。`URLSearchParams` 负责特殊字符编码，避免组件自行拼接 `?page=...&keyword=...` 时漏掉空格、& 或中文编码。

数组参数、多值同名 key、嵌套对象的序列化需要按接口契约约定扩展。本项目当前的 query 类型是标量值字典，因此不假设复杂对象可以随意传入；若接口需要数组或过滤 DSL，应明确编码方式并增加测试。

## Header、凭证和请求体的统一处理

内核用 `Headers` 规范化调用者传入的 header，并默认声明接受 JSON：

```ts
const requestHeaders = new Headers(headers)
requestHeaders.set('Accept', 'application/json')

if (body !== undefined && !formData && !requestHeaders.has('Content-Type')) {
  requestHeaders.set('Content-Type', 'application/json')
}

if (!skipAuth && auth.accessToken) {
  requestHeaders.set('Authorization', `Bearer ${auth.accessToken}`)
}
```

普通对象请求体会被 `JSON.stringify`，并设置 `Content-Type: application/json`。认证 token 来自 Pinia auth store 的内存态，不需要页面每次手动添加。`skipAuth` 给登录、刷新等公开或特殊流程留出明确入口；`skipAuthRedirect`、`skipRefresh` 只用于控制认证错误的统一处理边界，不能被业务页面随意滥用来绕过权限。

请求配置统一使用 `credentials: 'include'`，使浏览器可以随跨域请求携带符合策略的 Cookie，例如刷新会话所需的 HttpOnly refresh cookie。能否实际跨域成功还取决于后端 CORS 与 Cookie 属性，前端设置 credentials 不能替代服务端配置。

## FormData 上传：不要手动设置 multipart Content-Type

图片上传是最容易被错误统一处理的地方。`FormData` 必须让浏览器生成 multipart boundary，例如 `multipart/form-data; boundary=----WebKitFormBoundary...`。如果代码手工设置只有 `multipart/form-data` 的 header，边界值没有包含在请求头里，服务端可能无法解析内容。

本项目先识别 `body instanceof FormData`，FormData 不设置 JSON Content-Type，也不 JSON.stringify：

```ts
const formData = typeof FormData !== 'undefined' && body instanceof FormData
if (body !== undefined && !formData) {
  requestHeaders.set('Content-Type', 'application/json')
}

body: formData
  ? (body as FormData)
  : body === undefined
    ? undefined
    : JSON.stringify(body)
```

测试直接检查传给 fetch 的 init：FormData body 原样传入，而且 headers 中没有 Content-Type。这个测试固定住浏览器应当负责 boundary 的关键事实。页面/API 模块负责构造 `FormData` 并调用附件端点，内核保证不破坏它。

## 一次请求的主流程

请求内核的顺序大致如下：

1. 读取 options，识别 FormData，构造 URL 和 query。
2. 取当前 auth store，准备 Accept、Content-Type、Authorization headers。
3. 调用 `fetch`，统一采用 `credentials: 'include'`。
4. 将网络异常转换为状态码 0 的网络错误。
5. 读取响应文本；成功空响应返回 `undefined`，失败空响应转换为错误。
6. 解析 JSON 并检查统一信封结构。
7. 成功时返回 `data`；失败时根据错误码处理 refresh/force logout，再抛出 `ApiError`。

提供 `http.get/post/put/patch/delete` 是为了让调用端更容易表达 HTTP 方法，最后它们仍然走同一个 `request`。这个薄 API 不会隐藏底层 fetch 太多，也避免页面重复分支。

## 错误模型：把网络失败、HTTP 状态与业务码讲清楚

请求失败可能来自不同层：浏览器根本无法连通、服务器返回非 JSON、服务器遵循统一信封返回业务失败、认证过期或账号停用。统一转换为 `ApiError` 后，页面可以对用户显示可读消息，同时测试仍可检查业务 code、HTTP status、request ID 和附带数据。

错误消息映射集中在 `errorCodes.ts` 和 `errors.ts`，而不是每个组件再从数字猜意思。请求层针对 401 和具体错误码执行会话恢复规则，其余错误抛给页面或 Vue Query 的 error 状态。组件决定何时显示 message/toast，内核负责准确分类，分工避免请求层强耦合 Naive UI。

不要把所有异常都显示成“请求失败”。若用户需要操作指引，就给明确提示；若是网络、服务错误或字段校验错误，显示对应消息；同时避免向普通用户泄露栈信息或内部敏感数据。`requestId` 可以作为定位线索，但是否显示应由产品设计决定。

## 401、刷新与重放的交界

内核把刷新行为纳入同一流程：遇到契约中可刷新的 401，执行 `refreshOnce()`，并用新 token 对原请求重放一次。并发请求共享 `refreshInFlight` Promise，因此同时过期时只发出一次 refresh。`retried` 标记阻止请求无限重放；刷新请求本身设置 `skipRefresh` 并标记 `isRefreshCall`，避免刷新失败又递归刷新。

本文的重点是请求内核边界，不展开完整会话生命周期；启动恢复、账号停用、退出与并发刷新会在 M7-07 详细说明。就此处而言，重要的是普通 API 函数无需复制刷新逻辑，认证恢复集中在可测的请求层。

## 用测试固定请求内核的关键行为

`index.test.ts` 至少覆盖：

- 成功响应信封被拆包，函数拿到 `data`。
- 两个并发过期请求共享一次 refresh，并分别以新 token 重试。
- FormData 不会被 JSON 编码，也不会被强行加 multipart Content-Type。

测试 mock 全局 fetch，检视输入 URL、headers、body 和调用次数。这不是在模拟整个互联网，而是在稳定验证本模块负责的行为。网络环境、线上 CORS、Cookie Secure/SameSite 和真实文件存储仍需要集成或环境验收，单元测试不能替代它们。

后续扩展 query 数组编码、超时 AbortSignal、重试策略时，也应先明确行为边界并写针对性测试。自动重试写操作可能导致重复提交；是否可重试必须结合幂等性和服务端契约，不能只因为网络抖动就重试所有请求。

## 小结：请求层做横切规则，API 层表达业务端点

Vue 后台的请求内核统一处理 URL、query、凭证、JSON/FormData、信封、错误和认证刷新；`src/api/` 把契约端点变成业务函数；页面决定交互、反馈和缓存刷新。FormData 交给浏览器生成 boundary，TypeScript 泛型不等于运行时数据验证，跨域 Cookie 仍依赖服务端设置。

下一篇将以这层请求能力为基础，沿着启动恢复、access token 内存态、refresh cookie、并发刷新、重放和退出，完整分析后台会话生命周期。

## 延伸阅读

- [从冻结 OpenAPI 生成类型，并组织 Vue API 模块]({{LINK:M7-05}})
- [登录恢复与刷新令牌：Vue 后台的会话生命周期]({{LINK:M7-07}})
- [MDN：Using FormData Objects](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects)
- [MDN：Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Fetch、HTTP、FormData、接口封装、前端工程化

### 文章简介（250 字以内）

本文拆解 Vue 管理后台基于 fetch 实现的请求内核，说明 URL 与 query 序列化、统一响应信封、ApiError、Bearer token、凭证策略、JSON 请求体及 FormData 上传的处理边界。结合真实测试解释为什么不能手动设置 multipart boundary、为什么 TypeScript 泛型不等于运行时校验，以及并发过期请求如何由内核共享刷新流程。

### 建议发布分类

前端 / Vue.js

### 封面短标题

Fetch 请求内核

### 配图 AI 提示词

1. M7-06-封面：从 Vue 页面到 API 业务函数，再到 fetch 请求内核、HTTP API 的分层流程图；请求内核旁标注 URL/query、认证、JSON/FormData、信封/错误，白色浅蓝底与深色文字。
2. M7-06-上传：展示浏览器生成 multipart boundary 的过程，FormData 原样进入 fetch，Content-Type 由浏览器自动补齐 boundary；对比错误的手动 header 写法，以清晰技术信息图呈现。

### 发布前核对

- [ ] 对照当前 request/index.ts、errors.ts、session.ts 核实刷新分支和错误映射。
- [ ] 检查 FormData 测试确实断言无 Content-Type 且 body 原样传递。
- [ ] 核实 API_BASE、credentials 与部署 CORS/Cookie 配置的关系，不将前端配置描述成线上已验收。
- [ ] 补齐 M7-05、M7-07 内链。
- [ ] 发布时删除本段辅助信息，检查代码块与流程图排版。
<!-- PUBLISH_ASSIST_END -->
