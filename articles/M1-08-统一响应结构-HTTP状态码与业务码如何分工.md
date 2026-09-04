# 成为全栈·Node 后端篇·统一响应结构：HTTP 状态码与业务码如何分工

写前端久了你会养成一个习惯：调接口最怕的，不是接口挂了，而是**十个接口十种返回格式**。A 接口返回 `{ success: true, data: [...] }`，B 接口返回 `{ code: 0, result: {...} }`，C 接口干脆把数组直接甩出来。前端每接一个接口都要重新读懂它的"脾气"，代码里塞满 `res.data?.result ?? res.list` 这种防御性判断。

我早年参与过一个项目，三个后端同学各自发挥：登录返回 `{ret:0, info:{...}}`，列表返回 `{list:[...], total:99}`，错误直接丢个字符串 `'参数错误'`。前端小伙每接一个接口都要翻聊天记录问"你这回又返回啥结构"。后来统一信封后，他跟我说："现在我能写一个通用拦截器，全站错误提示一行搞定，之前那叫一个惨。"——统一格式省下的，是全生命周期的对接成本，不是一时的打字量。

![成为全栈·Node 后端篇·统一响应结构：HTTP 状态码与业务码如何分工](https://i-blog.csdnimg.cn/direct/c51705fc6d6349edbf728f88366e5965.png)

后端成熟的标志之一，就是**所有接口返回同一个"信封"格式**。这一篇我们拆开这个信封，讲清 `code` / `message` / `data` / `requestId` / `timestamp` 各管什么，以及 HTTP 状态码和业务码怎么分工。

## 一、为什么需要统一信封

统一响应信封（envelope）的本质，是**前后端之间的一份"返回格式契约"**：无论成功失败、返回的是单对象还是列表，外壳永远长一样。前端只要写一套解析逻辑，就能通吃所有接口。

我们的信封由 `src/shared/response.ts` 的 `envelope()` 函数构造：

```ts
const envelope = <T>(code: number, message: string, data: T | null): Envelope<T> => ({
  code,
  message,
  data,
  requestId: requestId(),
  timestamp: new Date().toISOString(),
});
```

五个字段各有职责：

- **`code`**：业务码。`0` 表示成功，非 `0` 是具体错误类型（如 `4001` 校验失败、`3001` 资源不存在）。前端用它做**细分判断**，而不是靠猜。
- **`message`**：给人看的中文文案（"参数校验失败"）。直接弹给用户或打日志都行。
- **`data`**：真正的数据负载。成功时是对象/数组，失败时通常是 `null`。
- **`requestId`**：每次响应生成的唯一 ID。用户报障时说"我刚才那个请求报错了"，你把 `requestId` 甩给后端，对方一查日志精准定位——这是排障的"快递单号"。
- **`timestamp`**：响应时间。便于前端算网络耗时、或做时效性校验。

注意 `code` 和 HTTP 状态码是**两套东西**，下面专门讲它们怎么分工。

## 二、HTTP 码 vs 业务码：两套各管一摊

这是新手最容易混的点。结论先给：**HTTP 状态码给"机器"（网关、浏览器、CDN）看，业务码给"前端逻辑"看**。

- **HTTP 状态码（401/403/404/429/500）**：语义是"传输层结果"。网关靠它做缓存、限流、重试；浏览器靠它判定是否跨域、是否重定向。它只能表达"粗粒度"——"你是没权限（403）"、"资源不在（404）"、"你太快了（429）"。
- **业务码（1001/4001/3001…）**：语义是"业务结果"。同样是 401，是"令牌过期了"还是"账号被禁用"？HTTP 码说不清，但业务码 `1002`（TOKEN_INVALID）和 `1005`（ACCOUNT_DISABLED）一目了然。前端据此决定是弹"请重新登录"还是"联系管理员"。

举个真实例子：用户调一个需要登录的接口，返回 401。如果只有 HTTP 码，前端只知道"没权限"，只能笼统弹"请登录"；但业务码区分了 `1002`（令牌过期）和 `1005`（账号被禁用）——前者前端可以静默用刷新令牌续期、用户无感知，后者必须跳转"账号异常请联系管理员"页。同样一个 401，两种业务码决定了两种完全不同的用户体验。这就是双层码存在的意义：HTTP 码管"通不通行"，业务码管"不行的话具体为啥、我该怎么应对"。

另外提醒一个容易混淆的点：**成功响应的 `code` 也是 `0`，前端永远先看 `code` 判断业务成败，HTTP 200 只代表"传输成功"**。别用 HTTP 状态码当业务成败的唯一依据——否则遇到"HTTP 200 但业务拒绝"的情况就会失手。

所以我们的纪律是：**一次错误，两个码一起给**。HTTP 码让基础设施正确处置，业务码让前端精细响应。这在《契约先行》那篇讲的“错误码机器化”里是核心一环 [契约先行](https://blog.csdn.net/fungleo/article/details/164140515)。

## 三、列表信封：把分页也包进 `data`

列表接口和普通单对象接口不一样——它除了数据，还要告诉前端"总共多少条、第几页"。我们的做法是把 `list` 和 `pagination` 一起塞进 `data`：

```ts
export const paginate = <T>(list: T[], pagination: Pagination, message = 'ok'): Response =>
  Response.json(
    envelope(0, message, { list, pagination } satisfies { list: T[]; pagination: Pagination }),
    { status: 200 },
  );
```

返回的 JSON 形如：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [ { "id": 1, "title": "..." } ],
    "pagination": { "page": 1, "pageSize": 10, "total": 137 }
  },
  "requestId": "a1b2c3...",
  "timestamp": "2026-08-27T..."
}
```

前端拿到 `data.pagination.total` 就能算总页数，拿到 `data.list` 直接渲染。约定稳定，前端不用每次猜"分页信息到底挂哪"。

![统一响应信封图](https://i-blog.csdnimg.cn/direct/516780d3cab84213a1603f3d437760a9.png)

## 四、P-14：信封返回原生 `Response`，零框架依赖

这里有个很关键的设计抉择（P-14），它直接关系到代码的可测试性和双部署能力。`shared/response.ts` 里的构造器，**返回的是原生 `Response`，而不是 Hono 的 `c.json()`**：

```ts
export const ok = <T>(data: T, message = 'ok'): Response =>
  Response.json(envelope(0, message, data), { status: 200 });
```

好处有两个，都很实在：

**第一，零框架依赖。** `shared/response.ts` 不 `import` Hono 任何东西。意味着这套信封逻辑能在 Node 跑、在 Cloudflare Workers 跑、在纯测试环境跑——`Response.json()` 是 Web 标准，到处都有。

**第二，单测不用起 Hono。** 因为返回的是标准 `Response`，测试时直接 `await resp.json()` 断言信封内容即可，不必为了测一个构造器去 `app.request()` 发请求。涉及响应的逻辑（错误处理、分页组装）因此能被轻量单测覆盖。这和我们 M1-02 里"选 Hono 的伏笔"呼应：handler 返回原生 `Response`，让基础设施层与框架彻底解耦。

## 五、P-15：双层错误码，一张映射表管到底

错误怎么变成信封？我们有一套"双层码"机制（P-15），核心是一张**业务码 → HTTP 码**的映射表，集中在 `src/shared/codes.ts`：

```ts
export const HttpForCode: Record<BizErrorCode, number> = {
  [ErrCode.USERNAME_OR_PASSWORD_ERROR]: 401,
  [ErrCode.TOKEN_INVALID]: 401,
  [ErrCode.FORBIDDEN]: 403,
  [ErrCode.NOT_FOUND]: 404,
  [ErrCode.CONFLICT]: 409,
  [ErrCode.STATE_CONFLICT]: 409,
  [ErrCode.VALIDATION]: 400,
  [ErrCode.INTERNAL]: 500,
  [ErrCode.RATE_LIMITED]: 429,
};
```

业务代码里永远只抛**业务码**，HTTP 码由这张表自动查出来。看 `src/shared/errors.ts` 的 `AppError`：

```ts
export class AppError extends Error {
  public readonly code: BizErrorCode;
  public readonly httpStatus: number;
  constructor(code: BizErrorCode, httpStatus?: number, message?: string, details?: unknown) {
    super(message ?? ErrorMessages[code]);
    this.code = code;
    this.httpStatus = httpStatus ?? HttpForCode[code]; // 没显式给 HTTP 码就查表
  }
}
```

于是业务层写 `throw new AppError(ErrCode.NOT_FOUND, 404)` 或干脆 `throw new AppError(ErrCode.NOT_FOUND)`（HTTP 码自动是 404）。**好处是"业务语义"和"传输语义"解耦**：哪天你觉得某个业务错误该换个 HTTP 码，只改 `HttpForCode` 一处，业务代码纹丝不动。

还有个精妙细节：`ErrorMessages` 和 `HttpForCode` 都用 `[ErrCode.XXX]` 计算属性键。这意味着**契约里新增一个错误码，这里漏配就会编译报错**——错误码被"锁"在了类型系统里，不会悄悄漂移。这正呼应《契约先行》里错误码机器可读化的要求。

## 六、P-16：信封冲突——以契约为准（"实现不得偏离契约"的第一个真实案例）

最后讲一个让我印象深刻的真实踩坑（P-16），它是"契约先行"从口号落到代码的第一个硬案例。

项目早期的主计划里，我们给响应信封设计过一版结构（计划 §3.1），带了一些自定义字段。但等 OpenAPI 契约冻结、机器校验跑起来后，契约里的 `ApiResponse` 才是**权威定义**——它和我们计划里的信封在字段结构上有直接矛盾。

这时候怎么选？答案是无条件的：**以契约为准，放弃计划里的信封设计**。契约是七端（前端、各端后端、测试、文档）共同依赖的单一事实源，实现只能去对齐它，不能让契约迁就某一份早期计划。`shared/response.ts` 顶部那句注释"对齐契约 components.schemas.ApiResponse"，就是这次对齐的记号。

这件事给我（以及做全栈的你）的教训很深刻：**计划是草稿，契约是法律**。当你的实现和契约打架，先怀疑的是实现，不是契约。这也是为什么我们宁可花大力气把契约机器化校验（双门全绿），因为它替你在"实现飘了"的时候踩了刹车。

具体到这次信封冲突，是双门校验（结构门 + 语义门）在我们改代码时发现"返回结构与契约 `ApiResponse` 字段对不上"——机器比人眼尖，它不会因为"功能好像能跑"就放行。所以契约机器化不是负担，是你半夜不会被叫醒的保障：每一次 `code` 字段对不上、每一个错误码漏配，都在合并前被挡下，而不是上线后由用户帮你测出来。

## 七、小结与前瞻

统一响应结构，是后端" professionalism" 的第一块招牌：

1. **统一信封**：`code/message/data/requestId/timestamp`，前后端一份格式契约。
2. **双层码分工**：HTTP 码给机器（网关/浏览器），业务码给前端逻辑细分。
3. **列表信封**：`data` 内包 `list + pagination`，分页信息有固定去处。
4. **P-14**：信封构造器返回原生 `Response.json()`，零框架依赖，单测不用起 Hono。
5. **P-15**：业务码 → HTTP 码由 `HttpForCode` 映射表集中管理，`throw AppError` 自动查表；漏配编译即报错。
6. **P-16**：信封与契约冲突时，**以契约为准**——这是"实现不得偏离契约"的第一个真实案例。

下一篇（[错误处理：异常分层与全局捕获](https://blog.csdn.net/fungleo/article/details/164327333)）我们聊错误处理：异常怎么分层、`AppError` 怎么被全局中间件捕获转成信封、以及为什么堆栈信息绝不能泄漏给前端。那是这套信封真正"活"起来的地方。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

