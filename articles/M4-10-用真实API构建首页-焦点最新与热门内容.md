# 成为全栈·Flutter App 篇·用真实 API 构建首页：焦点、最新与热门内容

前面几篇都在搭数据层。这一篇接上界面，我要做一个此前一直回避的事：**让首页真的连上接口跑一遍。**

原型阶段首页是三块硬编码数据：三个焦点图、五条最新、五条热门，切到真接口时才意识到问题的规模——

**这三个区块要发三个请求，而它们在用户眼里是"一个页面"。**

如果这三个请求绑在一起，那么热门那个失败了，整个首页就转圈；焦点那个慢一点，最新文章也得等着。更糟的是下拉刷新时，三个请求的结果什么时候到是不确定的，页面会先闪一下旧内容再跳。

这篇讲 `home_page.dart`（49 行）怎么把这三块拆开，以及一个我一开始完全没想到的中间层——`AsyncPane`。

{{IMG:M4-10-封面}}

## 先看首页有多小

```dart
/// 组合焦点、最新与推荐阅读，各模块使用同一仓库的资源缓存。
class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => PageFrame(
    title: '成为全栈',
    titleWidget: _BrandTitle(),
    actions: [
      IconButton(
        tooltip: '搜索',
        onPressed: () => context.go('/search'),
        icon: const PrototypeIcon('search'),
      ),
      IconButton(
        tooltip: '通知',
        onPressed: () => context.push('/member/notifications'),
        icon: const UnreadIcon(Icons.notifications_none),
      ),
    ],
    child: ArticleFeed(
      query: const {'pageSize': 4},
      header: _HomeLatest(),
      interlude: _HomePopular(),
    ),
  );
}
```

四十九行，一个页面。首页的主列表**不是自己实现的**，而是 M4-12 那个 `ArticleFeed`：

```dart
child: ArticleFeed(
  query: const {'pageSize': 4},
  header: _HomeLatest(),      // ← 插在列表最上面
  interlude: _HomePopular(),   // ← 插在第 4 条之后
),
```

`header` 和 `interlude` 是 `ArticleFeed` 提供的两个插槽。这个设计我想单独说，因为它解决的是**首页和列表页的复用矛盾**。

一般做法是给 `ArticleFeed` 加一个 `mode: home | list` 的开关，里面 `if (mode == home)` 判一堆情况。问题是这样一来，`ArticleFeed` 就得知道首页有哪些区块、插在第几位、要不要下拉刷新——它从"通用列表"变成了"首页和列表的混合体"。

**插槽的思路是把决策权交回去**：`ArticleFeed` 只负责"在第 4 条后面插一个东西"，插的是什么、要不要插、插几个，全由调用方决定。这样它既能被首页复用，也能被搜索结果、标签列表原样复用。

## 三个区块，三个独立的数据源

现在看三个区块各自加载什么：

```dart
// 焦点图
AsyncPane<PageResult<Article>>(
  load: () => ref.read(repositoryProvider)
      .articles(query: {'sort': '-publishedAt', 'pageSize': 3}),
  builder: (p, _) => p.items.isEmpty ? const SizedBox() : FocusStories(p.items),
)

// 热门阅读
AsyncPane<PageResult<Article>>(
  load: () => ref.read(repositoryProvider)
      .articles(query: {'sort': '-viewCount', 'pageSize': 5}),
  builder: (p, _) => Column(
    children: [
      for (var i = 0; i < p.items.length; i++)
        _PopularArticle(article: p.items[i], rank: i + 1),
    ],
  ),
)
```

三个数据源的差异比想象中大，而**这种差异必须体现在策略上，不能藏在代码里等着人猜**：

| 区块 | 排序 | 数量 | 数据变化速度 | 该怎么对待 |
|---|---|---|---|---|
| 焦点图 | 最新发布 | 3 | 慢（一天最多几条） | 缓存久一点没关系 |
| 最新文章 | 最新发布 | 5 | 中 | 正常策略 |
| 热门阅读 | 浏览量降序 | 5 | **快**（榜单一小时能换一次） | 必须更激进地更新 |
| 主列表 | 默认 | 每页 4 | 中 | 可下拉翻页 |

热门这块的"快"是最容易被忽略的。我最初把三个区块用了同一套缓存策略，结果用户抱怨"首页热门推荐老是那几篇"——因为缓存两分钟内不更新，而实际上十分钟就够榜单一轮变化了。

好在 M4-07 那个缓存策略表支持按查询参数覆盖：

```dart
/// 热门列表更新较慢；仅前三页可落盘，后续翻页仍受内存容量约束。
CachePolicy forQuery(String path, Map<String, dynamic> query, CachePolicy p) {
  if (path == Endpoints.articles && query['sort'] == '-viewCount') {
    p = const CachePolicy(Duration(minutes: 5), _day, disk: true);
  }
  if ((query['page'] as int? ?? 1) > 3) p = CachePolicy(p.fresh, p.maxAge);
  return p;
}
```

`sort == '-viewCount'` 这一条就是给热门阅读准备的：**fresh 从默认的 2 分钟放宽到 5 分钟**。名字叫"热门列表更新较慢"其实是反的——**它更新较快，所以允许缓存的时间要短，但比"最新"长**。

顺便说第二行的 `page > 3` 降级：前 3 页可以落盘，第 4 页开始只留内存。这是为了防止用户一路翻到底把磁盘缓存塞满。

{{IMG:M4-10-首页状态}}

## AsyncPane：需要自己造的那一层

三个区块各自独立加载，第一版我写的是这样的：

```dart
// 这是我最初的做法，现在看有三个问题
class _HomeLatest extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final future = ref.read(repositoryProvider)
        .articles(query: {'sort': '-publishedAt', 'pageSize': 3});
    return FutureBuilder(
      future: future,
      builder: (context, snap) {
        if (!snap.hasData) return const CircularProgressIndicator();
        return FocusStories(snap.data!.items);
      },
    );
  }
}
```

问题有三个，而且都不算致命，但加在一起很别扭：

**一、`build` 里发请求。** 每一次 rebuild（哪怕只是别的地方 `setState` 引起的）都会重新创建那个 Future，导致重复请求。这个问题在我加了个动画效果的版本里立刻暴露——它每帧 rebuild 一次。

**二、无法处理缓存失效。** M4-07 建立的整套机制——缓存事件、精确唤醒依赖页面、`forbidden` 判断——`FutureBuilder` 一个都用不上。

**三、失败时没有中间状态。** `snap.hasError` 只能二选一：要么显示错误，要么什么都不显示。**没有"我之前加载成功了，这次刷新失败了，但我仍然想让你看到上次的内容"这个状态。**

第三个问题在实际使用中天天出现：热门接口偶尔 429 或者网络抖动，用户此时看到的应该是"更新失败，当前显示上次内容"，而不是整个热门区变成错误提示。

所以我把这段逻辑抽成了一个通用组件，`shared/widgets/async_pane.dart`。它只有一百多行，但设计上比 `FutureBuilder` 多做了几件事。

## 关键设计一：保留旧值，不闪回加载态

```dart
/// 保留已展示的数据直到硬过期或无权限，主动刷新时避免整页闪回加载态。
class AsyncPane<T> extends ConsumerStatefulWidget {
  final Future<T> Function() load;
  final Widget Function(T value, Future<void> Function() reload) builder;
  final Object? loadKey;
}
```

注意它的 `value` 是**可空但不清空**的。`build` 的判断顺序是：

```dart
@override
Widget build(BuildContext context) {
  if (value == null) {
    return error != null
        ? StateMessage(error: error, onRetry: () => load(force: true))
        : const ArticleSkeleton(count: 2);       // 首次加载：骨架屏
  }
  final body = widget.builder(value as T, () => load(force: true));
  if (error == null) return body;                 // 正常：直接渲染
  return LayoutBuilder(                          // 有旧值 + 有错：上下组合
    builder: (context, constraints) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: AppInsets.small,
          child: Text('更新失败，当前显示上次内容', style: context.text.bodySmall),
        ),
        if (constraints.hasBoundedHeight) Expanded(child: body) else body,
      ],
    ),
  );
}
```

三个分支对应三种情况，这里最值得说的是第三个：**有旧值又有错误时，不是二选一，而是把两者组合起来**——上面一条提示，下面照常显示旧内容。

而 `value` 什么时候才会被真正清空？看 `showLoadError`：

```dart
// 权限失效和硬过期清空旧值，普通后台错误保留可用内容。
void showLoadError(Object e, ReaderRepository repo, Set<String> nextKeys) {
  error = e;
  if (repo.forbidden(e) || nextKeys.any((k) => !repo.cache.usable(k))) {
    value = null;
  }
}
```

**和 M4-12 那条"失败清不清取决于重试会不会变"是同一个原则。** 超时、网络抖动、429 这些 → 保留旧内容；401/403/404（`forbidden`）→ 清空，因为那意味着这条数据用户根本无权看，继续显示旧内容是欺骗。

那个 `constraints.hasBoundedHeight` 判断也不是多余的：`AsyncPane` 有时放在固定高度的容器里，有时是自适应高度。前者需要 `Expanded` 才能在有限高度里分配空间，后者加了 `Expanded` 会崩（无界约束下 `Expanded` 不允许）。

{{IMG:M4-10-并发隔离}}

## 关键设计二：serial 隔离 + 被取代后自动重试

M4-12 里那个 `serial` 票据，在 `AsyncPane` 里同样存在，而且多了一步：

```dart
// 序号隔离重复加载；后发请求胜出，旧结果不覆盖新页面。
Future<void> load({bool force = false}) async {
  if (loading && !force) return;
  final ticket = ++serial;
  bool superseded = false;
  setState(() => loading = true);
  final nextKeys = <String>{};
  final repo = ref.read(repositoryProvider);
  try {
    final result = await repo.track(
      nextKeys,
      () => force ? repo.force(widget.load) : widget.load(),
    );
    if (mounted && ticket == serial) {
      setState(() { value = result; error = null; keys = nextKeys; });
    }
  } catch (e) {
    superseded = e is CacheSuperseded;
    if (mounted && ticket == serial && e is! SessionChanged && e is! CacheSuperseded) {
      setState(() => showLoadError(e, repo, nextKeys));
    }
  } finally {
    if (mounted && ticket == serial) {
      setState(() => loading = false);
      if (superseded && cacheVisible) unawaited(load());   // ← 这一行
    }
  }
}
```

`if (superseded && cacheVisible) unawaited(load())` 是 M4-12 没写到的那部分。

`CacheSuperseded` 的意思是"你这次请求作废了，因为有更新的请求来了"。正常情况下丢弃就行——更新的请求会拿到结果。

但有一种情况是**更新的请求并不存在**：用户已经离开页面很久，缓存策略判断这次读取应该重新去拿，这时候旧的请求被标记作废，而新的那次加载因为页面不可见被跳过了。结果就是**数据永远停在旧值，再也不会更新**。

所以这里要做的是：发现被取代，且页面可见，就重新发起一次加载。`unawaited` 表示不等它的结果——反正界面已经显示着内容了。

## 关键设计三：loadKey 处理身份变化

`AsyncPane` 还有个 `loadKey` 参数，一开始我觉得多余：

```dart
@override
void didUpdateWidget(covariant AsyncPane<T> old) {
  super.didUpdateWidget(old);
  if (old.loadKey != widget.loadKey) {
    value = null;     // ← 清空，重新加载
    load();
  }
}
```

考虑这个场景：用户在文章页点了作者头像，进入该作者的文章列表页；然后返回，再点另一个作者。

`AsyncPane` 本身是被复用的（Go 的 element 树复用），但 `load` 闭包已经换了——它现在应该加载另一个作者的文章。而闭包是函数，**两个不同的闭包比较起来永远不相等**，所以不能靠 `load` 本身判断身份变化。

`loadKey` 就是显式传进来的身份标识。作者 id 变了，`loadKey` 变了，清空旧值重新加载。

**如果不传 `loadKey` 会怎样？** 会显示上一个作者的文章，直到新的加载完成——一个"串台"bug。页面上写着 A 作者的名字，内容是 B 作者的。

这类 bug 的共同特点是：**功能测试全绿，因为测试每次都是新页面**。它只在"复用了同一个 Widget 但参数变了"的情况下出现。

## 首页下拉刷新会发生什么

最后一个场景，也是我一开始最担心的地方。

首页的刷新主体是 `ArticleFeed`，用户下拉时触发的是它。而焦点图和热门阅读在 `header` 和 `interlude` 里——**它们怎么知道要被刷新？**

答案在缓存事件流里。`AsyncPane` 订阅了它：

```dart
changes = ref.read(repositoryProvider).cache.events.listen(onCacheEvent);
```

而用户下拉时，`ArticleFeed` 做的是：

```dart
onRefresh: () async {
  ref.read(repositoryProvider).cache.invalidate(resourceTags);
  await load(reset: true);
},
```

`invalidate` 会发出 `invalidated` 事件。`AsyncPane` 收到后：

```dart
void onCacheEvent(CacheEvent e) {
  if (!mounted || !cacheVisible || (!keys.contains(e.key) && e.key != '*')) {
    return;
  }
  ...
  if (!loading && e.kind != 'patched') unawaited(load());
}
```

注意最上面那个 `keys.contains(e.key)` 判断——**它只响应自己依赖的那些缓存键**。这就是 M4-07 讲过的 `track` 机制在起作用：`repo.track(nextKeys, () => widget.load())` 把这次加载实际读过的键记进了 `keys`。

**如果不做这个过滤会怎样？** 用户在会员中心改了昵称，导致 `overview` 缓存失效，于是首页的热门区也去重新加载了一次——因为它们共用同一个仓库。功能上没错（多发一个请求），但用户会看到不相关的区块莫名闪一下。

还有一层是 `CacheVisibility` 这个 mixin。它让 Widget 在不可见时不响应事件——比如用户已经切到别的 Tab，首页在后台收到失效事件却去刷新，既浪费请求又可能在回来时看到内容跳动。

## 首页这块学到的东西

把三个独立区块拼成一个页面，看上去只是"调三个接口"，实际上要解决四个问题：

1. **生命周期** —— 请求不能在 `build` 里发，需要能取消、能识别作废。
2. **中间状态** —— 有旧值又有错误时，两者要共存而不是二选一。
3. **身份变化** —— Widget 被复用但参数变了时，要能正确重置。
4. **刷新协调** —— 多个区块要响应同一个用户动作，但不能过度响应。

后三条没有任何一个能在写第一版的时候预见到。它们都是"接上真实接口、真的用起来"之后才浮现的。

**这就是为什么原型阶段做不出的东西，原型阶段就做不出来。** 硬编码的假数据永远是"三块内容立刻同时显示"，不会暴露任何一个问题。

下一篇讲分类、标签和搜索——搜索结果的响应形状和首页完全不同，是 M4-07 那个"四种形状"里最特殊的一种。

## 延伸阅读

- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})
- [go_router 与四 Tab App Shell：保留导航状态、深链和登录回跳]({{LINK:M4-05}})
- [内容门户首页：焦点、最新、文章流与侧栏如何组织](https://blog.csdn.net/fungleo/article/details/166784376)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`首页设计`、`API`、`异步状态`、`移动开发`、`全栈开发`

### 文章简介（250 字以内）

Flutter 首页由焦点故事、最新文章和热门内容构成，但不同模块不应被一个 Future 绑成全有全无。本文结合真实 Repository 与缓存策略，讨论局部失败、空态和降级，并说明为什么原型中的演示数字不能冒充线上数据。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

首页模块独立失败也能用

### 配图 AI 提示词

1. `M4-10-封面`：16:9 中文移动首页技术封面，焦点故事、最新文章流、热门列表三个独立数据模块共享清晰页面布局，某一模块故障时其它模块仍展示，真实内容而非假数据。
2. `M4-10-首页状态`：16:9 手机首页线框图，展示每块各自的 loading、empty、error、cached content 状态，中文标签整齐。
3. `M4-10-并发隔离`：16:9 中文时序图，首页三区块并发加载，serial 票据标识最新请求、被取代后自动重试，标出 loadKey 随身份变化，深蓝底亮蓝。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M4-07、M4-12、M3-05 发布后回填站内链接
- [ ] 热门排序描述与 API 字段语义核对
- [ ] 已删除本辅助区
