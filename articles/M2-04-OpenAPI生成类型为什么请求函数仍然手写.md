# 成为全栈·React 管理后台篇·OpenAPI 生成类型，为什么请求函数仍然手写

> 有了 OpenAPI，并不意味着前端要把整套 SDK 全部生成出来。本项目选择生成类型、手写薄请求函数：机器负责字段准确，人负责调用边界和可读性。

## 前言

做前后端联调时，我遇到过一种很憋屈的错误：接口请求成功，页面却拿不到列表。前端以为分页结果叫 `items` 和 `total`，后端契约实际返回的是 `list` 和 `pagination`。TypeScript 没报错，因为那份响应类型也是前端自己手写的。前后端各自“类型正确”，放在一起却错了。

这正是 OpenAPI 生成类型最有价值的地方。但事情走到这里，很容易又滑向另一个极端：既然能生成类型，为什么不把每个请求函数、React Query hook，甚至页面表单也一起生成？

说实话，我一开始也认真考虑过完整 SDK。最后这个后台选择了一条稍微克制的路：`openapi-typescript` 只生成类型，`src/api/*` 保持手写，而且要足够薄。这一篇就把这条边界讲明白。

## 本文要解决什么

- OpenAPI 生成类型真正消除了哪一类漂移。
- 为什么生成文件之外还需要一层业务类型别名。
- 完整 SDK 和手写请求函数各有什么代价。
- 契约本身不完美时，前端怎样反馈而不是偷偷修正。

前置阅读：[契约先行：设计一套被七个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)、[接口文档自动化](https://blog.csdn.net/fungleo/article/details/164584149)

## 手写两份类型，看起来安全其实最危险

假设后端契约定义分页：

```ts
type ArticlePage = {
  list: ArticleSummary[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
```

前端凭过去项目经验写成：

```ts
// ❌ 这份类型自身合法，却和当前后端无关
type ArticlePage = {
  items: ArticleSummary[]
  total: number
}
```

两边的 TypeScript 都可能通过。类型系统只能证明程序符合“它看见的声明”，无法证明这份声明就是服务端事实。手写接口模型最大的问题不是费时间，而是制造了两个真相源。

当前项目把 OpenAPI 文件作为唯一事实源，通过一条命令生成类型：

```json
{
  "scripts": {
    "gen:types": "openapi-typescript ../docs/api/openapi.v1.yaml -o src/types/api.gen.ts"
  }
}
```

`api.gen.ts` 文件头明确写着自动生成，Biome 也排除它。字段错了，要改的是 OpenAPI；直接编辑生成文件，下次运行命令就会全部丢失。

生成动作还应该具备可重复性。同一份 OpenAPI、同一版生成器，连续执行两次不应产生新的 diff。若每次生成都因为时间戳、字段顺序或工具版本漂移而变化，代码审阅会被噪音淹没。因此生成器版本锁在开发依赖里，生成结果进入仓库；更新契约或生成器时，diff 本身就是审阅材料。

这里有一个已知边界：当前 `openapi-typescript` 对 TypeScript 版本的 peer 范围落后于项目使用的 TypeScript 6，会给出兼容提示，但实际生成和类型检查均已通过。我们没有因此假装提示不存在，也没有为了消掉提示降级整个工程。更稳妥的做法是把它记为工具链升级项，每次升级生成器后重新生成并检查 diff。警告经过验证可以暂时接受，生成结果却不能靠猜。

{{IMG:M2-04-类型单一事实源}}

## 生成类型不等于直接消费生成文件

OpenAPI 生成结构通常忠实但不够顺手。页面若到处写这种类型：

```ts
components['schemas']['ArticleSummary']
```

代码会被生成器结构绑住。于是项目增加一个很薄的 `types/common.ts`，只做别名和少量通用收窄：

```ts
import type { components } from './api.gen'

type Schemas = components['schemas']

export type User = Schemas['User']
export type Article = Schemas['Article']
export type ArticleSummary = Schemas['ArticleSummary']
export type ArticleStatus = Article['status']

export interface Page<T> {
  list: T[]
  pagination: Schemas['Pagination']
}

export type ArticlePage = Page<ArticleSummary>
```

这一层不能重新描述业务字段。`Article`、`User`、`Comment` 都必须追溯到生成 schema；手写的只有 TypeScript 泛型表达，例如契约中的通用信封 `data` 是 unknown，前端按具体调用收窄成 `ApiResponse<T>`。

判断这层有没有变质很简单：如果后端给 Article 新增字段，我们是否需要同时修改 `common.ts`？若需要，它就在复制契约；若别名自动带上新字段，边界才是对的。

## 为什么不生成完整请求 SDK

完整 SDK 的优势很明确：端点、方法、query、body 和返回值一起生成，接口数量很多时能省掉大量样板代码。问题是，它也把生成器的调用模型带进了应用。

| 方案 | 收益 | 代价 |
| --- | --- | --- |
| 只生成类型 | 生成物稳定、调用代码直观、容易接入自定义请求层 | 每个端点要写一层薄函数 |
| 生成完整 SDK | 大量端点快速覆盖、参数不易漏 | 生成 API 可能冗长；认证、统一错误、取消与框架适配受生成器约束 |
| 连 hooks 一起生成 | 页面开发更快 | query key、失效关系和产品行为容易被模板决定 |

这个后台只有一组明确的业务 API，而且已经有统一请求核心，需要处理业务信封、并发刷新、附件根路径等项目规则。此时手写一个请求函数通常只有一两行：

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
): Promise<ArticlePage> => http.get<ArticlePage>('/admin/articles', { query })
```

这层只表达“哪个端点收什么参数、返回什么类型”，不做 toast、缓存或 UI 状态。阅读页面代码时，`listAdminArticles(query)` 也比一串由生成器命名的 operation 调用更自然。

我不认为完整 SDK 不好。若契约有几百个 operation、多个团队同时消费，生成 SDK 的收益会快速上升。当前项目规模下，几十个两行函数换来清楚的调用边界，是可以接受的成本。

## 类型安全不能只停在返回值

请求参数也要来自契约或由契约类型组合。分页公共参数被收成 `PageQuery`，状态直接取 `Article['status']`，避免再写一次字符串联合。

这里还踩过一个 TypeScript 细节：query 最终需要传给 `Record<string, 标量>`。同样形状用 `interface` 声明时，不会自动拥有隐式索引签名；改用 type alias 后可以正常兼容。因此 `PageQuery` 刻意写成：

```ts
export type PageQuery = {
  page?: number
  pageSize?: number
}
```

这不是说 type 永远优于 interface，而是提醒我们：生成类型接入现有泛型约束时，仍会遇到 TypeScript 自身的结构规则。应该在共享边界解决一次，不要让每个 API 函数各写一个断言。

## 契约错了，前端不能悄悄脑补

开发过程中，计划文档曾把用户端点写在 `/admin/users` 下，契约实际是 `/users`；“我的点赞”也曾被计划成分页结构，契约却返回裸数组。实现最终都选择契约，并通过测试反向断言错误路径或错误字段不存在。

```ts
expect(result.data).not.toHaveProperty('items')
expect(result.data).not.toHaveProperty('total')
```

这种测试看起来有点古怪，却能防止熟悉旧项目的人凭经验把字段“改回去”。它保护的是契约差异，而不只是正常路径。

但“以契约为准”不代表契约永远正确。如果 OpenAPI 自身的响应描述和运行时冲突，正确流程是记录差异、修订契约、重新生成、再改实现。前端偷偷兼容两个字段，短期页面亮了，长期却让错误永远留在系统里。

前端也不只是被动消费者。表单需要哪些字段级错误，列表是否要支持某种筛选，刷新接口怎样区分“可恢复过期”和“账号禁用”，这些需求应该在契约阶段提出。等接口冻结后再在页面里拼补丁，往往只能制造特殊分支。契约先行真正改变的是协作时点：前端在服务端开工前就参与资源、状态和错误语义的讨论，而不是等联调时才第一次看见响应。

{{IMG:M2-04-契约变更链}}

## 适用边界

小型后端只有三五个接口，手写类型也许够用；但一旦存在多个前端端、后端重写或独立发布，生成类型的价值会迅速增加。

是否生成完整 SDK，则取决于端点数量、团队规模和请求层定制程度。不要因为工具能生成就全生成，也不要因为手写函数短就放弃类型来源。**生成到哪一层，是架构选择；契约只有一个真相源，是纪律。**

## 小结

本项目最终形成了三层：OpenAPI 描述事实，`api.gen.ts` 由机器忠实生成，`common.ts` 提供稳定别名，`api/*` 用薄函数表达调用意图。页面不接触信封和 operation 细节，也没有第二份手写实体模型。

各位看官，以后看到“OpenAPI 代码生成”时，可以先别急着选最重的 SDK 方案。先问两个问题：我最想消灭的是字段漂移，还是请求样板？现有认证和错误处理能否自然接进生成客户端？答案不同，生成边界就应该不同。

## 延伸阅读

- [契约先行：设计一套被七个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)
- [接口文档自动化：让 OpenAPI 与代码不脱节](https://blog.csdn.net/fungleo/article/details/164584149)
- [请求层封装：统一信封、业务错误与并发 401]({{LINK:M2-03}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`OpenAPI`、`TypeScript`、`React`、`接口类型生成`、`前后端协作`、`契约驱动开发`

### 文章简介（250 字以内）

OpenAPI 可以生成类型，也可以生成完整请求 SDK，但两者并不是同一个决定。本文从分页字段漂移的真实问题出发，介绍 OpenAPI、生成类型、业务别名和薄 API 函数的四层边界，比较完整 SDK 与手写请求层的成本，并说明契约出现偏差时如何用反向测试和变更流程守住唯一事实源。

### 建议发布分类

前端开发 / TypeScript / 前后端协作

### 封面短标题

OpenAPI 应该生成到哪一层

### 配图 AI 提示词

#### 1. `M2-04-封面`

- 用途：文章封面；比例：16:9。
- 提示词：现代技术博客横版封面，中心是一份标注“OpenAPI”的契约文档，向右依次生成“类型文件”，再连接“薄请求函数”和“React 页面”；另有一条灰色虚线路径通向体积庞大的“完整 SDK”，表现两种选择。深蓝背景、青绿主路径、灰橙备选路径，扁平架构图风格。只出现短标题“OpenAPI 应该生成到哪一层”和四个节点标签，不出现 Logo、水印和乱码。

#### 2. `M2-04-类型单一事实源`

- 插入位置：“手写两份类型”小节之后；比例：16:9。
- 提示词：数据流图，左侧唯一源“openapi.v1.yaml”，箭头指向自动生成的“api.gen.ts”，再指向“common.ts 业务别名”，最后分流到“api 请求函数”和“页面”。在旁边画一个红色叉号路径“页面手写实体类型”，标注“第二真相源”。中文清晰，结构优先。

#### 3. `M2-04-契约变更链`

- 插入位置：“契约错了，前端不能悄悄脑补”小节之后；比例：16:9。
- 提示词：闭环流程图，节点依次为“发现运行时差异 → 记录证据 → 修改 OpenAPI → 重新生成类型 → 修改实现 → 契约测试”，最后回到“契约一致”。红色支路“前端偷偷兼容两个字段”进入“长期漂移”警告。深色背景，青绿色正确闭环、红色错误支路，中文准确。

### 发布前核对

- [ ] Tag 为 6 个，简介不超过 250 个字符
- [ ] 三张配图均替换为 CSDN 图床地址
- [ ] M2-03 发布后回填兄弟篇内链；M0-05、M1-20 链接已核对
- [ ] `PageQuery` 与文章列表代码仍和当前源码一致
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
