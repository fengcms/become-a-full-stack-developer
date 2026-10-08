# 成为全栈·Flutter App 篇·go_router 与四 Tab App Shell：保留导航状态、深链和登录回跳

做导航的时候，我被一个场景卡住了。

用户点了"我的"Tab，然后进会员中心，看到"你还没有登录"，跳到登录页。登录成功，回到会员中心。

这一串做对不难。难的是**它的变体**：

- 用户在会员中心直接杀 App，重开，**应该回到会员中心而不是首页**。
- 用户没登录时从分享链接打开 `/member/settings/avatar`（一个深层页面），**应该先登录再回到那一页**。
- 用户已经登录，从会员中心退出登录，**不应该还停在那页**。

这三个场景逼出了两样东西：**"我在哪个 Tab"是状态，而不只是 UI**；**"登录完成后该去哪"必须被显式记住**。

这篇讲 `app/router.dart` 那两百行，以及它背后那个没那么显眼但很关键的设计——四个 Tab 用的是 `StatefulShellRoute` 而不是普通的 `ShellRoute`。

{{IMG:M4-05-封面}}

## 为什么不是 push 和 pop

先说一个基础选择。底部四个 Tab 之间切换，用哪种方式？

**错误做法一：每个 Tab 一个页面，`onTap` 里 `Navigator.push`。**

结果：用户从"发现"点到"我的"，再点返回，回到"发现"——**但"我的"Tab 的滚动位置没了**。因为它是被 push 上去的，返回时整个页面被销毁（或者被保留但栈很深）。

**错误做法二：把所有页面塞进一个栈，切换时 `popUntil` 回根。**

结果：Tab 之间跳来跳去，栈被反复重置，而且**"我的"这个 Tab 会显示"发现"的内容**。

## StatefulShellRoute：为每个分支保留栈

正确的做法是让每个 Tab 拥有**自己的导航栈**，彼此独立：

```dart
StatefulShellRoute.indexedStack(
  builder: (c, s, shell) => Scaffold(
    body: shell,
    bottomNavigationBar: ...,
  ),
  branches: _shellBranches(),
)
```

而分支的声明：

```dart
List<StatefulShellBranch> _shellBranches() => [
  StatefulShellBranch(
    routes: [GoRoute(path: '/', builder: (c, s) => const HomePage())],
  ),
  StatefulShellBranch(
    routes: [
      GoRoute(path: '/categories', builder: (c, s) => const CategoriesPage()),
      GoRoute(path: '/tags', builder: (c, s) => const TagsPage()),
      GoRoute(
        path: '/browse',
        builder: (c, s) => BrowsePage(...),
      ),
    ],
  ),
  ...
];
```

**关键在 `StatefulShellBranch` 和它那个 `routes` 列表。**

它做两件事：

1. **每个分支维护独立的 `Navigator`** —— 切到别的 Tab 再切回来，这个 Tab 的页面栈还在
2. **默认用 `indexedStack` 保留所有分支的 Widget** —— 切 Tab 不销毁页面，所以滚动位置、已加载的数据都还在

第二点尤其重要。**如果不保留，"我的"Tab 每次切过去都要重新请求数据**——而 M4-10 讲过，会员中心那个概览是要发四个请求的。

而第二个分支里放了三条路由（`/categories`、`/tags`、`/browse`），这体现了**一个 Tab 可以有多个页面**。用户在分类页点进某个分类，是"发现"Tab 内部的导航，不是跳到另一个 Tab——底部高亮仍然在"发现"。

**这个层级关系是靠分支的嵌套表达的，不是靠路径前缀的字符串推断。**

## 三个 Tab 的路由归属

看完整的分支声明，会发现几个有意思的安排：

| Tab | 分支内路由 |
|---|---|
| 首页 | `/` |
| 发现 | `/categories`、`/tags`、`/browse` |
| **文章详情** | `/articles/:id` ← 独立分支，不带底栏 |
| 我的 | `/member` |
| （Tab 外） | `/member/settings`、`/login`、`/search` 等 |

**文章详情自己占一个分支，而它的界面里没有底部 Tab 栏。**

这是有意的：读文章的时候不该有底栏（它占空间，而且用户全神贯注在读）。但它在路由层面属于一个分支，这样从详情页切到详情页（比如"下一篇"）不会触发底栏的切换动画。

而 `/member/settings` 在**分支外**——它在 `/member` 之上，是会员中心推入的二级页面。

这个层级不是随便定的，判据是：**页面显示底栏吗？**

- 显示 → 必须在某个分支里
- 不显示但属于某个 Tab 的子流程 → 放在那个分支里，用 `--tab` 参数控制
- 完全独立（登录、搜索）→ 放分支外

这个判据的好处是**不依赖路径字符串**。否则你得维护一张"哪些路径有底栏"的表，而每加一个页面就要更新它——**忘一次就是底栏错乱**。

## 登录回跳：把"从哪来"编码进 URL

现在讲开头那个场景。看重定向的实现：

```dart
String? _redirect(AppSession session, GoRouterState state) {
  final private =
      state.uri.path.startsWith('/member/') &&
      state.uri.path != '/member/settings';
  if (private && session.user == null) {
    if (session.restoring) {
      return '/restoring?from=${Uri.encodeComponent(state.uri.toString())}';
    }
    return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
  }
  if (state.uri.path == '/restoring' && !session.restoring) {
    return state.uri.queryParameters['from'] ?? '/member';
  }
  return null;
}
```

这段代码解决四个问题。

**一、哪些页面需要登录？**

```dart
final private =
    state.uri.path.startsWith('/member/') &&
    state.uri.path != '/member/settings';
```

注意那个 `!= '/member/settings'`——**设置页不要求登录**。因为新用户第一次进来应该能改主题、看关于页，而不必先注册。

而 `/member`（会员中心本身）是**不要求**登录的——M4-18 讲过，未登录用户应该能看到登录引导。这才是符合前面 `startsWith('/member/')` 带斜杠的写法。

**`startsWith('/member/')` 和 `startsWith('/member')` 的区别就是这一点**：前者只匹配子页面，不匹配 `/member` 本身。

**二、`from` 参数怎么带？**

```dart
'/login?from=${Uri.encodeComponent(state.uri.toString())}'
```

**为什么要 `encodeComponent`？** 因为 `state.uri.toString()` 可能包含查询参数（比如 `/browse?category=flutter&page=2`），而 `&` 和 `?` 在 URL 里有特殊含义。**不转义的话，回跳的 URL 会被截断。**

这是 M4-11 讲分类导航时同一个问题的另一个例子——**用户可编辑的内容（这里是 URL 本身）进入 URL 时必须转义**。

**三、`restoring` 这个中间状态。**

```dart
if (session.restoring) {
  return '/restoring?from=${Uri.encodeComponent(state.uri.toString())}';
}
```

这是整段代码最微妙的一处。考虑这个场景：

**App 冷启动，用户直接点分享链接打开 `/member/settings/avatar`。**

此时 App 刚启动，会话还在**恢复中**——令牌在安全存储里，但还没验证是否有效（`session.restore()` 还没跑完）。

如果这时候按"未登录"处理，跳登录页——**但用户其实有有效令牌，几百毫秒后就会登录成功**。用户被无谓地踢去登录页。

所以需要一个"还不知道"的中间状态：

```dart
/// 会话是账号边界：切换账号提升 epoch 并清除私有缓存，草稿仍按账号隔离。
class AppSession extends ChangeNotifier {
  ...
  bool restoring = true;
```

而重定向的第二条就是处理这个中间页：

```dart
if (state.uri.path == '/restoring' && !session.restoring) {
  return state.uri.queryParameters['from'] ?? '/member';
}
```

**恢复完成后，`/restoring` 页面自己把用户送到目的地。** 整个过程用户看到的是一个短暂的加载页，而不是"被踢去登录"再跳回来。

**这个"不知道"的三态（未登录 / 恢复中 / 已登录）很多 App 都会漏掉**，而它的表现形式非常迷惑：用户明明登录着，却被要求登录。

**四、退出登录时怎么办？**

`redirect` 只在 `session.user == null` 时跳登录。而退出登录时 `user` 变成 null，**如果用户当时在 `/member/settings`，那是个设置页不需要登录，所以不会跳。** 用户会停在一个"我已经退出登录"但界面可能还显示着旧数据的页面。

这个处理在 `AppSession.authenticate` 里：

```dart
Future<void> authenticate(Map<String, dynamic> data, {bool register = false}) async {
  await api.clear();
  user = null;
  PaintingBinding.instance.imageCache.clear();
  notifyListeners();
  ...
```

`notifyListeners()` 之后，所有依赖 `sessionProvider` 的 Widget 会重建。但**当前路由不会自动跳走**——所以登出后需要显式导航。

而 `PaintingBinding.instance.imageCache.clear()` 这一行值得说：**它清的是 Flutter 内置的图片缓存。**

M4-24 讲了我们自己的 `ImageStore`，但 Flutter 框架自己也会缓存解码后的图片（比如 `Image.network` 用的那个）。**用户 A 的头像可能还在框架缓存里**，所以登出必须显式清掉。

**这是"登出要清理什么"这个清单上的一项，而它不在我们自己的缓存层里。**

## 路由错误页

```dart
Widget _errorBuilder(BuildContext c, GoRouterState s) => PageFrame(
  title: '页面不存在',
  child: StateMessage(
    title: '没有找到这个页面',
    description: '请返回首页继续阅读',
    onRetry: () => c.go('/'),
  ),
);
```

这个错误页看着普通，但有一个考虑：**它是给"用户点了一个不存在的链接"准备的，而链接可能来自站外。**

比如有人分享了一个 `/articles/999999`（文章被删了）。这时不能显示 Flutter 的默认错误页（那是一堆红字，对用户毫无意义）。

而 `onRetry: () => c.go('/')` 用的是 `go` 而不是 `push`——**因为错误页本身已经在栈顶了，push 会让返回键失效**（返回到一个不存在的页面）。

**这一个小细节能避免"用户在错误页上按返回，App 什么都没发生"。**

## 深链：路径参数的编码

`/articles/:id` 里的 `:id` 是路径参数。而 M4-14 讲过，`Article.route` 可能是 id 也可能是 slug：

```dart
String get route => data.slug?.isNotEmpty == true ? data.slug! : id.toString();
```

所以路由要接受两种形式：

```dart
GoRoute(
  path: '/articles/:idOrSlug',
  builder: (c, s) => ArticlePage(idOrSlug: s.pathParameters['idOrSlug']!),
)
```

而**需要登录的深层页面（改头像、通知列表）要额外带路径参数**：

```dart
GoRoute(
  path: '/member/settings/avatar',
  builder: (c, s) => AccountBoundary(
    ...
```

M4-07 讲的那张缓存策略表里，`family()` 判断路径用的是 `endsWith` 和 `startsWith`：

```dart
if (path.startsWith(Endpoints.privatePrefix)) return ResourceFamily.member;
```

**所以路径参数的命名（`:idOrSlug`）和缓存判定（`startsWith`）是两套机制，它们之间靠的是"约定"而不是"机制"。**

这个约定的脆弱之处在于：如果有人把路由从 `/member/settings/avatar` 改成 `/member/avatar`，缓存分类还是对的（都是 member），但如果改成 `/profile/avatar`，**它就不再被识别为私有路径**，缓存键会变成 `public`。

**这类问题只有测试能发现**——因为单个路径的判断都是对的，只有组合起来才会错。

## 一条我一开始想省掉的事

`restoring` 那个中间状态，第一版我没做。

那时候的判断是"登录态检查很快，等一下就行"——于是未登录就跳登录页。

用户反馈的场景很具体：**"我明明登录着，从别人分享的链接点进 App，它说让我登录。"**

而根因不是"检查慢"，是**"在检查完成之前就做了决定"**。三个状态被当成了两个（登录 / 未登录），中间那个"还不知道"被错误地归到了"未登录"。

修复之后我意识到，这个模式在别的地方也存在：

| 场景 | 三态 |
|---|---|
| 会话 | 未登录 / **恢复中** / 已登录 |
| 缓存 | 无 / **stale** / fresh |
| 加载 | 无数据 / **有旧数据** / 全新加载 |

**三态里的中间态最容易被漏掉，因为它看起来像"正在进行"，而代码通常只为"已完成"设计分支。**

而中间态是最需要显式处理的——**因为用户在这个状态下看到的东西，可能是错的。**

## 小结

导航看起来是最不需要设计的一层，因为它"就是几个按钮"。但真正做下来，它要解决四个问题：

1. **Tab 之间要保留状态** —— `StatefulShellRoute` 给每个分支独立的导航栈和 Widget 树。
2. **哪些页面需要登录** —— 用路径判定，但要处理好"设置页不需要登录"这类例外。
3. **登录完成回哪** —— `from` 参数 + `encodeComponent` + `restoring` 中间态。
4. **登出要清什么** —— 包括 Flutter 框架自己的图片缓存，不只是我们那层。

其中第 3 条的 `restoring` 是最值得记住的：**"还不知道"是一个独立状态，它不能被归入"没有"。**

这和 M4-23 讲的 stale 缓存是同一个模式——**中间态需要显式的 UI 和决策，因为它是最容易被误判的那个。**

下一篇讲 Riverpod 的状态边界——会话、服务端数据、表单草稿这三种状态的生命周期完全不同，用同一种方式管理必然出问题。

## 延伸阅读

- [Riverpod 状态边界：会话、服务端数据和表单草稿]({{LINK:M4-06}})
- [用真实 API 构建首页：焦点、最新与热门内容]({{LINK:M4-10}})
- [会员中心：资料、密码、通知与私有数据缓存]({{LINK:M4-18}})
- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`go_router`、`路由设计`、`深链接`、`移动开发`、`全栈开发`

### 文章简介（250 字以内）

四 Tab Flutter 应用需要管理多条独立返回栈，还要支持文章深链接、私有页面登录守卫和登录后回跳。本文结合项目 go_router 结构说明 App Shell 的职责、路由参数边界和平台深链验收范围，并强调客户端路由守卫不能替代后端权限判断。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

Tab、路由与登录回跳

### 配图 AI 提示词

1. `M4-05-封面`：16:9 中文移动端架构图，四个底部 Tab 各自拥有独立页面栈，文章深链进入详情，私有编辑页经登录后回跳，深蓝底、亮蓝路径箭头、简体中文准确。
2. `M4-05-导航栈`：16:9 四列导航栈示意，首页、分类、搜索、我的分别保留堆栈；标出底部切换不 push、登录 redirect 回到原页面。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、06、09 发布后回填站内链接
- [ ] 与 router.dart 当前实际路由路径核对代码
- [ ] 已删除本辅助区
