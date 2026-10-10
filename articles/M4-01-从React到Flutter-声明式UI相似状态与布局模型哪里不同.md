# 成为全栈·Flutter App 篇·从 React 到 Flutter：声明式 UI 相似，状态与布局模型哪里不同

React 开发里，写一个 `Row` 和 `Column` 往往很顺手；换到 Flutter 后，我更常先问父节点给了什么约束。第一次遇到无界高度异常时，问题并不在某个 Widget 名字，而在我把 CSS 的布局直觉带进了另一套渲染管线。

这篇从一个前端工程师最熟悉的声明式组件开始，拆出 Widget、Element 和 RenderObject 各自负责的事，再用列表布局说明哪些经验可以沿用、哪些要重新建立。

![成为全栈·Flutter App 篇·从 React 到 Flutter：声明式 UI 相似，状态与布局模型哪里不同](https://i-blog.csdnimg.cn/direct/8d27a1bda4524d13a9b5d1c01f796f26.png)

## 声明式相似，渲染对象不同

React 组件根据 props/state 返回元素树，协调器将变化提交到 DOM。Flutter 的 `build` 返回 Widget 配置树，框架据此更新 Element，再由 RenderObject 执行布局和绘制。Widget 通常很轻，可以频繁创建；它更像不可变配置，不等于屏幕上真实的像素对象。

```dart
@override
Widget build(BuildContext context) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(article.title),
      const SizedBox(height: 8),
      Text(article.summary),
    ],
  );
}
```

每次调用 `build` 返回新的 `Column`、`Text` 配置，不代表整棵屏幕都重新绘制。Element 会根据位置、类型和 key 尽可能复用状态对象。优化前要先测量，而不是因为“build 被调用”就急着加复杂缓存。

![渲染树](https://i-blog.csdnimg.cn/direct/a0621df4647b4b04a0a04281ac82ab83.png)

## Flex 相似，约束方向值得重新学习

CSS 常从容器样式推导子元素布局；Flutter 则把父约束向下传递，子节点选择尺寸，再由父节点定位。核心规则可以概括为：constraints go down、sizes go up、parent sets position。

```text
父节点给出最小/最大宽高
  ↓
子节点在约束中选择尺寸
  ↑
父节点按自己的规则定位子节点
```

因此，`Expanded` 必须位于能给主轴有限剩余空间的 `Row`/`Column` 中；把纵向列表塞进另一个无界纵向滚动区，可能得到“vertical viewport was given unbounded height”。它不是 Flutter 任性，而是两个滚动容器都想决定内容高度。修正通常是明确边界：单一滚动视口、`shrinkWrap`（小数据、额外布局成本）或 `Expanded` 约束，而不是到处包 `IntrinsicHeight`。

## 状态生命周期不能一律提升

React 里常把共享状态提到父组件；Flutter 中也需要区分状态所有权。滚动控制器、输入控制器和当前 Tab 的临时展开态，属于页面生命周期；主题选择可持久化；登录会话跨多个页面共享；文章列表由 Repository 管理并遵循缓存策略。

```text
页面局部：TextEditingController / ScrollController / 编辑模式
应用级：会话、主题、API client
服务端数据：Repository 读取、刷新、失效
本机用户数据：按账号+稿件 ID 隔离的恢复副本
```

把所有值都放进全局 Provider，会造成失效范围过大；全部留在页面，又会让多个页面重复请求、难以统一缓存。边界按所有者和生命周期定，不按“它是不是状态”分类。

## 列表重建与滚动体验

项目将列表交给共享 `ArticleFeed`，而不是在每个页面复制分页、空态和刷新逻辑。页面提供数据与加载动作，列表组件维护滚动和分页交互。返回某个 Tab 时，四个主分支保留状态；强刷更新数据时，当前画面不必先清空。

这与 React 的组件复用目标类似，但 Flutter 列表还要考虑惰性构建、滚动控制器归属和视口约束。不要仅凭“声明式”就认为状态变化必然产生整页昂贵重绘，也不要忽略长列表的 `ListView.builder` 等惰性构建方式。

## 常见迁移错误

| 误区 | 实际后果 | 更好的问题 |
|---|---|---|
| Widget 等于 DOM 节点 | 误判重建成本 | Element/RenderObject 是否被复用？ |
| `Expanded` 等于 CSS flex:1 | 无界约束异常 | 父节点提供了有限主轴空间吗？ |
| 全局状态越多越好 | 缓存与会话难隔离 | 谁拥有它、何时失效？ |
| build 被调用就是性能问题 | 过早优化 | profile 是否显示布局/绘制瓶颈？ |

## 用 Flutter 术语重新看一次组件更新

React 中你可能会把“组件函数再次执行”与“真实 DOM 更新”区分开；Flutter 也要区分 Widget 重建与 RenderObject 工作量。一个 `build` 重建可以只产生便宜的配置对象，框架随后依据 Element 树复用状态。反过来，一个小区域更新若触发复杂布局或昂贵 Markdown 解析，仍可能造成卡顿。

因此判断成本要观察帧时间和 profile，而不是在日志里看到 build 次数就给每个子节点加 `const`。不可变常量当然有价值，但它不是替代测量的性能策略。布局异常也先回到约束链：定位哪个父节点给出无限高度，再决定唯一滚动容器或有限尺寸。

## 从约束报错定位布局，而不是猜尺寸

遇到 `RenderFlex children have non-zero flex but incoming height constraints are unbounded` 时，先沿父子链确认哪个滚动视口提供了无限主轴约束。典型错误是纵向 `SingleChildScrollView` 中再放一个纵向 `ListView`，同时让两个节点都要求根据内容无限增长。若内容整体很长，通常保留一个滚动容器；若列表有明确有限区域，则在 `Column` 中给 `Expanded`，让列表取得有限剩余空间。

```dart
Column(
  children: [
    const Header(),
    Expanded(
      child: ListView.builder(
        itemCount: items.length,
        itemBuilder: (_, i) => ArticleTile(items[i]),
      ),
    ),
  ],
)
```

以上布局成立的前提是 `Column` 自身拿到有限高度，例如页面 Scaffold 的 body；若外层同样无界，`Expanded` 也无法解决。`shrinkWrap: true` 会让列表测量内容高度，适合短小嵌套列表但可能放弃视口惰性布局优势。选择前要问谁是唯一滚动所有者。

## Widget 树优化先测再做

开发模式下的重建日志不能直接代表 Release 帧耗时。用 Flutter DevTools 的 Performance/Widget rebuild 工具在真实长文章、滚动列表和主题切换时观察帧；若成本来自高亮解析，就缓存词法结果；若来自图片解码，限制解码尺寸；若只是轻量 Widget 配置重建，增加复杂缓存反而会让状态更难维护。

![布局约束](https://i-blog.csdnimg.cn/direct/d91c2c3a11484ca79d73b417d6cd3505.png)

## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/shared/widgets/article_feed.dart 第 160–213 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：沿父节点向上检查约束来源，并确认是否出现两个纵向滚动所有者。把这几步连起来，才看得到数据如何从服务边界走到界面。

```dart
  Future<void> load({
    bool reset = false,
    bool check = false,
    bool verify = false,
  }) async {
    if (busy && !reset) return;
    if (pendingUpdate && !reset && !check) return;
    final firstKey = repository.key(widget.path, {
      'page': 1,
      'pageSize': 12,
      ...widget.query,
    }, private: widget.path.startsWith(Endpoints.privatePrefix));
    // 翻下一页前先检查首屏是否变化，阻止旧页混入新的排序结果。
    if (page > 0 && !reset && !check && !repository.cache.fresh(firstKey)) {
      await load(check: true, verify: true);
      if (!mounted || pendingUpdate || error != null) return;
    }
    final ticket = ++serial;
    setState(() {
      busy = true;
      error = null;
    });
    final repo = ref.read(repositoryProvider);
    if (reset) repo.cache.invalidate({repo.feedTag(widget.path, widget.query)});
    try {
      final p = await repo.track(
        dependencies,
        () => repo.articles(
          page: reset || check ? 1 : page + 1,
          path: widget.path,
          query: widget.query,
          force: reset || verify,
        ),
      );
      if (!mounted || ticket != serial) return;
      setState(() => _applyPage(p, check, reset));
    } catch (e) {
      if (mounted &&
          ticket == serial &&
          e is! SessionChanged &&
          e is! CacheSuperseded) {
        setState(() {
          error = e;
          if (repo.forbidden(e) ||
              dependencies.any((k) => !repo.cache.usable(k))) {
            items = [];
            page = 0;
          }
        });
      }
    } finally {
      if (mounted && ticket == serial) setState(() => busy = false);
    }
  }
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**嵌套纵向滚动让视口拿到无界高度**。先沿父节点向上检查约束来源，并确认是否出现两个纵向滚动所有者；如果把问题定位在“组件树”，修正方向是“把列表放进有限高度的 Expanded，或保留一个主滚动容器”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 组件树 | RenderObject 布局 |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 嵌套纵向滚动让视口拿到无界高度 | 可以稳定触发或明确构造该输入 |
| 定位 | 沿父节点向上检查约束来源，并确认是否出现两个纵向滚动所有者 | 找到责任层和状态归属 |
| 修正 | 把列表放进有限高度的 Expanded，或保留一个主滚动容器 | 失败不污染后续页面或账号 |

## 小结

React 和 Flutter 共享“由状态描述 UI”的思想，但 Flutter 的 Widget 是配置，Element 承载位置状态，RenderObject 执行布局绘制；布局采用显式约束传递。迁移时先重建对树和生命周期的理解，再选择状态管理工具，才能避免把 React 习惯机械翻译成 Dart。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成](https://blog.csdn.net/fungleo/article/details/167370472)
- [Riverpod 状态边界]({{LINK:M4-06}})
- [Next.js App Router 与 CSR 时代的思维差异](https://blog.csdn.net/fungleo/article/details/166690841)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`React`、`Dart`、`移动开发`、`全栈开发`、`UI架构`

### 文章简介（250 字以内）

React 与 Flutter 都是声明式 UI，但 Widget 不是 DOM 节点，Flutter 采用约束向下、尺寸向上、父节点定位的布局模型。本文结合实际工程解释重建、Element、滚动约束与状态生命周期，帮助前端开发者避免把熟悉的 React 经验机械搬到 Flutter。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

声明式相似，布局不同

### 配图 AI 提示词

1. `M4-01-封面`：16:9 中文技术博客封面，左侧 React DOM/CSS 方块树，右侧 Flutter Widget-Element-RenderObject 三层树，中间用箭头表达相似的声明式思想与不同渲染管线，深蓝底色、青蓝强调、中文标题清晰，无品牌 Logo。
2. `M4-01-渲染树`：16:9 技术示意图，Widget 配置树更新后由 Element 对应复用状态、RenderObject 负责布局绘制，层次清晰，中文标签准确。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、M4-06 发布后回填站内链接
- [ ] 核实本文所述实现与 Flutter SDK 版本一致
- [ ] 已删除本辅助区
