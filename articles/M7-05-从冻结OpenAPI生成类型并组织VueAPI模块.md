# 成为全栈·Vue 管理后台篇·从冻结 OpenAPI 生成类型，并组织 Vue API 模块

> OpenAPI 能帮前端减少字段拼写错误，但“生成了类型”不等于“自动获得了可靠请求层”。本文沿着仓库的冻结契约、生成文件、业务类型别名和文章 API 函数，拆解每一层的责任。

{{IMG:M7-05-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。契约来源为 `docs/api/openapi.v1.yaml`（v1.12.0），实现参照 `manage-frontend-vue/src/types/api.gen.ts`、`src/types/common.ts` 和 `src/api/articles.ts`。

## 前言：类型生成解决的是一部分问题

前后端联调里，有一种问题很隐蔽：接口请求成功了，页面却读错字段。后端返回 `data.list`，页面误以为是 `data.items`；状态枚举新增一个值，前端的分支却没有处理；分页字段从 `totalPages` 被误读成 `pages`。TypeScript 能帮我们发现不少问题，但前提是类型和接口事实一致。

本项目把 `docs/api/openapi.v1.yaml` 作为冻结契约的唯一事实来源，并用 `openapi-typescript` 从它生成 Vue 端的 `src/types/api.gen.ts`。接着，手写 `src/types/common.ts` 提取页面常用的类型别名，`src/api/` 再将契约端点包装成业务函数。三层职责不同：契约说明接口，生成类型传递契约结构，业务 API 函数负责让页面以稳定方式发请求。

本文会特别说明一条边界：生成 OpenAPI TypeScript 类型，不会自动替你实现 fetch、统一错误处理、认证刷新、query 序列化或上传。类型系统和运行时行为必须各自设计。

## 从唯一契约到生成文件

Vue 工程在 `package.json` 中定义了：

```json
{
  "scripts": {
    "gen:types": "openapi-typescript ../docs/api/openapi.v1.yaml -o src/types/api.gen.ts"
  }
}
```

命令从仓库内 `docs/api/openapi.v1.yaml` 读取 OpenAPI 描述，把结果写入 `manage-frontend-vue/src/types/api.gen.ts`。生成文件头也注明由 `openapi-typescript` 生成，并要求不要直接修改。改生成文件中的一行类型，下一次生成时就会被覆盖；更重要的是，手工修改会让代码看起来符合预期，却和契约脱节。

如果接口定义错了，应该先厘清契约维护流程，而不是在 Vue 项目局部“修类型”。在教学项目里，冻结契约还有额外价值：它让 Node、Go、Web、APP、小程序和管理后台围绕同一份可审阅的协议协作。前端发现矛盾时要记录证据并走契约变更流程，不能静默创造一个只在本端成立的接口形状。

## 生成类型里有哪些东西？

生成文件主要描述 OpenAPI 中的路径、请求参数、请求体、响应和 schema。示意如下：

```ts
// 根据当前项目生成的声明提取操作类型
import type { components, operations } from '@/types/api.gen'

type ArticleSchema = components['schemas']['Article']
type AdminArticleListResponse =
  operations['listAdminArticles']['responses'][200]['content']['application/json']
```

实际项目会根据契约生成很多路径和操作声明。直接在页面里写这种很长的索引类型，会让业务代码难读，也会让 UI 组件过度了解 OpenAPI 的组织方式。因此工程在 `common.ts` 建立更接近日常业务的别名：

```ts
import type { components } from './api.gen'

export type Article = components['schemas']['Article']
export type ArticleSummary = components['schemas']['ArticleSummary']
export type ArticleStatus = Article['status']
```

这里的别名仍然溯源到生成类型，没有复制一份相互独立的 `Article` interface。页面可以用熟悉的 `ArticleSummary`，契约字段变化时类型检查则会沿着引用关系暴露影响。

## 业务别名不是第二份契约

并非每个 OpenAPI schema 都适合原封不动进入页面。页面需要的类型名称、通用分页泛型、表单态与返回态可能各有差异。工程可以在 `common.ts` 定义有意的领域别名或组合类型，但要守住几个边界：

- 从后端接收或提交的数据字段，要有可追溯的契约来源。
- 纯 UI 状态（例如弹窗是否打开）不属于 API schema，不需要伪装成后端字段。
- 表单草稿可以在契约类型之上构造，但提交前要显式转换成请求体类型。
- 对契约的窄化或增强应反映真实业务约束，并由校验逻辑保障，不能只用 `as` 强制通过编译。

例如，文章创建表单还包含一个仅用于交互的活动标签页：

```ts
const activeTab = ref<'content' | 'settings'>('content')
const title = ref('')
const content = ref('')
```

`activeTab` 是 UI 状态，`title`、`content` 在提交时组成契约请求体。它们在同一页面中使用，不代表应该塞进同一个接口类型。

## API 模块：把路径变成有类型的业务函数

`src/api/articles.ts` 展示了这层的定位：

```ts
export type AdminArticleQuery = PageQuery & {
  sort?: string
  category?: string
  tag?: string
  status?: ArticleStatus
  keyword?: string
}

export const listAdminArticles = (
  query: AdminArticleQuery = {},
): Promise<ArticlePage> =>
  http.get<ArticlePage>('/admin/articles', { query })

export const createArticle = (
  payload: ArticleCreate,
): Promise<Article> => http.post<Article>('/articles', payload)
```

页面调用 `listAdminArticles(query)`，不需要自己拼 `/api/v1/admin/articles`，也不需要关心 Bearer token、JSON 信封、HTTP 错误转换或 query 参数编码。这些横切行为属于 `lib/request/`。API 模块知道业务端点和函数输入输出，不负责 toast、弹窗、路由跳转等 UI 行为。

这个薄封装不是“为了多一层而多一层”。它让端点集中可搜索，页面免于重复 URL，让契约字段在编译期参与检查，也给 API 模块测试提供了清晰边界。若每个组件各自写 `fetch`，错误处理、认证细节和端点拼写就会散落在各处。

## 类型生成没有生成什么？

看到 OpenAPI 后常有人问：既然描述这么完整，为什么不把整个客户端都自动生成？这是一种可选方案，但本项目选择了“生成类型、手写薄请求函数”。生成类型只处理编译期结构，不会自行完成以下运行时工作：

| 责任 | 本项目位置 | 类型生成能否代替 |
|---|---|---|
| API 路径和 schema 声明 | `api.gen.ts` | 可以从契约生成声明 |
| 统一 HTTP、基础路径和超时 | `lib/request/` | 不可以 |
| Bearer token、刷新和重放 | `lib/request/session.ts` | 不可以 |
| 错误信封转成可读错误 | `lib/request/errors.ts` | 不可以 |
| FormData 与文件上传处理 | request 层/API 模块 | 不可以 |
| 业务动作命名和调用边界 | `src/api/*.ts` | 可由生成 SDK 替代一部分，但需要另行选择与维护 |
| 提示文案、刷新列表、关闭对话框 | 页面/组件 | 不应该由 API 类型生成器决定 |

生成完整 SDK 并非错误，只是它会带来生成代码体积、定制点、错误处理接入和升级策略等选择。本工程希望初学者能看见实际请求内核和业务函数之间的边界，所以保留薄 API 模块。是否改用 SDK，应根据团队规模、契约复杂度和生成器的定制能力评估，不能把“代码生成”自动等同于“架构更好”。

## 生成后的类型检查与漂移控制

重新生成之后，至少要检查生成文件差异，并运行 Vue-aware 类型检查：

```bash
cd manage-frontend-vue
pnpm gen:types
pnpm typecheck
```

`pnpm typecheck` 执行 `vue-tsc --noEmit -p tsconfig.app.json`，可以检查 `.ts` 和 Vue 单文件组件模板使用的类型。项目的生产构建也先运行同一类检查，再执行 Vite 构建。Biome 检查格式与 lint 规则，但不替代 TypeScript 类型检查。

生成文件不应在每次普通构建时自动被无条件覆盖，否则契约变化可能在开发者没注意时改变巨大 diff。把 `gen:types` 作为明确命令，review 时检查契约文件、生成文件和受影响的业务模块，能让接口变更更可见。对于生成文件，Biome 配置将其排除，避免格式化器重写代码生成器的输出。

类型检查也不等于运行时校验。服务端返回的数据可能与 OpenAPI 描述不一致，TypeScript 类型不会在浏览器里自动验证 JSON。若边界数据需要运行时校验，应引入 schema validator 并明确成本和错误处理，而不是误以为 `http.get<Article>()` 会在运行时逐字段验证。

## 一个常见陷阱：泛型承诺不等于响应验证

像 `http.get<ArticlePage>()` 这样的调用，通常是告诉 TypeScript“调用方按 `ArticlePage` 使用结果”。它本身并不检查响应体的每个字段。如果后端意外返回 `{ items: [] }`，除非请求层或运行时 schema 做验证，浏览器可能仍会把它当成 `ArticlePage` 继续运行。

因此可靠性来自多层证据：契约评审、生成类型、类型检查、API 模块测试、后端契约测试，以及必要的线上验证。它们解决的问题不同。不能单凭“编译成功”推导线上真实响应一定符合契约，也不能从本地类型文件推断线上已部署代码版本。

## 实战检查：接口字段从哪里来到页面？

以文章列表为例，可以沿着这一条链路追踪：

1. 在 `docs/api/openapi.v1.yaml` 找到后台文章列表的请求参数和响应 schema。
2. 在 `src/types/api.gen.ts` 查看生成操作与 schema 声明。
3. 在 `src/types/common.ts` 找到页面使用的别名。
4. 在 `src/api/articles.ts` 检查 query 参数如何交给 `http.get`。
5. 在 `ArticleListPage.vue` 检查筛选参数、响应分页和数据行如何被消费。
6. 如果显示字段不一致，判断错误属于契约、生成、API 模块还是页面映射，再在正确层修复。

这套顺序也适用于新端点。先确认契约，再使用生成类型，随后写业务 API 函数，最后让页面消费 API。不要从页面上“猜出”一个方便的数据结构，然后倒过来修改类型掩盖与契约不一致的问题。

## 小结：让每一层只背自己的责任

冻结 OpenAPI 是接口事实源；`openapi-typescript` 生成契约的 TypeScript 表达；业务类型别名让页面更易读；`src/api/` 把业务端点包装为函数；请求内核处理认证、序列化和统一错误。类型生成强化了编译期约束，但不产生 HTTP 行为，也不验证运行时 JSON。

下一篇将进入请求内核：如何用 fetch 统一 API 基础路径、query 编码、Bearer 凭证、响应信封和错误处理，并正确区分 JSON 请求与 FormData 上传。

## 延伸阅读

- [Vue 响应式与 React Hooks：同一交互的两种运行模型]({{LINK:M7-04}})
- [用 fetch 建一层可控的请求内核]({{LINK:M7-06}})
- [API 契约与兼容性：接口文档怎样约束前后端]({{LINK:B-16}})
- [OpenAPI TypeScript 官方文档](https://openapi-ts.dev/introduction)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

OpenAPI、TypeScript、Vue.js、接口契约、代码生成、前端工程化

### 文章简介（250 字以内）

本文基于 Vue 管理后台的真实代码，梳理冻结 OpenAPI、`openapi-typescript` 生成文件、业务类型别名、API 模块和 fetch 请求内核之间的职责。重点说明生成 TypeScript 类型不等于自动生成运行时请求，也不等于验证线上 JSON；通过文章列表接口示例展示契约字段如何流向页面，并介绍重新生成、类型检查和审阅差异的实践步骤。

### 建议发布分类

前端 / Vue.js

### 封面短标题

OpenAPI 到 Vue 类型

### 配图 AI 提示词

1. M7-05-封面：以 OpenAPI YAML 契约为起点，经过 TypeScript 生成类型、业务类型别名、API 函数，最终到 Vue 页面表格的清晰管线图；白底浅蓝、深色文字、少量蓝紫色强调，适合作为严肃技术文章封面。
2. M7-05-分层图：并排显示“编译期”类型链与“运行时”请求链；生成类型只提供静态约束，fetch 内核负责真正的认证、网络、错误处理，明确两条链路在 API 函数处汇合。

### 发布前核对

- [ ] 确认 `docs/api/openapi.v1.yaml` 当前冻结版本及文章引用的一致性。
- [ ] 补齐 M7-04 内链。
- [ ] 对照 `package.json` 的 `gen:types` 脚本和 `src/types/common.ts` 的实际别名。
- [ ] 检查文章没有声称泛型会自动验证运行时响应。
- [ ] 补齐 M7-06 与 B-16 内链。
- [ ] 发布时删除本段辅助信息，检查代码块与表格排版。
<!-- PUBLISH_ASSIST_END -->
