# 成为全栈·Node 后端篇·分层架构：Controller、Service、Repository 的边界

前面两篇我们搭好了工程（[后端工程从零搭建-TypeScript目录与热更新](https://blog.csdn.net/fungleo/article/details/164186950)），也聊清楚了为什么选 Hono（[框架选型-Express-Koa-Fastify-NestJS的差异与为何选Hono](https://blog.csdn.net/fungleo/article/details/164187017)）。工程能跑起来只是第一步，真正的考验是：**代码越写越多之后，怎么让它不变成一锅粥**。

我在前端干了十年，带新人时最常说的一句话是——"你能把代码跑起来，不代表你能把代码组织好"。后端更是如此。一个接口从接收请求到返回数据，中间要过鉴权、校验、查库、组装、兜底，如果这些东西全部挤在一个文件里，第三天你自己都看不懂自己写的什么。

![成为全栈·Node 后端篇·分层架构：Controller、Service、Repository 的边界](https://i-blog.csdnimg.cn/direct/1f92f2d275084691aac837a56172e633.png)

所以这一篇，我想先把整个后端的"分层"讲透。它不是目录装饰，而是一种**让每一层只干一件事、并且能被单独测试**的纪律。

## 一、从前端 MVC 说起：你早就会分层了

如果你写过 React + Redux（或任何状态管理库），其实你已经理解分层了，只是换个名字：

- **View（页面/组件）**：只负责把数据画出来，不关心数据从哪来。
- **Action / 事件**：用户点了按钮，触发一个动作。
- **Reducer / Store**：业务状态怎么变，规则集中在这里。
- **Service / API 层**：真正去后端拿数据的那一层。

后端的分层几乎是一一对应的：

| 前端角色 | 后端对应层 | 它负责什么 |
|---|---|---|
| 组件（View） | `routes`（路由/控制器） | 解析请求参数、鉴权、调服务、打包返回 |
| 状态规则（Reducer） | `services`（领域服务） | 业务规则、状态流转、读写数据库 |
| API 请求层 | `db`（数据访问） | 表结构、查询、迁移 |
| 工具/常量 | `shared`（基础设施） | 响应信封、错误码、分页、存储、JWT |
| 类型定义 | `types` | 全局共享的 TS 类型 |

关键区别在于：**前端的状态规则跑在用户浏览器里，错一个分支最多界面卡住；后端的领域规则跑在服务器上，错一个判断可能就是脏数据进库、或者一个越权漏洞。** 所以后端对"边界"的要求更硬。

## 二、我们真实的七目录结构

回到《项目全貌与七子项目》那篇（讲清楚了我们为什么是"七端共享一份契约"的架构）[用一个真实系统串起全栈](https://blog.csdn.net/fungleo/article/details/164120426)，后端的代码地基是 `node-backend/`。它冻结后的 `src/` 只有**七个目录**，没有 `lib/`：

```
node-backend/src/
├── app.ts          # 应用装配工厂 createApp(env)
├── index.ts        # Node 运行时入口（@hono/node-server）
├── worker.ts       # Cloudflare Workers 运行时入口
├── config/         # 环境变量与运行配置
├── db/             # 数据库连接 + 表结构 schema + 迁移
├── middleware/     # 鉴权、CORS、错误处理、参数校验
├── routes/         # 路由（薄控制器层）
├── services/       # 领域服务层（承载业务 + 数据库）
├── shared/         # 基础设施（信封、错误码、分页、存储、JWT…）
└── types/          # 纯类型定义
```

这里要特别点出一个**踩坑点（P-03）**：分层边界是"职责边界"，不是"目录装饰"。我们早期重构时有一条铁律——**`routes` 层禁止直接调用 `getDb()` 去碰数据库**。为什么？因为一旦路由里直接写 SQL，这个接口就再也没法脱离数据库做单元测试了；而把数据库访问收进 `services`，路由就只是一层"胶水"，测试时 mock 掉 service 即可。

换句话说，**路由能不能被单独测，是分层有没有破产的判据**。能 mock service 单测路由，分层就立住了；路由里到处是 `getDb().select(...)`，分层就名存实亡。

![分层架构图](https://i-blog.csdnimg.cn/direct/ca741dec490e4fa08cad8c11f446f4d9.png)

## 三、routes：薄到只剩"胶水"

`routes/` 的职责非常窄，我把它归纳成四步：**鉴权 → 校验入参 → 调 service → 包信封返回**。它不写业务逻辑，也不碰业务规则。

以文章写路由 `src/routes/articles-write.ts` 为例，创建文章的 handler 长这样（节选）：

```ts
articlesWriteRoute.post(
  '/',
  authMiddleware,
  guard('member'),
  v.json(createArticleSchema),
  async (c) => {
    const me = c.get('user');
    const input = c.req.valid('json') as ArticleCreateInput;
    const authorId = Number(me.id);
    const privileged = me.role === 'editor' || me.role === 'admin';
    const created = await createArticleRow(input, authorId, privileged);
    return ok(toArticle(created));
  },
);
```

你看，它做了什么？取出当前登录用户、取出校验过的入参、判断角色是否特权、调用 `createArticleRow`、用 `ok()` 包成统一信封返回。**全程没有一行 SQL，没有一句"如果状态是 draft 就怎样"的业务判断**。那些都藏在 `services/article-mutation.ts` 里。

路由薄，还有一个硬收益：**它能守住行数纪律（P-06）**。`routes/articles-write.ts` 全文才一百来行，因为复杂的创建/更新逻辑全被 `article-mutation` 接走了。我们定了一条规矩——**单文件 ≤200 行是"超出要有可辩护理由"，不是机械切两半**。路由层硬守 200 行；服务层可以软守，但超了必须在文件头注释里说清楚为什么（后面会看到 `article.ts` 就是这么做的）。

## 四、services：领域逻辑真正住在这里

`services/` 是后端的"大脑"。所有业务规则、状态流转、数据库读写，都应该落在这里。它是唯一允许（`@/db/client` 的）`getDb()` 被调用的地方。

还是文章，看 `src/services/article.ts`。这里有三类东西，都是纯领域逻辑：

**1. 状态转移矩阵。** 文章三态 `draft / pending / published`，谁能转到谁，是硬规则：

```ts
export const canTransition = (from: ArticleStatus, to: ArticleStatus): boolean => {
  if (from === to) return true; // 同态转移 = 幂等
  const allowed: ReadonlyArray<[ArticleStatus, ArticleStatus]> = [
    ['draft', 'pending'], ['draft', 'published'],
    ['pending', 'published'], ['pending', 'draft'],
    ['published', 'draft'], ['published', 'pending'],
  ];
  return allowed.some(([f, t]) => f === from && t === to);
};
```

这个矩阵和 OpenAPI 契约里 `Article.status.x-allowed-transitions` 是机器对齐的——契约改了，代码矩阵也得跟着改，否则双门校验会报红。这正是"契约先行"（[契约先行](https://blog.csdn.net/fungleo/article/details/164140515)）带来的好处：业务规则有一份权威定义，代码只是它的实现。

**2. 序列化（snake_case → camelCase）。** 数据库存的是 `view_count`，契约返回的是 `viewCount`。这种"行 → 契约对象"的转换集中放在 `toArticle` / `toArticleSummary`，全站只有一个出口，绝不在路由里手写字段映射。

**3. 统一列表查询。** `queryArticles` 把过滤、分页、排序、投影（列表不取 `content` 长文本）全收口。公开列表强制 `forcedStatus: 'published'`，后台列表才看得到草稿——**"公开只返 published"这条铁律，就是在这个函数里落地的**，而不是散落在各个路由。

注意 `article.ts` 文件头那句注释：它约 252 行，略超 200 软上限。但它集中承载"序列化 + slug 黑名单 + 状态机 + 统一列表查询"四类**紧密协作**的逻辑，拆开反而割裂。所以按纪律"特殊情况需注释说明"，显式标注了理由。这就是 P-06 说的——**200 行是护栏不是枷锁，超了要能辩护，而不是盲目一刀切**。

## 五、shared：与业务无关的"地基"

`shared/` 是不依赖任何具体业务的纯基础设施。它最值得讲的一点是 **`response.ts` 的响应信封构造器，返回的是原生 `Response`，不 import Hono**：

```ts
export const ok = <T>(data: T, message = 'ok'): Response =>
  Response.json(envelope(0, message, data), { status: 200 });
```

返回原生 `Response` 意味着什么？意味着这套信封构造逻辑**零框架依赖**——它能在 Node 跑，也能在 Cloudflare Workers 跑，甚至能被纯 Node 测试环境直接调用。这正是我们选 Hono 时埋下的伏笔（[框架选型-Express-Koa-Fastify-NestJS的差异与为何选Hono](https://blog.csdn.net/fungleo/article/details/164187017) 里提到的"handler 返回原生 Response → lib 零框架依赖"）。

`shared/` 里还有：
- `codes.ts`：业务错误码集中定义（`ErrCode`）。
- `db-error.ts`：把数据库驱动抛的特定错误（如唯一约束冲突）归一化成 `isUniqueConstraintError`，让上层用统一方式兜底。
- `pagination.ts`：解析 `page/pageSize/sort`、组装分页元数据。
- `storage.ts` `jwt 相关` `password.ts` 等：存储抽象、令牌、密码哈希。

这些东西的共同特征是：**换了业务场景也能原样复用**。它们不属于"文章"，也不属于"用户"，所以独立成 `shared`。

## 六、types：纯类型，不掺逻辑

`types/` 只放 TypeScript 类型与接口定义（如 `Pagination`、`Envelope`、`BizErrorCode`）。它不写函数、不发请求、不碰数据库。**把"形状"和"行为"分开**，收益是：类型可以被任意层 import，而不会引入运行时副作用或循环依赖。

这里引出第二个踩坑点（P-04）：**抽层之前先画依赖箭头**。分层最容易翻车的地方是循环引用——A 依赖 B，B 又依赖 A。我们的解法是"类型与实现分离"：类型放 `types/`，谁都能安全 import；真正会产生运行期依赖的实现放各自模块，用依赖注入（比如 `getDb()` 在调用时才取，而不是模块顶层 import 死）把环解开。结构调优时这步是提前做的，否则等代码缠成一团再解，成本翻倍。

## 七、分拆不是目的，合回来也是纪律（P-07）

最后聊一个反直觉的点。我们做过一次"结构调优"：把超 200 行的文件拆小。但拆分是**超出 200 行的应激反应**，不是目标。调优过程中我们发现，早期为了压行数把 `categories`、`comments` 各自拆成了多个碎片文件，等逻辑理顺、行数自然降下来后，**这些碎片反而应该主动合并回收成单文件**——拆太碎同样伤害可读性。

所以 P-07 的结论是：**分拆是应激、行数降下来就该回收**。结构的终态不是"文件越小越好"，而是"每个文件的职责单一且自洽"。这一点我在写《领域建模》那篇（[领域建模](https://blog.csdn.net/fungleo/article/details/164139553)）时也强调过——建模的尽头是清晰，不是堆砌。

## 八、小结与前瞻

这一篇我们厘清了后端的分层边界：

1. **routes 薄**：只做鉴权、校验、调 service、包信封，**禁碰 `getDb`**（P-03，分层破产判据）。
2. **services 厚**：业务规则、状态机、序列化、列表查询都在这，是 `getDb` 的唯一合法住户。
3. **shared 纯**：与业务无关的基础设施，且尽量零框架依赖（响应信封返回原生 `Response`）。
4. **types 轻**：只放类型，不掺逻辑，从根上避免循环依赖（P-04）。
5. **200 行是护栏不是枷锁**（P-06），分拆是应激、合回也是纪律（P-07）。

下一篇（[数据库选型-关系型还是文档型](https://blog.csdn.net/fungleo/article/details/164209279)）我们钻进 `config/` 和运行时：环境变量从哪来、Node 与 Cloudflare 双路部署时配置怎么注入、为什么 `app.ts` 只导出工厂而不在顶层 new 一个 app。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

