# 成为全栈·基础补充·TypeScript：从会用到用好

这个项目的 `tsconfig.json` 里有几行，我一开始觉得"是不是有点严了"：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "paths": { "@/*": ["./src/*"] },
    "noEmit": true
  },
  "include": ["src", "test", "drizzle.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**`noEmit: true` 尤其让我疑惑**——不输出，那怎么运行？

答案是：**这个 tsconfig 只给编辑器用**。真正构建时用的是另一个（或者用 `tsx` 直接跑）。

**而这里有个我一开始没理解的点**：`include` 里包含 `test`。

**很多项目的 tsconfig 只 include `src`**，因为测试用另一个配置。而这个项目把它包含进来了——**意味着测试代码也享受同样严格的检查**。

**而这个选择的代价我很快就碰到了**：启用 `noUncheckedIndexedAccess` 之后，测试里那些 `arr[0]` 全都变成了 `T | undefined`。

于是测试里多了一堆断言：

```ts
const user = rows[0];
if (!user) throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401);
```

**——而这行断言其实不是为了测试，是为了让类型检查通过。**

{{IMG:B-07-封面}}

## noUncheckedIndexedAccess：最值钱的一行

先说这一行，因为它抓到的 bug 最多。

**TypeScript 默认认为 `arr[0]` 就是 `T`**：

```ts
const rows = await db.select().from(users).where(...).all();
const user = rows[0];          // 类型：User
```

**但数据库查询可能返回空数组。** 而 TS 不知道这件事——**它只会做类型推导，不会知道运行时会发生什么。**

加上 `noUncheckedIndexedAccess` 之后：

```ts
const user = rows[0];          // 类型：User | undefined
```

**于是编译器强制你处理"可能没有"这个分支。**

而这个项目的处理方式是：

```ts
const rows = await getDb().select().from(users).where(eq(users.username, username)).all();
const user = rows[0];
if (!user) throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401); // 1001 不暴露账号是否存在
if (user.status === 'disabled') throw new AppError(ErrCode.ACCOUNT_DISABLED, 401);
if (!user.credentialsConfigured || !(await verifyPassword(password, user.passwordHash))) {
  throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401);
}
```

**注意第一行的错误处理：用户不存在时返回 1001，和密码错误返回的是同一个码。**

**而这个设计不是因为类型检查**——是因为 M1-09 讲的那个安全要求：**错误码不能暴露账号是否存在。**

**但如果没有 `noUncheckedIndexedAccess`，`if (!user)` 这行就写不出来**——因为 `user` 被推导成 `User`（非空），而对一个非空类型写 `!user` 会被 lint 报"这个判断永远成立"。

**所以这一行配置和一个安全设计互相成就**：类型系统强迫你检查空值，而检查空值的位置正好是安全设计需要的那个位置。

**这就是严格类型配置的真实价值**——它不是"更安全"，而是"让某些检查变成不可能被忘记"。

而它也有代价。B-20 讲的那个微信查询：

```ts
const find = async () =>
  (await db.select({ user: users }).from(wechatIdentities)
    .innerJoin(users, eq(users.id, wechatIdentities.userId))
    .where(and(...)).all())[0]?.user;
```

**那个 `?.` 是被 `noUncheckedIndexedAccess` 逼出来的。**

而另一种写法需要显式处理：

```ts
const rows = await db.select({ user: users }).from(wechatIdentities)
  .innerJoin(users, eq(users.id, wechatIdentities.userId))
  .where(and(...)).all();
const user = rows[0]?.user;
if (!user) throw new AppError(ErrCode.INTERNAL, 500);
```

**两种写法都对**，而 `?.` 那种更简洁——**因为这个函数本身就是要表达"可能查不到"**（它的返回值就是 `User | undefined`）。

顺带说那个 `internal/article/query.go`... 这里说错了，是 Go 那边的对照。回到 TS：

**这一行配置在 Go 那边的对应物是"所有 `[]T` 索引都返回 `T` 而不是 `T, bool`"**——M6 那批代码审阅里专门讨论过这件事（L103/108/113 那个 `err`/`e` 混用）。

**两种语言在"索引越界"这件事上的默认选择相反**：Go 返回零值（可能是个 nil 指针），TS 编译期报错。**而这个项目的选择是"用类型系统挡住"。**

{{IMG:B-07-联合类型}}

## 其余几行各管什么

| 配置 | 防什么 | 例子 |
|---|---|---|
| `strict` | 一组基础检查（null、隐式 any 等） | **必开，没有它其他都白搭** |
| `noImplicitOverride` | 漏写 `override` | 子类改了父类方法却没标 |
| `noUnusedLocals` | 声明了不用的变量 | **抓"注释掉代码"的残留** |
| `noUnusedParameters` | 不用的参数 | 改签名后有调用方没跟上 |
| `noFallthroughCasesInSwitch` | case 意外贯穿 | 漏写 `break` |
| `verbatimModuleSyntax` | `import type` 该写不写 | **让"这是类型导入"显式化** |

`noUnusedLocals` 值得单说——**它是"代码卫生"的守卫**。

而这个专栏的 M0-06 讲过工程公约，其中一条是"不留注释掉的代码"。**而 `noUnusedLocals` 恰好能抓到一部分**：因为注释掉的代码不会触发它，**但"删了变量却忘了清理导入"这种会**。

**而 `verbatimModuleSyntax` 是一个我一开始不理解的、后来觉得很好的配置。**

它的作用是：**强制你显式区分"导入一个值"和"导入一个类型"。**

```ts
// ✅ 正确
import type { User } from '@/types/common';      // 只用作类型
import { getDb } from '@/db/client';              // 当作值用

// ❌ 有 verbatimModuleSyntax 时会报错
import { User, getDb } from '@/types/common';     // User 其实只是类型
```

**为什么这个配置有价值？** 因为它让"这个导入在运行时是否需要存在"变成显式的。

**而这对 `verbatimModuleSyntax` 尤其重要**，因为它在 ESM 下会**完全擦除** `import type`——**所以一个"实际是类型但写成了值导入"的 import，在运行时会导致模块被真实加载**，而那个模块可能根本不适用于当前环境。

**这个项目是双运行时部署的**（B-04 讲的那个坑：`node:*` 的顶层导入在 Workers 里会被求值）——**而一个不该在运行时存在的导入，在双运行时场景下就可能变成一个真实的故障。**

## 路径别名：@/* 解决了什么

```json
"paths": { "@/*": ["./src/*"] }
```

这一个配置解决了一个真实问题：**相对路径在文件层级深了之后完全不可读。**

而这个项目里最深的文件要做四次 `../`：

```ts
// lib/features/article/article_navigation.dart 引用 core 层的类型
import '../../../core/network/api_client.dart';
```

加上别名之后：

```ts
import '@/core/network/api_client.dart';
```

**而它带来的不只是可读性——还有一个副作用：重构时不用改 import。**

`features/data/` 下面某个文件要移到 `features/article/data/`，**用相对路径要改所有引用它的文件的 import**，用别名只需要改这一处。

**而这个项目的 `features/repository.dart` 里有一行注释值得一提**——它为了兼容路由文件的原有写法做了调整：

```ts
// 鉴权上下文类型（AuthUser / AuthVars）上提至 types/auth.ts 作为单一事实源；此处透出以保持路由现有 import 不变。
export type { AuthUser, AuthVars } from '@/types/auth';
```

**"上提为单一事实源"是重点** ——**原本它定义在中间件文件里，但很多地方要引用，于是搬到一个专门的地方，然后从原位置再导出一次。**

**这个"定义一处、多处导出"的做法在大型项目里很常见**，而它的价值是：**移动定义位置时，不用改所有 import。**

{{IMG:B-07-类型来源}}

## 类型从哪来：生成 vs 手写

最后一个话题，而它是这个项目里"契约优先"的下游。

M4-03 讲过那个 24 行的生成器，它产出的是：

```dart
class ApiArticle {
  final Map<String, dynamic> json;
  int? get id => (json['id'] as num?)?.toInt();
  ...
}
```

而这份生成代码在 TS 侧对应什么？**答案是这个项目没有生成 TypeScript 类型——它直接用 Drizzle 的 schema 推导。**

```ts
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  ...
});
```

**Drizzle 的写法是"schema 即类型"** ——`typeof users.$inferSelect` 就是查询结果的类型。

**所以这个项目在两端用了不同策略：**

| 端 | 类型来源 | 理由 |
|---|---|---|
| Flutter | **从 OpenAPI 生成** | 契约优先，且要和后端对齐 |
| Node 后端 | **Drizzle schema 推导** | 少一层，而且能同时提供查询 API |

**为什么不用同一种？** 因为 Drizzle 生成的查询 API（`db.select().from(users)`）是它自己的价值，**如果只用它当类型定义就浪费了**。

**而 Flutter 那边没有等价的库能同时提供类型和运行时能力**，所以选择了生成。

**这个"每端选最合适的、而不是强行统一"的判断，是这一章最实际的一条经验。**

## 入参校验的边界：为什么在路由最外层

严格类型管的是编译期，而运行时进来的数据还要过 zod 这一关。这个项目的中间件注释把位置讲得很清楚：

```ts
/**
 * 信任边界统一校验：在路由最外层用 Zod 校验入参，失败直接返回契约 4001 信封
 * （data.errors = [{ field, message }]），不让非法输入进入深层逻辑。
 */
```

**"不让非法输入进入深层逻辑"是这个设计的目的**，而它决定了校验的位置必须在最外层。

因为**深层代码不需要为"参数可能非法"写防御**：

```ts
// 有了 zod 校验之后，业务代码可以直接用
const page = Number(c.req.query('page') ?? 1);
```

而不是：

```ts
const raw = c.req.query('page');
const page = raw === undefined ? 1 : (Number.isFinite(Number(raw)) ? Number(raw) : 1);
```

**后者在每一层都要写一遍，而漏一层就是一个 bug。**

而 TypeScript 和 zod 的分工在这里很清楚：

| 层 | 负责 | 例子 |
|---|---|---|
| **zod（运行时）** | 外部进来的数据 | HTTP 请求体、查询参数 |
| **TS（编译期）** | 内部代码之间的契约 | 函数参数、返回值 |

**而 `env.ts` 是这个分工的另一个例子**——它用 zod 校验环境变量，然后用 `z.infer` 导出类型（B-19 讲过）。

**所以"用 zod 定义、用 TS 消费"这个模式，在配置和请求两个入口都用了。** 而它的价值是：**类型和校验来自同一个源头，不可能不一致。**


## 一条我一开始想省掉的事

那些严格配置，我一开始只开了 `strict`。

理由是"其他的先看看会不会有影响"。

结果第一批就撞上了 `noUnusedLocals` 报了 **30 多个未使用变量**。

而它们几乎都是同一类：

```ts
// 曾经：import 了但没直接用（类型被推断出来了）
import { ErrCode, AppError } from '@/shared/...';
```

**或者函数签名改了，参数没清理：**

```ts
async function handleRequest(c: Context, options: Options) { ... }  // options 没用
```

**而这 30 多个的共同点是：它们全都不会造成运行时错误。** 代码照样跑、测试照样过——**它们只是"残留"。**

**而这恰恰是它们危险的地方**：一个函数签名里有个没用的参数，会让读代码的人以为"这个参数有用"，而将来重构时有人照着它加逻辑，就加错地方了。

所以我一次性全开了。**代价是半小时清理 30 多处，收益是这些"残留"不会再积累。**

**而这个判断标准我觉得可以推广**：

> **静态检查报出来的"没用"，通常不是错误，而是历史残留。** 它们不会出事——但它们会误导下一个读代码的人。

## 小结

TypeScript 这章，真正让代码质量提升的不是"类型系统多强"，而是**几个把某些检查变成"不可能忘记"的配置**：

| 配置 | 价值 |
|---|---|
| `strict` | 基础，**没有它其他都白搭** |
| `noUncheckedIndexedAccess` | **最值钱的一个**，把空值检查变成强制 |
| `noUnusedLocals` | 抓残留，而残留会误导人 |
| `verbatimModuleSyntax` | 让"类型导入"显式化，**在双运行时场景下能避免真实故障** |

而其中 `noUncheckedIndexedAccess` 的价值我还想强调一次，因为它展示了**类型配置和安全设计的互相成就**：

**它逼你在数据库查询后写 `if (!user) throw ...`，而那个位置恰好是"不能暴露账号是否存在"这条安全规则需要的地方。**

**如果没有它，你可能永远想不起来在那里加检查——因为不加也能跑。**

而这也是 M4-25 讲"禁止色值"、M1-32 讲"不注入 token"的同一个模式：

> **让违规写法"编译不过"或"明显异常"，比"记得遵守"更可靠。**

下一篇讲 Docker。它解决的是另一个问题：**把"我机器上能跑"变成"任何机器上都能跑"**——而这个专栏没用 Docker，因为部署目标是 Workers 而非容器平台。

## 延伸阅读

- [契约先行：设计一套被七个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)
- [接口文档自动化：让 OpenAPI 与代码不脱节](https://blog.csdn.net/fungleo/article/details/164584149)
- [后端工程从零搭建：TypeScript、目录与热更新](https://blog.csdn.net/fungleo/article/details/164186950)

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
3. B-07-类型来源：放在正文同名占位处，类型来源示意：从契约生成与手写类型各自的适用范围。

### 发布前核对

- [ ] 示例通过当前 TypeScript strict 编译，版本特性没有错误引用。
- [ ] 不把静态类型检查描述成运行时安全或业务权限验证。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
