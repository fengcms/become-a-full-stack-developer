# 成为全栈·基础补充·TypeScript：从会用到用好

> TypeScript 的价值不只是让编辑器补全字段，而是把“程序以为的数据形状”变成可以被编译器检查的约束。类型能减少误用，却不能替代运行时校验。

{{IMG:B-07-封面}}

## 前言：类型是协作工具，不是运行时护身符

JavaScript 在浏览器和 Node.js 里运行。TypeScript 在开发阶段增加静态类型检查，最终仍要转换成 JavaScript 执行。它能帮助我们提前发现属性拼错、参数类型不匹配和部分控制流问题；但接口响应来自网络，用户输入来自表单，编译器无法保证它们真的符合声明。

因此，“把 API 返回类型写成 `Article`”不等于服务器一定返回了合法文章。类型描述的是代码当前相信什么；运行时 schema 校验和业务检查，才负责验证实际数据。把这两层区分开，才能既享受类型带来的帮助，又不被它制造虚假的安全感。

## 一、先开启 strict，再让类型暴露问题

TypeScript 的严格模式会开启一组更谨慎的检查，例如 `strictNullChecks`：某个值可能为 `undefined` 或 `null` 时，使用它之前需要处理这些情况。

```ts
type Article = {
  id: number;
  title: string;
  summary: string | null;
};

function cardTitle(article: Article): string {
  return article.summary ?? article.title;
}
```

这里 `summary` 明确可能为空，`??` 只在 nullish 时回退。若写 `summary || title`，空字符串也会被当成缺失；这两种语义不一定相同。严谨类型能迫使我们讨论数据含义，而不是把所有值都视为“应该有”。

## 二、不要用 any 关掉问题

`any` 允许任意操作，编译器不会继续保护这个值。第三方响应尚未校验时，更适合先使用 `unknown`：

```ts
function parseArticle(input: unknown): Article {
  if (
    typeof input === "object" && input !== null &&
    "id" in input && typeof input.id === "number" &&
    "title" in input && typeof input.title === "string"
  ) {
    return input as Article;
  }
  throw new Error("Invalid article payload");
}
```

生产代码通常会使用 schema 库，避免手工检查复杂嵌套结构。核心原则是：不可信输入先是 `unknown`，验证以后才进入业务类型；不要把类型断言当成数据转换。

## 三、联合类型让状态更清楚

布尔值和一堆可空字段容易组成非法状态。例如请求状态如果只有 `loading`、`error`、`data` 三个独立字段，就可能出现“loading 为 true，同时 error 和 data 都有值”的组合。判别联合类型可以表达合法状态：

```ts
type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };
```

处理 `status` 后，TypeScript 会根据分支缩窄类型：`success` 才能访问 data。相似方法也适用于文章状态、登录态、表单提交状态和文件上传状态。类型越贴近业务状态，UI 就越少出现逻辑矛盾。

## 四、泛型让重复结构保留具体类型

泛型不是为了炫技，而是让一段通用逻辑保留调用方的类型信息：

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
```

调用 `first(articles)` 时结果会是 `Article | undefined`，而不是退化成 `unknown` 或 `any`。API 分页、缓存容器和通用表格常会用到泛型；如果一个泛型参数无法说明具体约束，或出现层层条件类型让维护者看不懂，就应该简化。

## 五、类型复用不等于把后端数据库模型暴露给前端

数据库实体、API DTO 和页面视图模型解决的问题不同。数据库可能有密码哈希、内部状态和关系键；API 契约只输出可公开字段；页面还可能需要格式化后的展示属性。将三者强行定义成同一个 `User`，容易把内部字段带到客户端，也会让后端重构无意中破坏 UI。

对跨端 API 类型，可以从 OpenAPI 生成或依据冻结契约维护；对页面组件，可定义更窄的 props 类型。`Pick`、`Omit` 等工具类型适合表达简单派生，但不要用复杂类型变换掩盖领域差异。契约与兼容的边界见 [B-16]({{LINK:B-16}})。

## 六、编译器不知道业务规则

`type Email = string` 仍然可能是格式错误的邮箱；`type UserId = number` 可能被误传成 ArticleId；编译通过也不能证明会员有权修改某篇文章。可以用品牌类型减少部分 ID 混淆，用 schema 校验外部数据，用服务端授权校验业务权限，但不要期待一个静态类型系统自动证明全部业务正确性。

类型声明不应靠 `as` 一路强转通过编译。每次断言都应问：这个事实由哪里验证？如果答案是“接口应该会返回”，那还缺一道运行时检查。类型系统和自动化测试各自承担不同工作，参见 [B-17]({{LINK:B-17}})。

## 七、逐步改进旧 JavaScript 项目

不必一次重写整个项目。可以先启用严格模式，给边界模块补类型，再从 API 响应、核心业务对象和公共组件开始；保留少量明确隔离的 `unknown`，而不是把 `any` 扩散到全工程。每次收紧类型后运行构建和测试，避免类型迁移与产品功能混为一批变更。

## 小结：让类型表达事实，让运行时验证输入

使用 strict 模式和明确的 null 类型，用联合类型表达状态，用泛型复用结构；对外部数据使用 `unknown` 并经过运行时校验。把 API DTO、数据库对象和页面模型分开。TypeScript 是日常开发中的一组静态证据，不能替代运行时检查、权限控制和测试。

## 延伸阅读

- [API 契约与兼容性：接口文档怎样约束前后端]({{LINK:B-16}})
- [React / Vite 管理后台：类型生成与请求层实践]({{LINK:M2-04}})
- [Vue3 后台如何复用同一套 API]({{LINK:M7-06}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

TypeScript、JavaScript、前端开发、类型系统、代码质量、全栈开发

### 文章简介（250 字以内）

TypeScript 可以在开发阶段发现许多错误，却不能保证网络响应和用户输入在运行时符合类型声明。本文从 strict 和 null 检查讲起，介绍 `any` 与 `unknown`、判别联合、泛型和 DTO 边界，并说明何时需要运行时 schema 校验。通过请求状态和文章数据示例，帮助前端开发者把类型真正用作协作和建模工具，而不是用断言关掉编译器提醒。

### 建议发布分类

前端 / TypeScript

### 封面短标题

类型声明不是运行时验证

### 配图 AI 提示词

1. B-07-封面：TypeScript 编译器检查开发代码，运行时 API 数据另经过 schema 验证，两个边界明确分开。
2. B-07-联合类型：请求状态 idle/loading/success/error 的合法状态图。

### 发布前核对

- [ ] 示例通过当前 TypeScript strict 编译，版本特性没有错误引用。
- [ ] 不把静态类型检查描述成运行时安全或业务权限验证。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
