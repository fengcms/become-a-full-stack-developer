# 成为全栈·Flutter App 篇·Riverpod 状态边界：会话、服务端数据和表单草稿

这个 App 里有三种状态，它们的脾气完全不同：

| 状态 | 例子 | 谁修改 | 改完要不要通知界面 |
|---|---|---|---|
| 会话 | 当前登录用户 | 登录、登出、令牌过期 | 要 |
| 服务端数据 | 文章列表、未读数 | 后台刷新、写操作 | 要，但只能通知"关心它的"部分 |
| 表单草稿 | 编辑器里的输入 | 用户打字 | **不要**（打字本身已经在重绘） |

我一开始用同一种方式管它们——一个 `ChangeNotifier`，全部塞进去。

结果是：**每次用户打一个键，整个 App 的所有依赖组件都重建了。**

而最讽刺的是，这三个状态里**最不该全局化的恰恰是表单草稿**——它天然属于某一个页面。

这篇讲 `app/session.dart` 那两百行里的状态划分，以及一个 Riverpod 特有的东西：**依赖选择器（select）**，它解决的是"我要监听这个对象的一部分，而不是整个对象"。

![成为全栈·Flutter App 篇·Riverpod 状态边界：会话、服务端数据和表单草稿](https://i-blog.csdnimg.cn/direct/5538b49b22af48c29d6592652105a76d.png)

## 会话：唯一真正全局的状态

先看唯一名副其实的全局状态：

```dart
/// 会话是账号边界：切换账号提升 epoch 并清除私有缓存，草稿仍按账号隔离。
class AppSession extends ChangeNotifier {
  AppSession(this.api, this.preferences, {DataCache? cache}) {
    repository = ReaderRepository(
      api,
      cache: cache,
    ); // Install mutation and identity hooks before the first request.
    mode = ThemeMode.values[preferences.getInt('themeMode')?.clamp(0, 2) ?? 0];
    api.onExpired = () {
      user = null;
      PaintingBinding.instance.imageCache.clear();
      notifyListeners();
    };
  }
  final ApiClient api;
  late final ReaderRepository repository;
  final SharedPreferences preferences;
  ApiUser? user;
  bool restoring = true;
  String? restoreError;
  ThemeMode mode = ThemeMode.system;
  int get epoch => api.epoch;
```

它是 `ChangeNotifier` 而不是 Riverpod 的 `Notifier`。**这个选择是对的**，理由有两个：

**一、它在 Riverpod 之前就要存在。** 看那个 Provider 声明：

```dart
final sessionProvider = ChangeNotifierProvider<AppSession>(
  (ref) => throw UnimplementedError('Bootstrap must override session'),
);
final repositoryProvider = Provider(
  (ref) => ref.read(sessionProvider).repository,
);
```

**默认实现是抛异常的 `UnimplementedError`，必须在启动时覆盖。** 因为 `AppSession` 需要 `ApiClient` 和 `SharedPreferences`，而这些要等 `WidgetsFlutterBinding` 初始化完才能拿。

所以这是个"在 main 里创建、然后 overrideProvider"的模式：

```dart
final prefs = await SharedPreferences.getInstance();
final api = ApiClient(baseUrl: baseUrl, vault: SecureTokenVault());
api.install(await api.vault.read() != null ? ... : {});
runApp(ProviderScope(
  overrides: [
    sessionProvider.overrideWith((ref) => AppSession(api, prefs)),
  ],
  child: const ReaderApp(),
));
```

**用抛异常当"必须被覆盖"的标记**，比写一个空的假实现更好——因为忘了覆盖的话，**它会在第一次被读的时候立刻炸，而不是给你一个行为诡异的空状态。**

**二、它不是 Riverpod 的数据，是被 Riverpod 消费的对象。** M4-05 讲过，路由的 `redirect` 拿到的就是 `session.user`。而 `redirect` 不在 Widget 树里，**它没法用 `ConsumerWidget`**。

用 `ChangeNotifier` 的话，`_redirect(session, state)` 直接拿实例就行——**因为 `redirect` 是构造函数里注入的闭包**：

```dart
GoRouter createRouter(AppSession session) => GoRouter(
  ...
  redirect: (context, state) => _redirect(session, state),
```

**这是个务实的选择：状态本身用最基础的形式，只有需要复用和依赖注入的部分才上 Riverpod。**

而 `mode`（主题）也放在 session 里，看着有点怪——但它是 `SharedPreferences` 里存的，属于"应用级设置"，和会话一起管理省事。

`ThemeMode.values[...?.clamp(0, 2) ?? 0]` 那行还有个实际作用：**`clamp` 防越界**。如果 `preferences` 里存了 5（不存在的值），`ThemeMode.values[5]` 会抛异常。加了 clamp 就安全了。

## select：只监听你要的那一部分

现在讲这一篇最重要的东西。

未读数那个 Provider：

```dart
final unreadCountProvider = FutureProvider<int>((ref) async {
  final identity = ref.watch(
    sessionProvider.select((s) => (s.user?.id, s.epoch)),
  );
  if (identity.$1 == null) return 0;
  final data = await ref
      .read(sessionProvider)
      .repository
      .read(Endpoints.unreadCount);
  return (data['count'] as num?)?.toInt() ?? 0;
});
```

注意 `ref.watch(sessionProvider.select(...))` 这一行。

**如果写成 `ref.watch(sessionProvider)` 会怎样？** 那么未读数这个 Provider 会依赖**整个 session 对象**——只要 session 触发 `notifyListeners()`（无论改的是 `user`、`restoring` 还是 `mode`），未读数就重新请求一次。

而 session 的 `notifyListeners()` 在这些时机都会调：

```dart
api.onExpired = () {
  user = null;
  PaintingBinding.instance.imageCache.clear();
  notifyListeners();          // ← 令牌过期
};

Future<void> authenticate(...) async {
  ...
  notifyListeners();          // ← 登录/登出
};

Future<void> setMode(ThemeMode value) async {
  ...
  notifyListeners();          // ← 切换深浅色
}
```

**用户切换深浅色主题，未读数会重新请求一次。** 因为 `mode` 变了，整个 session 变了。

而 `select` 把依赖缩小到：

```dart
(s.user?.id, s.epoch)
```

**一个记录（record），包含用户 id 和会话代次。** 只有这两个变了，这个 Provider 才重算。

现在切换主题时，`user?.id` 没变、`epoch` 没变 → record 相等 → **不重算**。

而"为什么要包含 `epoch` 而不是只要 `user?.id`"？因为 M4-09 讲过：**同一个用户重新登录，userId 相同但 epoch 不同。** 那时私有数据要全部重来，未读数当然也要重新取。

而 `select` 返回的是一个 record（Dart 3 的记录类型），**record 的相等性是逐字段比较的**。所以 `(5, 3)` 和 `(5, 3)` 相等，`(5, 3)` 和 `(5, 4)` 不等。

**这比返回 `s.user` 好在哪？** 如果 select 返回的是整个 `user` 对象，那用户资料更新（比如改了昵称）也会触发重算——而昵称和未读数毫无关系。

**这就是 select 的本质：它定义的是"我关心这个对象的哪部分"。**

## read 和 watch 的区别

同一个 Provider 里还出现了 `ref.read`：

```dart
final identity = ref.watch(
  sessionProvider.select((s) => (s.user?.id, s.epoch)),
);
...
final data = await ref
    .read(sessionProvider)          // ← 这里用 read
    .repository
    .read(Endpoints.unreadCount);
```

**为什么一个是 watch 一个是 read？**

| | 语义 | 用途 |
|---|---|---|
| `ref.watch` | **订阅**：变了会重建 | 建立依赖 |
| `ref.read` | **取一次**：变了不管 | 用值 |

第一行需要 watch，因为"用户是谁"是**这个 Provider 的输入**——它变了，未读数就该重算。

第二行用 read，因为**它只是去拿 repository 这个对象来发请求**，而 repository 本身不会变（它绑定在 session 构造时）。

**如果第二行也用 watch 会怎样？** 那么主题切换也会重建这个 Provider——虽然重建后拿到的 repository 是同一个，但**那个 await 出去的请求会重新发一次**。

`FutureProvider` 的 `watch` 触发重建时，会**丢弃旧 Future 并重新执行 build 函数**。所以多余的 watch 会变成多余的请求。

**这个"多 watch 一次 = 多发一个请求"的等价关系是 Riverpod 里最值得注意的一点**，因为它不像 Flutter 框架那样只是多一次 rebuild——**它有网络副作用。**

## 表单草稿：不该进全局

现在说第三类状态：表单草稿。

M4-19 和 M4-20 讲过编辑器的那些字段：

```dart
String status = 'draft', cover = '', updatedAt = '';
final input = TextEditingController();
```

**它们全部是编辑器那个 StatefulWidget 的字段，不进任何 Provider。**

理由很直接：**草稿只有一个消费者**——就是这个编辑器页面。放进全局意味着"任何人在任何地方触发某个状态变化，都可能让编辑器重建"，而重建一个带 `TextEditingController` 的 Widget 是有代价的（可能丢光标位置、丢选区）。

M4-20 讲过一个相关的坑：**在 `build` 里创建 controller 会导致每次重建都换一个新的**，用户输入的内容随之消失。

而 `TextEditingController` 本身**就是 Flutter 框架给出的"局部状态"方案**——它管理光标、选区、输入法连接，这些都不该进入全局状态管理。

**判断标准我用的是这个：这块状态有几个消费者？**

| 消费者数量 | 该放哪 |
|---|---|
| 多个页面 | 全局 Provider |
| 多个组件（同一页面内） | Provider（页面级） |
| 只在一个组件里 | 组件的 State 字段 |
| 只有框架关心（光标、焦点） | 框架的 controller |

**表单草稿属于最后一档。** 而它的持久化（本机草稿）又是另一回事——**那是存到磁盘的，不在状态管理里**。

这个区分听起来基础，但它解释了一类常见做法：**很多项目把表单字段全放进全局 store，然后被"其他页面改了什么"莫名其妙地清空。** 因为全局状态变化会触发重建，而重建时如果 controller 处理不当就会丢内容。

![状态所有权](https://i-blog.csdnimg.cn/direct/e74c4bc80645464e9ee23eb8d01c24aa.png)

## 服务端数据：用 Provider，不用 Notifier

第三类：服务端数据。它的特点是**有生命周期、有缓存、会失效**。

看两个例子：

```dart
final unreadCountProvider = FutureProvider<int>((ref) async { ... });

final reactionRevisionProvider = StreamProvider<int>(
  (ref) => ref.read(repositoryProvider).reactionEvents,
);
```

**一个是 `FutureProvider`（取一次），一个是 `StreamProvider`（订阅流）。**

`reactionRevisionProvider` 订阅的是 M4-16 讲的 `reactionStore.events`——点赞事件流。它的作用是：**任何页面点赞了，所有显示点赞状态的界面都要重建。**

而这解决的正是 M4-16 提到的那个问题："详情页和列表页同时显示一篇文，两处数字要一致"。

**注意这里的分工**：

| 机制 | 负责 |
|---|---|
| `DataCache`（M4-23） | 数据正确性：缓存、失效、写后更新 |
| `reactionRevisionProvider` | **界面刷新**：告诉 Widget "该重建了" |

**Riverpod 不管数据，它只管"什么时候该重画"。** 这是我在这个项目里对状态管理最重要的理解。

之前有个困惑：既然有缓存层，为什么还要 Provider？

答案是**关注点分离**。缓存层保证"你读到的是对的"，Provider 保证"变化时你会重画"。两者都不能省：

- 只有缓存没 Provider → 数据对了但界面不更新
- 只有 Provider 没缓存 → 界面更新了但每次都请求，且多个页面数据不一致

而 `StreamProvider` 订阅事件流这个设计还有个好处：**它是"推送"而不是"轮询"。** M4-16 那个 `events.add(id)` 发出之后，只有真正在听的 Widget 才会重建——**而不是让所有页面都定期检查一次。**

## 为什么 repositoryProvider 是 Provider 而不是 FutureProvider

```dart
final repositoryProvider = Provider(
  (ref) => ref.read(sessionProvider).repository,
);
```

`Provider` 是最简单的形式：同步、无缓存、依赖变化就重建。

而它返回的是 `session.repository`——**一个在 session 构造时就创建好的对象**（`late final`）。

**所以这个 Provider 的"重建"实际上只是把同一个对象再返回一次。** 它存在的意义是**提供一个获取 repository 的统一入口**，而不是管理它的生命周期。

而它必须在 session 之后创建（因为要读 session），所以用了 `ref.read` 而不是 `ref.watch`——**如果用 watch，session 一变（比如主题切换）repositoryProvider 就重建，虽然返回同一个对象，但所有依赖它的 Provider 都会重算**。

**这就是"用 read 还是 watch"的分量**：一个词的差别，一堆多余的请求。

## 四个 Provider 的对照

把这个 App 里所有的顶层 Provider 列一下：

| Provider | 类型 | 依赖 | 作用 |
|---|---|---|---|
| `sessionProvider` | `ChangeNotifierProvider` | 无（启动时注入） | 全局会话 |
| `repositoryProvider` | `Provider` | session（read） | 数据访问入口 |
| `unreadCountProvider` | `FutureProvider` | session（**select**） | 角标数字 |
| `reactionRevisionProvider` | `StreamProvider` | repository（read） | 互动事件通知 |

**四种类型对应四种生命周期**，这个对应关系是 Riverpod 最好用的部分：

| 需求 | 用什么 |
|---|---|
| 一个长期存在的可变对象 | `ChangeNotifierProvider` |
| 一个不需要通知的对象 | `Provider` |
| 一个异步取一次的数据 | `FutureProvider` |
| 一个持续推送的流 | `StreamProvider` |
| 组件自己的状态 | 不用 Provider，用 `State` |
| 框架级的状态（光标、焦点） | 不用 Provider，用 `Controller` |

**这张表的价值在于它是"选择"而不是"所有都用 FutureProvider"。** 我见过太多项目只有一个 Provider 类型，所有东西都塞进去，然后靠各种 `select` 和 `autoDispose` 勉强维持。

![依赖订阅](https://i-blog.csdnimg.cn/direct/43a0060e4e6a4ebfafc2d70f431113b3.png)

## 一条我一开始想省掉的事

`select` 那部分，第一版我是这么写的：

```dart
// 错误示范
final user = ref.watch(sessionProvider);
if (user.user == null) return 0;
```

我当时没觉得有问题——因为**手动测试的时候几乎察觉不到**。

手动测试的路径是：打开 App → 看未读数 → 切换主题 → 再看未读数。数字**显示上是正确的**，因为请求发出了、结果也拿到了，只是多发了一次。

**这类 bug 特别难发现，因为它不改变任何可见结果，只增加看不见的网络请求。**

我是在看服务端日志时发现的：**一个只刷未读数的动作，产生了三四次相同请求。**

而它的严重性在于累积：**用户频繁切换主题（或者 App 内部有别的地方频繁 notifyListeners），未读数接口的调用量就会成倍增长。** 在生产环境这可能触发限流。

**修复只改了三个字**：`watch(sessionProvider)` → `watch(sessionProvider.select(...))`。

而且这类问题**只能靠代码审查发现**——功能测试全绿，因为功能是对的。

顺带说，这和 M4-18 讲的那个"通知未读数要极短缓存"是同一个功能的两个部分：缓存保证"多次读取用一次请求"，select 保证"不该读的时候根本不读"。**两个都要有。**

## 小结

这一篇的核心结论是：**状态管理的第一步不是选库，是给状态分类。**

三类状态，三种脾气：

- **会话**是全局的、稀少的、需要通知的 → `ChangeNotifierProvider`
- **服务端数据**是有缓存的、需要精确刷新点的 → `Provider` / `FutureProvider` / `StreamProvider`
- **表单草稿**是局部的、频繁变的、不该外传的 → 组件 State + `Controller`

而 Riverpod 提供的工具（`watch` / `read` / `select`）恰好对应三种关系：**依赖它、只用一次、只依赖它的某部分。**

其中 `select` 最反直觉，也最有用。**它把"我关心什么"这件事从隐式变成了显式**，而这件事在别的状态管理库里往往没有对应物。

第二个核心结论来自那个"多 watch 一次就多发一个请求"的等价关系：

**在 Riverpod 里，watch 不是"读一下"，它是"订阅"。订阅一个不相关的东西，等于让一个无关的东西触发你的网络请求。**

而这个错误**不改变任何可见结果**，所以测试抓不到、用户看不到、只有日志能告诉你。

下一篇讲 Design Token 怎么落地——把一份高保真原型变成一套 Flutter 组件，最大的难点是"零色值"这条纪律怎么在实践中守住。

## 延伸阅读

- [go_router 与四 Tab App Shell：保留导航状态、深链和登录回跳]({{https://blog.csdn.net/FungLeo/article/details/167473845}})
- [服务端状态、会话状态、界面状态：不要都塞进 Zustand](https://blog.csdn.net/fungleo/article/details/165722061)
- [React 请求层封装：统一信封、业务错误与并发 401](https://blog.csdn.net/fungleo/article/details/165590548)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`Riverpod`、`状态管理`、`移动开发`、`数据缓存`、`全栈开发`

### 文章简介（250 字以内）

Riverpod 是状态与依赖管理工具，不会替应用自动划分状态边界。本文结合 Flutter 工程区分会话、服务端数据、页面表单和本机稿件恢复副本，讨论各自的所有者、生命周期、账号隔离和测试方式，避免一次全局重置误清公开数据或留下私有状态。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

状态应该由谁拥有

### 配图 AI 提示词

1. `M4-06-封面`：16:9 中文架构封面，Riverpod 状态分为会话、服务端内容、页面表单、本机稿件四个边界，使用不同生命周期色带，标题“状态应该由谁拥有”，简洁深蓝风格。
2. `M4-06-状态所有权`：16:9 四泳道状态所有权图，标出退出登录、TTL过期、页面离开、投稿保存成功等清理事件，中文精准。
3. `M4-06-依赖订阅`：16:9 中文关系图，画出 session / repository / unreadCount / reactionRevision 四个 Provider 的依赖与订阅关系，标出 watch、read、select 三种连接方式，深蓝底、亮蓝连线。

### 发布前核对

- [ ] 替换 3 处配图占位符（封面、内图 1 已完成）
- [ ] M4-03、M4-09、M2-05 发布后回填站内链接
- [ ] 示例 Provider 与当前实际声明核对
- [ ] 已删除本辅助区
