# 成为全栈·基础补充·Web 安全基础：XSS、CSRF 与 SQL 注入

写这篇的时候我先做了一件事：在项目里搜 `dangerouslySetInnerHTML`。

**结果是自己代码里只有 1 处**（另 4 处都在第三方 Markdown 编辑器的源码里）。而这唯一一处在哪呢？

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      ...
    }),
  }}
/>
```

**它在渲染 JSON-LD 结构化数据**——而 JSON-LD 是必须以原始形式放进 `<script>` 标签的，没法用 React 的正常方式渲染。

所以这个项目必然要用 `dangerouslySetInnerHTML`。**问题变成了：怎么用才安全。**

答案是：

```ts
export const jsonLd = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c');
```

**一个 `.replace()` 解决了。** 这篇讲它解决的是什么，以及另外两类在这个项目里被彻底防住的攻击。

{{IMG:B-11-封面}}

{{IMG:B-11-防护映射}}

## 先分清：三个攻击打的是不同东西

XSS、CSRF、SQL 注入经常被混为一谈，但它们**打的不是同一个目标**：

| 攻击 | 打的是 | 成功的前提 |
|---|---|---|
| **XSS** | **用户的浏览器** | 攻击者的代码在用户页面里跑起来了 |
| **CSRF** | **用户的身份凭证** | 浏览器自动带上了凭证，且服务端分不清 |
| **SQL 注入** | **数据库** | 攻击者的输入改变了 SQL 语义 |

**这个区分决定防护放在哪一层**：

- XSS → 防护在**输出端**（别让危险内容变成 HTML）
- CSRF → 防护在**请求来源判断**（凭证 + 来源要匹配）
- SQL 注入 → 防护在**查询构造**（参数别参与 SQL 语法）

而这个项目在这三处都有可看的东西。

## SQL 注入：这个项目防得最彻底

先讲最"好防"的一类，因为它的防护方式最干净。

SQL 注入的前提是：**用户输入参与了 SQL 语句的结构**。

而这个项目的排序参数处理是这样的：

```ts
/** 允许排序的字段 → 实际列表达式（白名单，杜绝注入）。 */
const SORT_COLUMNS: Record<string, string> = {
  publishedAt: 'COALESCE(articles.published_at, articles.created_at)',
  viewCount: 'articles.view_count',
  createdAt: 'articles.created_at',
};

export const buildSortSql = (sort?: string): SQL => {
  // 先剥离可选的 '-' 前缀得到裸字段名，再查白名单；未知字段回退默认 -publishedAt
  const bare = sort?.startsWith('-') ? sort.slice(1) : sort;
  const raw = bare && bare in SORT_COLUMNS ? (sort ?? '-publishedAt') : '-publishedAt';
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  const column = SORT_COLUMNS[field] ?? 'COALESCE(articles.published_at, articles.created_at)';
  const dir = desc ? 'DESC' : 'ASC';
  return sql`${sql.raw(column)} ${sql.raw(dir)}, articles.id DESC`;
};
```

**关键在 `bare in SORT_COLUMNS` 这个判断。**

用户传 `?sort=-publishedAt`，程序：
1. 剥掉 `-`，得到 `publishedAt`
2. **查白名单**——不在里面就丢掉
3. 用白名单里查到的**列表达式**替换掉用户输入

所以攻击者传 `?sort=1;DROP TABLE articles--` 时：

- 剥掉前缀得到 `1;DROP TABLE articles--`
- **不在白名单里** → 回退到默认值 `-publishedAt`
- 最终执行的 SQL 里没有任何用户输入的内容

**这就是"参数化查询"的本质**：不是"把用户输入洗干净再用"，而是**根本不让用户输入参与 SQL 结构**。

**注意 `sql.raw(column)` 这个用法——它明确表示"这段是原始 SQL，不参数化"。** 之所以敢这么写，是因为 `column` 的值只可能来自 `SORT_COLUMNS` 这个对象，**而不可能来自用户输入**。

这是白名单模式的核心特征：**危险操作保留，但输入路径被完全切断。**

### 白名单比黑名单好在哪

对比一下两种做法：

| 做法 | 规则 | 问题 |
|---|---|---|
| 黑名单 | 禁止出现 `SELECT`、`DROP`、`--` | **绕过方式无穷**（大小写、编码、变形） |
| 白名单 | 只允许 `SORT_COLUMNS` 里的三个值 | **没法绕过**，因为不在列表里就无效 |

**黑名单的总是在和攻击者赛跑，白名单不需要赛跑**——因为它不判断"什么是坏的"，只判断"什么是好的"。

而白名单的代价是**要维护**。新增一个可排序字段，必须记得同时加进 `SORT_COLUMNS`。**忘了的话，用户排不了序**——这是个明确的小代价，而黑名单漏了则是安全问题。

### 顺带看一个注入防护之外的问题

看这个 `id DESC`：

```ts
return sql`${sql.raw(column)} ${sql.raw(dir)}, articles.id DESC`;
```

**末尾那个 `articles.id DESC` 不是安全措施，是正确性措施。**

因为 `published_at` 可能为 NULL（草稿没发布），而分页排序如果不加稳定键，**两页数据可能重复或遗漏**——这就是 M1-25 讲的"分页重漏"。

**加上 `id DESC` 之后，排序结果完全确定**（因为 id 唯一），翻页时不会出现第 2 页里有第 1 页的条目。

**这两个需求长得完全不一样**（一个防注入、一个防数据重复），但它们碰巧都在同一行 SQL 里。这提醒了一件事：

> **安全措施和正确性措施是不同的东西，它们可能被同一行代码实现，也可能互相干扰。**

这个项目的注释里写得很清楚：

```ts
/** 允许排序的字段 → 实际列表达式（白名单，杜绝注入）。
 * 统一以 articles. 限定基表列：queryArticles 恒以 articles 为基表，
 * 标签 JOIN 后 created_at / id 等会歧义，限定基表可根除。 */
```

**"限定基表列"解决的是另一个问题**：JOIN 之后 `created_at` 这个名字在两张表里都有，SQLite 会报"字段名歧义"。加上 `articles.` 前缀就明确了。

**而这个问题如果不加限定基表，可能在开发时不报错、生产数据变大后才报错**——因为只有 JOIN 之后的查询才需要它。

## XSS：防护在"这段内容会不会变成 HTML"

XSS 的本质是：**一段文本被当成了代码执行。**

而防护的核心问题是：**这段内容会出现在哪个上下文？**

因为不同上下文的"危险语法"完全不同：

| 上下文 | 危险语法 | 例子 |
|---|---|---|
| HTML 正文 | `<script>`、事件属性 | `<img onerror=alert(1)>` |
| 属性值 | `"` 提前闭合 | `title="x" onmouseover="..."` |
| JavaScript 字符串 | `</script>` 提前闭合 | `var x = "</script>..."` |
| URL | `javascript:` | `<a href="javascript:...">` |

**这就是为什么"我已经转义过了"这句话通常不完整**——你得说清楚转义的是哪个上下文。

现在看这个项目那唯一一处 `dangerouslySetInnerHTML`：

```ts
export const jsonLd = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c');
```

**`JSON.stringify` 本身不够。**

因为 `JSON.stringify({title: '</script><script>alert(1)</script>'})` 产生的字符串里含有 `</script>`，而当它被放进 `<script type="application/ld+json">` 标签里时，**HTML 解析器会先看到 `</script>` 就结束标签**——剩下的内容就成了真正的 script。

**所以必须转义 `<` 这个字符**，把它变成 `\u003c`。这样字符串里就没有能闭合标签的序列了。

**而只转义 `<` 就够**，因为 `JSON.stringify` 已经处理了引号和反斜杠。

**这是一个典型的"上下文决定防护"的例子**：这里的内容不进 HTML 正文，而是进 `<script>` 标签内部，所以要防的是"闭合标签"而不是"标签本身"。

### Markdown 渲染：另一个上下文

而正文 Markdown 走的是完全不同的路径——M4-13 讲的那个 `ReaderMarkdown`。

它用的是 `flutter_markdown_plus` 的默认行为，而那个库的默认设置是**不执行原始 HTML**：

```dart
/// 仅 ATX 标题消耗服务端目录项；代码围栏和 Setext 标题不冒充目录锚点。
class ServerHeadingSyntax extends md.HeaderSyntax {
```

而这个项目在这上面的选择是：**无条件不信任服务端内容**，因为正文来自用户投稿，是外部输入。

**对比一下："HTML 转义"是主动的防护，"不用 innerHTML"是被动的防护。** 后者更好——因为它不依赖有人记得调用那个函数。

**这也是为什么我在 M4-25 讲设计令牌时说"禁止色值"：** 禁用的规则比"记得遵守的规则"可靠。同理，**"框架默认不执行 HTML"比"我们每次都记得转义"可靠。**

## CSRF：防护在"凭证 + 来源要匹配"

CSRF 的机制和前两个不同：**攻击者的代码从不在受害者页面里执行**。

攻击过程是：

```text
1. 用户登录了 api-befull.kao9.com，浏览器带着 Cookie
2. 用户去攻击者的网站
3. 那个网站放一个表单，target="https://api-befull.kao9.com/me/setup-account"
4. 浏览器**自动**带上 Cookie 提交
5. 服务端收到一个看起来合法的请求
```

**关键在第 4 步：浏览器不知道这个请求是从哪个页面发起的。** 它只知道"我要往这个地址发，Cookie 里有对应的凭证，那就带上"。

而这个项目为什么不受影响？因为 M0-05 讲的那个决定——**认证用的是 `Authorization: Bearer` 头，不是 Cookie**。

```ts
headers: {
  if (!anonymous && accessToken != null)
    'Authorization': 'Bearer $accessToken',
}
```

**浏览器不会自动帮你加 `Authorization` 头。** 它只会自动带 Cookie——而这个项目不靠 Cookie 认证。

所以这个项目的 CSRF 风险接近零，**而这不是加了什么防护，是压根没有那个攻击面。**

这个结论值得展开：

> **CSRF 防护有两种做法：一是加防护（同源检查、CSRF token），二是让攻击不成立（不用 Cookie 认证）。**

第二种更彻底，代价是架构层面就要决定（Cookie 认证对 Web 端更方便，所以很多项目选了第一种）。

而这个项目选了第二种，**代价体现在 M4-09 讲的那个成本上**——手动管理 token 刷新、并发 401 单飞、存储位置选择，**这些复杂度都是"不用 Cookie"的账单。**

**没有免费的 CSRF 安全，只有把成本花在别处。**

### 唯一需要小心的地方

不过这个项目有一处确实用了 Cookie：**refresh token 的存储。**

所以它的 refresh 接口需要额外防护。而 M4-09 讲的那个设计恰好覆盖了：

- refresh token 是**有状态、可撤销**的（存在数据库，有 `revoked_at`）
- 每次刷新都会**轮换**（用一次就作废发下一个）

**即使 CSRF 攻击成功拿到了一个 refresh token，它用掉之后服务端就换发了新的，而旧的立刻失效。** 攻击者拿到的是一个一次性凭证。

**而"轮换"这个设计本身也是 CSRF 缓解**——它限制了单个 token 的可用时间。

## 密钥、依赖和错误信息

最后讲三类不属于上面三个、但同样重要的防护。

### 密钥不进代码、不进前端

这个项目用 Cloudflare 的加密 secret 存 JWT 密钥和 AppSecret：

```toml
# JWT_SECRET 为敏感项，走加密 secret（不进 git / 不写本文件）：
#   wrangler secret put JWT_SECRET
```

而 `wrangler.toml` 里还留了一条注释：

```ts
// 微信小程序登录（可选；缺失时 callback 返回 500/5000，不影响密码登录）：
//   wrangler secret put WECHAT_MINI_APP_ID
//   wrangler secret put WECHAT_MINI_APP_SECRET
// 不在配置文件或前端保存 AppSecret；本期仅支持此单个小程序身份空间。
```

**最后那句是 M1-32 那个 bug 的教训**——排查时我发现日志里可能带 AppSecret，于是定下了这条规则。

而判断标准很直接：

> **这条日志/这个字段会不会出现在一个用户能看到的地方？**

如果会，它里面的每个字段都要按"用户可能看到"来审。

### 错误信息不泄露内部细节

顶层错误处理：

```ts
export const errorHandler: ErrorHandler = (err, _c) => {
  if (err instanceof AppError) {
    return failResponse(err.code, err.httpStatus, err.details);
  }
  // 兜底：未知异常不应向客户端泄露堆栈
  console.error('[unhandled]', err);
  return failResponse(ErrCode.INTERNAL, 500);
};
```

**注意那个分流**：已知错误（`AppError`）返回业务码和消息，未知异常**只返回 500 和统一消息**，堆栈只进服务端日志。

**这个"不泄露堆栈"是个容易被省略但很关键的规则。** 堆栈里有文件路径、函数名、甚至可能的配置值——**对攻击者来说这是地图**。

而错误码的设计也考虑了信息暴露：

```ts
// 1001 不暴露账号是否存在
if (!user) throw new AppError(ErrCode.USERNAME_OR_PASSWORD_ERROR, 401);
```

**用户不存在和密码错误返回同一个码。** 因为如果分开返回，攻击者可以用它枚举出哪些用户名注册过。

### 依赖：知道自己在用什么

这个项目用 `url_launcher`、`image_picker`、`flutter_secure_storage` 这些插件。而它们各自的权限范围差别很大：

| 插件 | 权限 | 风险 |
|---|---|---|
| `url_launcher` | 无 | 低，但要注意 URL 校验（M4-15） |
| `image_picker` | 相册读取 | 中 |
| `flutter_secure_storage` | Keychain | **高，存的是长期凭证** |
| `webview_flutter` | 网络 + JS 执行 | **高（M4-15 讲了不能注入 token）** |

**依赖的风险不在于"它有没有漏洞"，而在于"你给了它什么"。**

`webview_flutter` 本身没问题，问题是"如果我给它注入 Authorization 会怎样"——那是 M4-15 那个决定。

{{IMG:B-11-防护边界}}

## 怎样测试安全边界

最后讲测试，因为这一章的东西最容易变成"看起来对"。

**安全相关的测试要覆盖失败路径，而且断言要写"防护生效了"，不是"没报错"。**

这个项目里一个真实的例子是 M1-32 那个微信登录测试：

```ts
expect(fetchMock).toHaveBeenCalledTimes(1);   // 没有跟随 Location 再请求
```

**它测的不是"请求成功了"，而是"没有发出不该有的第二个请求"。** 而后者才是 SSRF 防护的核心。

而 B-17 讲的那条原则在这里同样适用：

> **测"不能发生什么"比测"应该发生什么"更能证明防护有效。**

因为正常路径的实现可能很多种，而"没有发生坏事"只有一种。

**具体到这个项目，测试要覆盖的失败路径：**

| 攻击类型 | 该测什么 |
|---|---|
| SQL 注入 | `?sort=1;DROP TABLE--` 后表还在、查询回退默认值 |
| XSS | 标题含 `<script>` 时页面不执行 |
| CSRF | 无 Authorization 头的请求被拒 |
| 越权 | A 用户访问 B 的文章返回 403/404 |
| 密钥泄露 | 日志不含 token/secret |

**最后一条最难测**，因为它不是"某个输入会不会出问题"，而是"我输出的东西里有没有敏感值"——而后者只能靠人工审查 + 人工抽查。

**这个项目认了这一点**：没有自动化的密钥泄露检测，只有 code review 时的注意力。

## 一次 XSS 防护差点漏掉的场景

写完那行 `.replace(/</g, '\\u003c')` 我以为这件事就结束了。

后来做移动端那批文章时，我想起了一个问题：**App 端没有 `<script>` 标签，但有别的地方能执行代码。**

具体是 M4-15 讲的那个 WebView：它设置了

```dart
await web.setJavaScriptMode(JavaScriptMode.unrestricted);
```

**任意 JS 可执行。** 而它加载的是第三方网站。

这时候如果有个"注入到 URL 里"的场景——比如用户的昵称里含了某些字符，被拼进了 URL——那么这个 URL 在 WebView 里打开时，**那段内容会在第三方站点的上下文里执行。**

而这和 XSS 的区别是：**XSS 发生在你自己的页面上，这里发生在别人的页面上。** 但危险程度是一样的——**因为执行环境里有你的凭据**（如果 WebView 带了 token）。

这也是为什么 M4-15 讲的那个决定是两条绑在一起的：

| 决定 | 后果 |
|---|---|
| 允许任意 JS 执行 | 网页里的代码能跑 |
| 不注入 Authorization | **那些代码拿不到用户的身份** |

**只做第一条会出事，只做第二条是安全的，而两条都做才是"能用第三方网站且不会丢账号"。**

而这个联系是我当时没想通的——**直到我在写 WebView 那篇时回头看了一眼 XSS 的防御清单**，发现"输出到 HTML"这一项在这里没有对应物，**因为它根本不是 HTML 上下文**。

这提醒我一件事：

> **XSS 的防护思路（按上下文转义）是可以推广的，但推广的前提是你知道现在是什么上下文。** 而"把用户内容放进 WebView"是一个我完全没想到的新上下文。

## 顺带说一个我明确没做的

这个项目没有 CSRF token、没有 CSP、没有依赖漏洞扫描。

前两个是因为不需要（不用 Cookie 认证、而 CSP 在 Next.js 这类框架里配起来要处理 nonce，M4-15 那个场景也不在 CSP 的适用范围内）。

**依赖扫描是因为这个项目没有引入生产依赖的运行时风险面**——`node_modules` 里大部分是构建期依赖。

但我要说清楚：**"不需要"是一个当时基于当前设计的判断，不是永久结论。** 如果哪天这个后端改成用 Cookie 认证（比如为了和某个第三方系统对接），**CSRF token 就必须加上**，而现有的鉴权中间件也要跟着改。

**所以这条缺口应该记成一个"依赖条件成立"的假设** ——因为如果那个条件不成立了，而没人记得它，安全问题会静悄悄地出现。


## 小结

这个项目的三类防护，本质上是三种不同的思路：

1. **SQL 注入靠白名单** —— 不是过滤坏的，而是只允许好的。`SORT_COLUMNS` 三个字段，未知输入直接回退。
2. **XSS 靠上下文决定转义** —— 那处 `dangerouslySetInnerHTML` 转义 `<` 是因为内容进 `<script>` 内部；正文 Markdown 靠"框架默认不执行 HTML"。
3. **CSRF 靠架构选择** —— 不用 Cookie 认证，攻击面根本不成立。代价是 M4-09 那套 token 管理复杂度。

而三条里最有价值的经验是第三条：

> **消除攻击面比防护攻击面更彻底。** 但它有账单——这个项目的账单就是手动管理 token 的那一整套。

还有一条贯穿的判断：

> **安全措施的强度取决于它的触发条件有多自然。** `jsonLd` 里的 `.replace()` 是函数内部的、不转义就出错——这类防护可靠；而"每次拼 HTML 都记得转义"——这类防护依赖每次都记得。

**把防护放在不需要记得的地方，是这个项目在安全上反复验证的做法**——M4-25 讲"禁止色值"是同一条原则。

## 延伸阅读

- [权限模型：从认证到 RBAC](https://blog.csdn.net/fungleo/article/details/164396910)
- [参数校验：为什么必须在最外层做](https://blog.csdn.net/fungleo/article/details/164327423)
- [评论内容安全：敏感词过滤、三态审核与级联删除](https://blog.csdn.net/fungleo/article/details/165110811)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Web安全、XSS、CSRF、SQL注入、网络安全、后端开发

### 文章简介（250 字以内）

本文从输入和信任边界出发，讲解 XSS、CSRF 和 SQL 注入的触发条件与防护边界：按输出上下文编码并谨慎渲染 HTML；保护自动携带 Cookie 的跨站写请求；用参数化查询和值绑定避免输入改写 SQL 结构。文章还区分输入校验、认证、授权、CORS、CSP 和密钥管理，并给出适合隔离环境的安全测试场景。

### 建议发布分类

网络安全 / Web开发

### 封面短标题

守住浏览器与数据库边界

### 配图 AI 提示词

1. B-11-封面：用户输入进入网页 HTML、浏览器 Cookie 请求和 SQL 查询三条路径，各自有对应防护边界。
2. B-11-防护映射：XSS 输出编码、CSRF 来源/token 校验、SQL 参数化查询的对应关系。
3. B-11-防护边界：放在正文同名占位处，三类攻击防护映射：SQL 注入、XSS、CSRF 各自打在不同位置。

### 发布前核对

- [ ] 检查 SameSite、CORS、HttpOnly 的适用边界，不将其写成万能防护。
- [ ] 示例 SQL 只用于说明危险构造，不包含真实敏感数据或可攻击目标。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
