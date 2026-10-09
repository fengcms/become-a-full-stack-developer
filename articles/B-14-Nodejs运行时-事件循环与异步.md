# 成为全栈·基础补充·Node.js 运行时：事件循环与异步

这个项目里有一段代码，它的外形是 `async`，但内部调用的是一个**同步**函数：

```ts
/** 同一批 SQL 在 SQLite 事务或 D1 batch 中执行；异常整体回滚。 */
export async function atomic(db: Db, statements: Statement[]): Promise<number[]> {
  const client = (db as unknown as { $client: Database.Database | D1Client }).$client;
  if ('batch' in client) {
    const results = await client.batch(
      statements.map((s) => client.prepare(s.sql).bind(...s.params)),
    );
    return results.map((r) => r.meta.changes);
  }
  return client.transaction(() =>
    statements.map((s) => client.prepare(s.sql).run(...s.params).changes),
  )();
}
```

**一个 `async` 函数，却在本地路径上完全同步执行。**

这在 TypeScript 里合法（`async` 函数返回 Promise，里面可以是同步逻辑），但它立刻带来一个问题：**调用方能假设它是异步的吗？**

答案是不能。**而这个项目里有一整类代码，专门处理"我不确定那个 Promise 会不会已经结束"。**

这篇讲这个项目的 Node 运行时经验，以及为什么 Flutter 那边的每一处异步都要记身份（M4-09 那些 `epoch` 检查，其实根源在这里）。

{{IMG:B-14-封面}}

## 单线程意味着：await 之间的代码会被插队

先把最关键的前提说清楚，因为它解释了后面所有的复杂度。

**Node 的 JavaScript 执行是单线程的。** 而单线程不代表"顺序执行到底"——它代表的是：

> **一次只执行一段代码，但会在 `await` 这些让出点主动把控制权交出去。**

而"让出点"具体是哪些，取决于具体是什么操作：

| 操作 | 会不会让出 |
|---|---|
| 读取文件（`fs.readFile`） | **会**，文件在磁盘上，得等 I/O 完成 |
| 网络请求（`fetch`） | **会**，要等对端响应 |
| 数据库查询 | **会**，数据可能在远端 |
| 纯计算（排序、大循环） | **不会**，一直占着 |
| 定时器（`setTimeout`） | 会等，但等的是时间 |

**而"让出"期间，同一个线程会去处理别的事——包括另一个请求的代码。**

这就是事件循环的核心，也是**所有异步 bug 的根源**。

## 一个必须记住的后果：await 之后的世界可能变了

用一个真实场景说明。看这个项目的刷新逻辑（简化）：

```ts
Future<void> refresh() {
  if (_refresh != null) return _refresh!;
  final start = epoch;
  final task = () async {
    final token = await vault.read();          // ← 第一次让出
    if (start != epoch) throw SessionChanged();  // ← 检查世界有没有变
    ...
    final data = await request(Endpoints.refresh, ...);  // ← 第二次让出
    await install(data, expectedEpoch: start);           // ← 第三次让出
  }();
```

**三处 `await`，两处检查。**

而检查的内容是 `start != epoch`——**"我发起这次操作时，那个会话还在吗？"**

为什么必须检查？因为在每个 `await` 处，**用户完全可能已经做了别的事**：

```text
时刻 T1：refresh() 开始，记下 epoch = 3
时刻 T1+ε：await vault.read() 让出
           ↓ 此时用户点了"退出登录"
           ↓ clear() 执行，epoch 变成 4
时刻 T2：await 返回，继续执行
         如果不检查 → 用 epoch 3 的上下文完成刷新
         结果 → token 被写回一个已经登出的会话
```

**这就是 Flutter 那边的 `epoch`。而它在 Node 这边同样存在**——M1-32 那个微信登录就是同一套：`atomic` 里的 `SessionChanged` 异常处理的就是这个。

**所以这一篇的核心结论是：**

> **在单线程事件循环里，`await` 不只是"等一会儿"，它是一个"世界可能已经变了"的边界。**

而这个判断标准是通用的，不限于异步 I/O：

| `await` 之间可能发生什么 | 需要检查吗 |
|---|---|
| 用户切换了账号 / 登出 | **要** |
| 用户关闭了页面（Flutter Widget dispose） | **要** |
| 页面从后台切到前台 | 可能要 |
| 单纯的定时器到期 | 不需要 |

## 为什么这个项目里的异步都要"记身份"

现在讲这个项目里反复出现的那个模式。

M4-12 的列表页：

```ts
final ticket = ++serial;
setState(() { busy = true; error = null; });
...
final p = await repo.track(dependencies, () => repo.articles(...));
if (!mounted || ticket != serial) return;   // ← 记了号，回来核对
```

M4-10 的 `AsyncPane`：

```ts
final ticket = ++serial;
...
if (mounted && ticket == serial) {
  setState(() { value = result; error = null; keys = nextKeys; });
}
```

M4-15 的 WebView 标题轮询：

```ts
final url = currentUrl;
final next = (await controller!.getTitle())?.trim();
if (mounted && url == currentUrl && next != title) {   // ← 记了 URL，回来核对
  setState(() => title = next?.isNotEmpty == true ? next : null);
}
```

M4-09 的 epoch 检查。

**四处看起来毫不相干的代码，用的是同一个模式：发起时记下身份，回来时核对，不匹配就丢弃。**

而 Flutter 那边还有两个条件：

| 条件 | 防什么 |
|---|---|
| `mounted` | Widget 已经销毁 → `setState` 会抛异常 |
| `ticket == serial` | 有更新的请求已发出 → 旧结果不该覆盖 |

**`mounted` 那个是 Flutter 特有的**，因为 Widget 生命周期是框架管理的。而 `ticket`/`epoch`/`url` 那一层是通用的。

**所以如果只看这个模式，你会以为这四处的代码是四个不同的技巧。实际上它们是同一句话：**

> **异步操作的结果，只对发起它的那个世界有效。**

## 单飞：一个特例

而这个模式有一个特殊形态，M4-09 讲过，叫"单飞"：

```ts
Future<void> refresh() {
  if (_refresh != null) return _refresh!;    // ← 不记新身份，而是复用已有的
  ...
}
```

**为什么刷新要复用而不是各刷各的？**

因为它是**切换语义**的操作（第一次刷成功，第二次就会因 token 已轮换而失败）。而五个并发 401 会触发五次刷新，**而轮换过的 token 用一次就作废**。

所以这里的处理不是"记身份然后丢弃旧的"，而是"**后来的直接用前一个的结果**"。

| 场景 | 处理 | 理由 |
|---|---|---|
| 列表加载 | 记 `ticket`，旧结果丢弃 | 多个请求都合法，只要最新的 |
| 标题轮询 | 记 `url`，不匹配丢弃 | 同上 |
| **令牌刷新** | **复用 `_refresh`** | **重复执行会失败，必须共享** |

**这个区别很重要**：前者是"多个都可以，只要一个结果"，后者是"多个会互相破坏"。

**而判断标准是：重复执行这个操作，是否安全？**

- 读操作 → 安全（记身份即可）
- 切换语义的操作 → **不安全**（必须共享）
- 创建操作 → 不安全（会重复创建，M4-20 讲的那个）

## 并行不是并行：async 只是"不阻塞"

现在讲一个常见误解。

```ts
const [a, b, c] = await Promise.all([
  fetchA(), fetchB(), fetchC(),
]);
```

**看起来是三个并行，实际是：三个都发起 → 等第一个完成 → 等第二个 → 等第三个。**

而"三个都发起"才是并行的部分——**它们几乎同时把请求送出去了**。而 Node 在这个过程中**不阻塞**：

- 发起 fetchA → 让出，去处理别的连接
- 发起 fetchB → 让出
- 发起 fetchC → 让出
- 三者的响应陆续到达，回调进事件队列

**所以它是"并发 I/O"，不是"并行计算"。**

| | 并发 I/O | 并行计算 |
|---|---|---|
| 场景 | 多个网络请求 | CPU 密集计算 |
| Node 能力 | ✅ 单线程足够 | ❌ 需要 worker_threads |
| 瓶颈 | 网络延迟 | CPU 核数 |

**而这个项目里那个"登录接口很慢"的问题，正属于第二类**——B-06 讲过，慢在 `bcrypt` 的 12 轮哈希，那是纯 CPU 计算。

**它不会因为改成 `async` 而变快。** 因为 `async` 只解决"等待"问题，不解决"计算"问题。

### 怎么判断自己遇到了哪一种

一个简单的区分方法：**把输入换成常量再测一次。**

- 如果慢在**数据量** → 大概率是 I/O 或查询
- 如果慢在**计算** → 常量输入也会慢

这个项目里 `bcrypt` 就是后者——**传 1 个字符和传 100 个字符一样慢**，因为轮数固定。

## 同步代码会阻塞：最容易犯的错

回到开头那个 `atomic`：

```ts
return client.transaction(() =>
  statements.map((s) => client.prepare(s.sql).run(...s.params).changes),
)();
```

**这一段是同步的**——`transaction()` 立即执行完，返回数组，函数结束。

而调用方看到的是一个 `async` 函数，**所以它 `await` 了一次**：

```ts
const changed = await atomic(db, [...]);
```

而这个 `await` 在本地路径上**实际上没有让出**——因为 Promise 已经 resolve 了。

**所以这段代码在本地和线上的行为是"看起来一致"的：调用方都 await，都拿到 changes[]。**

而这正是它的设计目的（M1-33 讲过）：**业务代码不用关心当前是哪种运行时。**

**但要注意一个副作用**：在本地路径上，这个 `await` 让出一个微任务。**如果这段代码在一个循环里调一万次，就有一万个微任务。** 这在实测中不构成问题（因为这类批量操作本身就很重），但**它说明"加了 async 不等于零成本"**。

**更一般的教训是：把同步 API 声明成 async，调用方就会被迫 await。** 而 `await` 一个已 resolve 的 Promise 会让出到微任务队列，**所以在热路径上这是有成本的**。

**正确做法是分成两个函数**——同步版和异步版，让调用方自己选。这个项目没做，是因为这个调用点不在热路径上。**但它是一个真实的取舍，不是无成本的优雅。**

## 错误处理属于异步流程的一部分

最后讲这块，因为它和同步代码的习惯不同。

同步代码：

```ts
const user = getUser(id);   // 抛错就抛错
use(user);
```

而异步代码里，`throw` 变成"reject 一个 Promise"，**而没人 await 的话，它就变成一个 unhandled rejection**。

这个项目里有个真实的例子：

```ts
unawaited(_fetch(key, policy, fetch, tags, forbidden)
  .catchError((Object _) => null));
```

**`unawaited()` + `.catchError()` ——两个都是刻意的。**

- `unawaited()`：告诉 linter "我知道我没 await，这是故意的"
- `.catchError()`：吞掉后台任务的错误

**而这两者缺一不可**：只写 `unawaited` 会产生 unhandled rejection（Node 会打印警告，某些配置下会直接崩溃）；只写 `catchError` 而不用 `unawaited`，linter 会报"未处理的 Promise"。

**这个写法把"我知道这里有个 Promise，我没等它"这件事显式化了**——而不是让它看起来像忘了 await。

而真正需要 await 的地方，错误就正常往上抛，由顶层的错误处理收口：

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

**注意那个 `[unhandled]` 前缀**——它和那些被 `.catchError` 吞掉的错误形成对照。**能到这里的都是"没人处理"的问题**，所以要打日志。

## 一条我一开始想省掉的事

那个"记身份、回来核对"的模式，我最初的实现是"只检查 `mounted`"。

理由是"Flutter 里 Widget 销毁了就不该 setState，够了"。

结果是一个真实的问题：**用户在搜索页快速输入，两次请求几乎同时发出，第一个请求先回来。**

那时候 `mounted` 是 true（页面还在），所以第一个结果直接渲染了。**然后第二个结果回来，覆盖掉它。**

用户看到的是：**输入"a"，看到的结果对应"ab"。**

而这个 bug 极其难发现，因为：单次搜索完全正常、结果通常"差不多对"、而两次输入之间的间隔通常只有几百毫秒。

**加上 `serial` 之后，这类问题才消失。** 而它的成本只有两行。

**而这件事和 Node 那边的教训是同一个**：单线程不代表逻辑不会交错——**`await` 处就是交错的边界。**

顺带说 M4-10 那个 `loadKey` 机制（防"同一个 Widget 被复用但参数变了"）也是同一族的问题。它的表现更隐蔽：**文章页显示的是 A 作者的文章，标题却是 B 的**——因为组件复用了，而基线值没重置。

**三个问题三个现象，一个根因：异步结果被用在了它不再成立的上下文里。**

## 小结

Node 运行时在这个项目里沉淀下来的判断：

1. **`await` 不只是"等"，它是"世界可能变了"的边界。** 每次 await 之后都要重新确认前置假设。
2. **单线程不等于顺序执行**——`await` 会让出控制权，让出期间会处理别的事。
3. **并发 I/O ≠ 并行计算**。`async` 解决等待，不解决计算。
4. **同步 API 声明成 async 有成本**（强制调用方 await 多一个微任务），尤其在热路径上。
5. **后台任务要显式标注 `unawaited` + `catchError`**，否则要么崩溃要么被 linter 忽略。
6. **重复执行是否安全，决定了并发处理方式**：安全的记身份，不安全的必须共享（单飞）。

而第 1 条是这个专栏贯穿多个系列的模式——M4-09 的 `epoch`、M4-12 的 `serial`、M4-10 的 `ticket`、M4-15 的 `url` 比较，**四个地方都是同一句话的不同措辞**：

> **异步结果只对发起它的那个世界有效。**

而 Flutter 那边的 `mounted` 检查是 Node 这边没有的，**因为框架会销毁 Widget，而 Node 的请求没有"被销毁"这个概念**——它的"上下文消失"表现为用户登出，而那要靠 `epoch` 这样的业务标记才能知道。

**这说明同一个模式在不同环境里需要不同的"身份标记"**，而标记的来源是环境特有的。

下一篇讲服务端的心智模型——把一个请求从浏览器到数据库的完整链路画出来，标出每一层可能失败的地方。

## 延伸阅读

- [Refresh Token 旋转与并发 401：安全存储与会话代次]({{LINK:M4-09}})
- [并发幂等与重复请求：怎样避免业务状态被改坏]({{LINK:B-20}})
- [服务端心智模型：一个请求从浏览器到数据库发生了什么]({{LINK:B-15}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Node.js、事件循环、异步编程、JavaScript、后端开发、并发

### 文章简介（250 字以内）

Node.js 如何在一个主 JavaScript 执行线程上处理大量网络请求？本文解释同步阻塞、异步 I/O、事件循环、Promise 微任务、libuv 线程池和 CPU 并行的区别，并说明 async/await 不会自动开启线程。文章还介绍异步错误、超时、取消、性能诊断和 Worker Threads 的适用边界，最后与 Go goroutine 做概念对照。

### 建议发布分类

后端 / Node.js

### 封面短标题

异步不是自动多线程

### 配图 AI 提示词

1. B-14-封面：Node.js 主线程处理 JavaScript 回调，网络 I/O 等待期间事件循环处理其他就绪事件。
2. B-14-并发和并行：多任务交错等待与多核心同时计算的图示对比。

### 发布前核对

- [ ] 事件循环阶段顺序不做脱离版本和上下文的绝对化断言。
- [ ] 区分网络 I/O、线程池任务和 JavaScript 主线程执行。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
