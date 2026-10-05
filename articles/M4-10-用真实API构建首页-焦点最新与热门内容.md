# 成为全栈·Flutter App 篇·用真实 API 构建首页：焦点、最新与热门内容

首页原型里的焦点图、热门数字和最新列表很容易用静态数据拼出来；接上线上 API 后，真正的问题变成了某块接口失败时，其他内容是否还要等，以及“热门”这个词是否符合后端实际排序。

这篇沿着 Flutter 首页的焦点、最新和热门模块，展示如何拆分请求与状态、保留有用的旧数据，并用真实接口语义替换演示素材。

{{IMG:M4-10-封面}}

## 原型数据只说明视觉，不说明业务事实

原型可用固定数量和缩略图确认布局，但真实首页统计、文章图像和通知都必须来自接口。若把演示图表和数字原样带入应用，页面“看起来完整”，读者却会误以为这些是服务端事实。

## 先把首页拆成独立资源

焦点内容、最新列表和热门内容的来源、加载时间和分页需求不同。它们可以并行开始，但不一定必须整体 `Future.wait` 后才渲染。Repository 分别提供读取入口，页面组合子区域；焦点请求失败时显示局部错误，不必抹掉已加载的最新文章。

```text
首页
├── 焦点故事：加载 / 空 / 错误 / 内容
├── 最新文章流：分页 + 刷新
└── 热门文章：按接口实际排序语义展示
```

“热门”需忠实表达后端指标：若 API 只有累计浏览/互动排序，就不能写成“本周热读”。UI 文案不能弥补不存在的时间窗口数据。

{{IMG:M4-10-首页状态}}

## 局部失败与整体失败要分层

首屏无任何数据时，页面可显示整体加载态；某块已有缓存而后台校验失败时，继续展示旧数据并标记可刷新；某个可选模块失败时，保留其它模块。空结果也不同于错误：空结果可能说明当前确实没有文章，错误意味着我们不知道结果。

项目 Repository 的缓存读取能返回可用旧数据并后台更新。使用缓存后，界面需避免重复追加相同文章；刷新成功才替换列表，刷新失败保留画面。

## 组件组合不是让首页掌握所有网络细节

页面负责布局、模块顺序、局部状态呈现；Repository 负责请求合并、缓存和模型映射；共享 `ArticleFeed` 负责重复的分页、空态和滚动行为。这样焦点模块改变布局，不会意外改变登录刷新逻辑。

```dart
HomeFocusStories(...),
HomeLatest(...),
HomePopular(...),
```

片段表达项目拆分思路。实际首页中还包含顶部品牌区和卡片组件；文章中的代码只展示职责，不应将其当作完整可复制页面。

## 验证应覆盖数据和状态

使用本地隔离后端验证真实数据映射，用 Widget 测试检查焦点缺图、最新为空和热门请求失败时的页面行为。生产 API 的匿名只读可证明当下内容端点可访问，但不要在首页验收中做生产点赞、投稿等写入。

## 首页也需要定义请求预算

焦点、最新和热门虽然可并发加载，但它们争用移动网络与服务端限流额度。首屏重点应优先显示核心内容；可选模块是否延迟加载、刷新是否合并、页面前台恢复时校验哪个资源，都应有策略，而不是每次 build 都再发请求。

缓存 Repository 对重复读取做 in-flight 合并和 TTL 管理。首页状态变化时仅触发需要更新的模块，避免用户切换 Tab 回来又把整个页面清空重载。异步模块应各自有错误出口，但共享页面滚动和布局状态。

## 首页用真实数据还要考虑图像和首屏成本

文章封面不是把原始大图直接丢给所有卡片。列表根据展示尺寸解码图片，缺失和加载失败显示稳定占位；焦点区图片尺寸更大，但不应阻塞最新文章先出现。项目将焦点、最新与热门拆成展示组件，通过共享文章卡片统一标题、摘要和点击行为，异步模块仍能独立呈现。

热门排序的口径必须跟 API 实际字段一致。例如按累计浏览量排列只能称为“热门/浏览较多”，不能包装成“近一周热榜”；除非接口真实提供时间窗口聚合。把产品文案与后端指标对齐，是避免 UI 伪造业务数据的一部分。

## 骨架屏不应该成为数据占位

骨架适合表达布局正在加载，但不能长期覆盖错误或空结果。加载期间若已有缓存内容，继续展示内容并用小型刷新状态提示即可；只有第一次没有可读数据才显示整块骨架。封面缺失使用中性占位，不能随机拼一张不相关图片，否则视觉上像真实文章封面，会误导点击预期。

首页还要检查真实最长标题和摘要。焦点卡标题可能多行，列表卡片要有一致的信息层级；根据接口返回排序，不在客户端再次以浏览量排序而改变后端筛选语义。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/features/discovery/home_page.dart 第 25–49 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：触发主题切换和父级更新，观察首页请求次数是否增加。我会继续追踪它的返回值和副作用，直到页面状态稳定下来。

```dart
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



焦点之外的两个模块也拆成独立组件。下面摘录分别来自 `flutter-app/lib/features/discovery/home_latest.dart` 与 `flutter-app/lib/features/discovery/home_popular.dart`，可以看到它们各自订阅数据并组合标题、列表，而首页只负责放置模块：

```dart
part of 'home_page.dart';

/// 首页阅读分区通过同一仓库加载，保留缓存与入口顺序。
class _HomeLatest extends ConsumerWidget {
  const _HomeLatest();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    children: [
      AsyncPane<PageResult<Article>>(
        load: () => ref
            .read(repositoryProvider)
            .articles(query: {'sort': '-publishedAt', 'pageSize': 3}),
        builder: (p, _) =>
            p.items.isEmpty ? const SizedBox() : FocusStories(p.items),
      ),
      SectionTitle(
        '最新文章',
        action: '全部',
        onTap: () => context.go('/categories'),
      ),
    ],
  );
}
```

```dart
part of 'home_page.dart';

/// 首页阅读分区通过同一仓库加载，保留缓存与入口顺序。
class _HomePopular extends ConsumerWidget {
  const _HomePopular();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    children: [
      SectionTitle('热门阅读', action: '更多', onTap: () => context.push('/tags')),
      AsyncPane<PageResult<Article>>(
        load: () => ref
            .read(repositoryProvider)
            .articles(query: {'sort': '-viewCount', 'pageSize': 5}),
        builder: (p, _) => Column(
          children: [
            for (var i = 0; i < p.items.length; i++)
              _PopularArticle(article: p.items[i], rank: i + 1),
          ],
        ),
      ),
      const SizedBox(height: 24),
    ],
  );
}
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**在 build 中启动统计 Future 造成重建时重复请求**。先触发主题切换和父级更新，观察首页请求次数是否增加；如果把问题定位在“build 发请求”，修正方向是“把数据读取放到 provider/repository 生命周期中，build 只组合视图”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | build 发请求 | 声明式组合 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 在 build 中启动统计 Future 造成重建时重复请求 | 可以稳定触发或明确构造该输入 |
| 定位 | 触发主题切换和父级更新，观察首页请求次数是否增加 | 找到责任层和状态归属 |
| 修正 | 把数据读取放到 provider/repository 生命周期中，build 只组合视图 | 失败不污染后续页面或账号 |

## 小结

首页的稳定性来自资源拆分和局部失败策略。焦点、最新、热门可以组合，但不必绑成全有全无的一次提交；真实 API 的语义也比原型里的演示数字重要。模块级 Repository 加共享列表组件，让数据策略和页面结构各自保持清晰。

## 延伸阅读

- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [列表分页与下拉刷新]({{LINK:M4-12}})
- [内容门户首页：焦点、最新文章流与侧栏如何组织](https://blog.csdn.net/fungleo/article/details/166784376)

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

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-07、M4-12、M3-05 发布后回填站内链接
- [ ] 热门排序描述与 API 字段语义核对
- [ ] 已删除本辅助区
