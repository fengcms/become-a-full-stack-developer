# 成为全栈·Node 后端篇·框架选型：Express、Koa、Fastify、NestJS 的差异与为何选 Hono

> 前置知识：建议先读 [技术选型不是投票：七个子项目技术栈的定法](https://blog.csdn.net/fungleo/article/details/164121738)（M0-03，讲"选型方法"）、[用一个真实系统串起全栈](https://blog.csdn.net/fungleo/article/details/164120426)（M0-02，本工程的七端全貌）。这篇是 M1 的第二站，聊"后端入口"——Web 框架。

框架选型是后端工程的第一道岔路口。很多教程一上来就说"我们用 Express"或者"我们用 NestJS"，却很少讲**为什么**。我更想带你从"我们这个工程到底被什么约束"出发，反推出答案——因为选型从来不是给框架排名，是给约束找最合身的那一个。

![成为全栈·Node 后端篇·框架选型：Express、Koa、Fastify、NestJS 的差异与为何选 Hono](https://i-blog.csdnimg.cn/direct/44684cde40e840e3b5535883175a0973.png)


下一篇（[分层架构-Controller-Service-Repository的边界](https://blog.csdn.net/fungleo/article/details/164209137)）我们会顺着框架往下，讲分层架构；而 Hono 一个很妙的设计，会在 [统一响应结构：HTTP状态码与业务码如何分工](https://blog.csdn.net/fungleo/article/details/164289071) 统一响应信封时回来兑现。先别急，这一篇先把"为什么是 Hono"讲透。

你可能会想：Node 不是自带 `http` 模块吗，为什么还需要框架？确实能裸写——`http.createServer((req, res) => { ... })` 也能起一个服务。但路由匹配、查询参数解析、请求体 JSON 读取、中间件编排这些事，全得自己造轮子。框架真正的价值，是把"每个 Web 服务都要重复造一遍"的东西标准化。Hono 的"轻"，是只给你必要的标准件，而不是什么都没有。理解了这点，后面看它怎么被用起来就不会觉得"太单薄"。

## 一、四个候选，一句话定位

我们的候选池是 Node 生态里最常见的四个。先各给一句话，建立直觉：

- **Express**：Node Web 框架的"事实标准"，生态最大、教程最多。但它的中间件是 `(req, res, next)` 回调模型，TS 支持靠 `@types/express` 外挂，本质还停留在"Node 传统时代"。
- **Koa**：Express 原班人马出的"下一代"，用 `async/await` 洋葱模型中间件、`ctx` 统一封装，比 Express 清爽，但依然是偏 Node 的传统思路，对边缘运行时（Cloudflare Workers）基本没考虑。
- **Fastify**：性能怪兽，内置基于 schema 的请求校验（ajv），TS 类型推导很顺，适合"要榨性能"的场景。但生态比 Express 小一圈，而且它仍是"Node 向"框架。
- **NestJS**："Spring 式"的企业级框架，IoC/依赖注入、模块化、装饰器满天飞，适合大团队大项目。但对小项目偏重，学习曲线陡，而且强绑定 Node。

你看，这四者都在回答"怎么在 Node 上写 Web 服务"，但侧重点完全不同：Express 求"稳和全"、Koa 求"轻和雅"、Fastify 求"快"、NestJS 求"规整和企业级"。

顺着这个侧重点，它们各自适合的场景也清晰了：**Express** 适合接手老项目、或要现成中间件（生态最大）；**Koa** 适合想要比 Express 现代一点、又不想引入重框架的个人项目；**Fastify** 适合性能敏感的服务，比如内部网关、高 QPS 的纯 API；**NestJS** 适合多人协作、需要强规范和统一写法的中大型团队。没有谁错，只是"合身"的对象不同。

## 二、关键维度对比

光看一句话不够，我们按**对我们真正重要的几个维度**拉一张表：

| 维度 | Express | Koa | Fastify | NestJS | **Hono** |
|---|---|---|---|---|---|
| 中间件模型 | `(req,res,next)` 回调 | `async/await` 洋葱 | plugin/hook + schema | 装饰器 + DI | 数组 + Web 标准 |
| TS 友好度 | 靠外挂类型 | 一般 | 较好 | 原生强 | 一等公民 |
| 边缘部署（CF/Deno） | 基本无 | 无 | 弱 | 弱 | **原生** |
| 体积 / 心智负担 | 中 | 轻 | 中 | **重** | **极轻** |
| 业务层耦合度 | 高（离不开 `res`） | 中（离不开 `ctx`） | 中（离不开 `reply`） | 高（强框架） | **低（返回 `Response` 即脱离）** |

最后一行是重点：**业务层会不会被框架绑死**。在 Express 里你写响应离不开 `res.json()`，在 Fastify 里离不开 `reply.send()`——这意味着你的"返回数据"逻辑，天生就和这个框架焊在一起。焊死了有什么后果？单测要起框架上下文、换个运行时要重写、迁移成本陡增。

我们恰恰最怕这个。因为我们的定位是"**同一套代码，既能跑在自管的 Linux（Node），又能跑在 Cloudflare Workers（边缘）**"。如果业务层被某个 Node 专属框架焊死，这个定位从第一天就破产了。

![框架对比](https://i-blog.csdnimg.cn/direct/2603e887c6864de1847f89d0a2919e90.png)


## 三、为什么是 Hono：那一个"返回 Response 合法"的妙处

Hono 打动我们的，不是它"快"或者"火"，而是一个常被忽略的设计：**Hono 的 handler 允许直接返回 Web 标准的 `Response` 对象**。

这听着很不起眼，但它是我们整个"零框架依赖"策略的支点。讲个真实的开发小故事（来自本工程的 `DEV-LOG`）：

最初写 `src/shared/response.ts` 里的 `ok(data)` 时，直觉是 `return c.json(...)` —— 简单直接。但这样信封构造器就必须 `import` Hono 的 `Context`，于是**单测要起一个 Hono 上下文才能跑**，业务逻辑和框架悄悄焊上了。

改成返回原生 `Response.json(...)` 之后，画风变了：

```ts
// src/shared/response.ts（真实代码，已冻结）
/** 成功：单对象 / 无数据。HTTP 200。 */
export const ok = <T>(data: T, message = 'ok'): Response =>
  Response.json(envelope(0, message, data), { status: 200 });
```

`ok / paginate / created / failResponse` 全成了**纯函数**——Node 能用、CF 能用、测试环境也能用，而且它们**根本不 import Hono**。而 Hono 的 handler 直接 `return ok(data)` 完全合法（因为 handler 的合法返回值里就包含 `Response`）。

这一条，让整个 `shared/` 和大部分 `services/` 层**零框架依赖**。换个角度想：在 Express 里你离不了 `res`，在 Fastify 里离不了 `reply`，只有 Hono 把 Web 标准 `Response` 当一等公民，才让"业务逻辑不认识框架"这件事变得自然。

> 这个伏笔先埋下：[统一响应结构：HTTP状态码与业务码如何分工](https://blog.csdn.net/fungleo/article/details/164289071) 讲统一响应信封时，我们会看到"零框架依赖"如何反过来让单测极轻、让跨运行时复用成为可能。

## 四、双部署：同一套代码跑 Node 和 Cloudflare

选了 Hono，真正的红利在"双栈"。但"兼容 CF"这句话，是停在 PPT 上，还是能 `wrangler deploy` 跑起来，中间差着一个决定。

本工程里，入口是真分了两个文件的（都不是我编的，是冻结代码实况）：

- `src/index.ts`：Node 运行时入口，用 `@hono/node-server` 的 `serve` 起服务。本地开发、自管 Linux 部署走这里。
- `src/worker.ts`：Cloudflare Workers 入口，导出 `export default { fetch }`。
- 两者共用 `src/app.ts` 的 `createApp(env)` 工厂——**同一套路由和业务，只是"被谁驱动"不同**。

这里有个当时记在 `01-待确认问题.md` 里的待裁决项 Q5：**要不要额外补 `wrangler.toml` + `src/worker.ts`，让代码真正可部署 CF？还是只做适配层抽象、不出 CF 产物？**

选项 A 是多写一份 `wrangler.toml` 配置，日常开发测试仍在 Node（启动快、调试方便）；选项 B 是只做适配层、不出 CF 部署产物。我们最终选了 **A**——多走这一步，"兼容 Cloudflare"就从一句漂亮话，变成 `wrangler deploy` 能跑起来的事实。代价只是多维护一个配置文件，收益是定位成真。

> 适配层真正的"魔法"在 DB：Node 用 `better-sqlite3`（本地文件），CF 用 D1（绑定），通过 `setDb` 注入解耦，业务逻辑完全无感。这块细节留到 {{LINK:M1-24}} 再展开，这里先知道"有这层东西"就够了。

最后说句公道话：Hono 不是银弹。它的生态比 Express 小得多，很多能力要靠配套包自己拼起来——我们做请求校验用了 `@hono/zod-validator`、在 Node 起服用了 `@hono/node-server`（这些都在 `package.json` 里看得见的依赖），相当于"乐高"要自己挑零件。中文资料也相对少，踩坑时搜出来的多是英文。但我们愿意付这个代价，因为换来的"零框架依赖 + 跨运行时"是别的框架给不了的。选型从来是 trade-off，不是崇拜——把账算清楚，比追新重要。

## 五、选型的反面：什么情况下 Hono 不是最优

把话说全，也得讲清"我们不选 Hono 的场景"，免得你把它当银弹到处套：

- **高 QPS 网关 / BFF**：如果你的服务是内部网关、要榨极致性能、且只想跑在 Node，Fastify 内置的 ajv 校验和性能调优比 Hono 省心——我们选 Hono 不是为了快，是为了跨运行时。
- **大团队强规范协作**：几十人维护一个后端，需要统一的依赖注入、模块边界、写法约定，NestJS 的 IoC/装饰器恰恰能把"怎么写"焊进框架，减少风格之争。我们项目小、作者单一，那层"规整"反而是负担。
- **接手老 Node 项目**：现成中间件、现成答案最多的是 Express，硬迁 Hono 没有收益，反而要重写中间件。

一句话：**Hono 赢在"轻 + 跨运行时 + 零框架依赖"，输在"生态小、零件要自己拼、中文资料少"**。我们的账算下来，赢的那头正好压过输的那头，所以选它。但换个项目、换组约束，结论完全可以反过来——这就是开头说的"选型是给约束找最合身的那一个"，不是给框架排名。

## 小结

框架选型没有"绝对最好"，只有"在给定约束下最合身"。我们的约束是：**跨运行时（Node + CF）、业务层不绑死框架、TS 原生、轻**。按这几个约束筛下来，Hono 几乎是唯一解——尤其那个"handler 返回 `Response` 合法"的设计，直接撑起了后面整条"零框架依赖"的主线。

但框架只是"入口"。真正决定一个后端能不能维护、能不能扩展的，是入口之下的**分层**。下一篇（[分层架构-Controller-Service-Repository的边界](https://blog.csdn.net/fungleo/article/details/164209137)）我们就顺着这个入口往下走，聊 Controller / Service / Repository 的边界，以及你熟悉的前端 MVC 经验怎么迁移过来。

---

## 订阅这个专栏

如果你也想跟着一个真实的多端文章系统，从「前端工程师」走到「能设计全栈系统的人」，欢迎订阅我的《成为全栈开发工程师》专栏。整个 Node 后端篇会用三十一篇，带你从工程初始化一路走到部署上线，欢迎在评论区讨论、指正。

![订阅专栏](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

- 本系列专栏：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)（订阅看全部篇章）
- 完整项目仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)






