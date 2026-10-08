# 成为全栈·Flutter App 篇·内置 WebView：网页历史、App 返回与外链安全

做这个功能的时候，我被一个看起来根本不该成为问题的问题卡住了。

用户点文章里的一个外部链接，进入内置网页。在网页里点了两个链接（网页内部 A → B），然后按手机上的返回键。

**应该回到哪儿？**

按浏览器的习惯，回到 A（上一页）。按 App 的习惯，回到那篇文章。

两种都"对"，取决于用户把当前界面理解成什么。我一开始没想清楚就实现了浏览器版的，于是用户反馈"我在文章里点个链接，怎么要按三次返回才能回去"。

这篇讲 `features/web_page.dart` 的选择，以及顺带发现的另一件事：**WebView 里不该带 App 的登录态。**

{{IMG:M4-15-封面}}

## 明确：网页归网页，路由归路由

先看现在的实现。返回按钮是这么写的：

```dart
/// 网页浏览只占一个 App 路由，返回按钮始终退出网页回到来源页面。
class WebPage extends StatefulWidget {
  const WebPage({super.key, required this.url});
  final Uri url;
```

而导航委托里：

```dart
/// 所有网页导航只更新 WebView；不向 App 导航栈追加路由。
NavigationDelegate navigationDelegate() => NavigationDelegate(
  onNavigationRequest: (request) {
    final uri = Uri.tryParse(request.url);
    if (uri != null && isWebAddress(uri)) {
      return NavigationDecision.navigate;   // ← 继续在 WebView 里
    }
    if (request.isMainFrame && mounted) {
      notice(context, '此链接暂不支持在网页中打开');
    }
    return NavigationDecision.prevent;     // ← 拦住非 http/https
  },
```

**关键在于 WebView 内部导航不走 App 路由栈。** 网页里 A → B 的跳转，`currentUrl` 变了，但 `Navigator` 的栈没有变。

所以那个"网页历史"和"App 路由历史"是两套完全独立的东西：

```text
Flutter 栈：  Article → WebPage          （两层，返回即回文章）
WebView 内部： URL A → URL B             （不体现在 Flutter 栈上）
App 返回：     WebPage → Article
```

而系统返回键（Android 硬件返回、iOS 边缘滑动）**也走 Flutter 路由**，不是 WebView 历史——因为 `PopScope` 没被改成检查 `controller.canGoBack()`。

所以现在的口径是：**用户只要按返回，就一定回到来源文章。**

这个选择符合这个 App 的场景。文章里的链接通常是"参考资料""官方文档"，用户点进去是为了**看一眼然后回来继续读**。如果实现成浏览器式返回，用户在文档里点了三层链接之后想回文章，得按好几次返回，而且每次按都以为是"回到上一层网页"——**认知负担和实际预期不匹配。**

顺带说菜单里给了"在系统浏览器打开"：**需要真正的浏览器式浏览时，用户有出口。** 把两种需求分开，比在 App 里实现一个半吊子的浏览器体验要好。

## 那"当前 URL"到底是哪个

既然 WebView 会自己跳转，那"在系统浏览器打开"该打开哪个地址？

**不是最初那个 URL。** 用户从文章点进来的可能是 `example.com/docs`，网页里点了链接，现在实际在 `example.com/docs/api`。这时候"在浏览器打开"应该打开后者——用户看到的就是他正在看的东西。

```dart
Future<void> openInBrowser() async {
  try {
    final actual =
        Uri.tryParse(await controller?.currentUrl() ?? '') ?? currentUrl;
    final uri = isWebAddress(actual) ? actual : currentUrl;
    if (!isWebAddress(uri) ||
        !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) notice(context, '无法打开系统浏览器');
    }
  } catch (_) {
    if (mounted) notice(context, '无法打开系统浏览器');
  }
}
```

**优先用 `controller.currentUrl()`，失败才退回 `currentUrl`。** 因为 `currentUrl` 是我们在 `onUrlChange` 里维护的副本，它可能比 controller 内部状态旧一点（回调是异步的）。

而 `currentUrl` 的维护有两条路径：

```dart
onPageStarted: (url) {
  if (!mounted) return;
  setState(() {
    currentUrl = Uri.tryParse(url) ?? currentUrl;
    title = null;        // ← 新页面开始，清掉旧标题
    error = null;
    progress = 0;
  });
},
onUrlChange: (change) {
  final uri = Uri.tryParse(change.url ?? '');
  if (!mounted || uri == null || !isWebAddress(uri)) return;
  setState(() => currentUrl = uri);
  updateTitle();
},
```

`onPageStarted` 和 `onUrlChange` 都会更新，两者可能重复到达同一地址——所以不是赋值而是"`tryParse` 成功就用"。而 `onUrlChange` 里那个 `!isWebAddress(uri)` 的检查是**防御**：`about:blank` 这类中间地址也会触发回调，不能当成真实位置。

**`title = null` 那行也重要。** 新页面开始加载时，顶部标题还停留在上一页——用户会以为没跳转成功。清掉之后标题栏显示 fallback：

```dart
title: Text(
  title ?? (currentUrl.host.isEmpty ? '网页' : currentUrl.host),
  maxLines: 1,
  overflow: TextOverflow.ellipsis,
),
```

真实标题 > 域名 > "网页"，三级降级。

## 标题：每秒轮询一次

这里有个不太优雅的实现，我先说为什么这么写：

```dart
// Also follow document.title changes made by single-page websites.
if (mounted) {
  titleTimer = Timer.periodic(
    const Duration(seconds: 1),
    (_) => updateTitle(),
  );
}
```

**因为 WebView 没有"title 变了"的回调。** 单页应用（SPA）不会触发页面导航，`onPageFinished` 只在首次加载时来一次，之后路由变了不会有任何通知。所以只能轮询。

一秒一次是我权衡后的结果：更快（比如 200 毫秒）对一个只在标题栏显示的文字毫无意义，还多几次跨进程调用；更慢（比如 3 秒）会明显滞后。

而轮询必须防重入：

```dart
Future<void> updateTitle() async {
  if (readingTitle || controller == null || !mounted) return;
  readingTitle = true;
  final url = currentUrl;
  try {
    final next = (await controller!.getTitle())?.trim();
    if (mounted && url == currentUrl && next != title) {
      setState(() => title = next?.isNotEmpty == true ? next : null);
    }
  } catch (_) {
    // A page may be navigating or the platform view may be closing.
  } finally {
    readingTitle = false;
  }
}
```

三个防护：

**`readingTitle` 标志防重入。** `getTitle()` 是异步的，如果上一次还没回来，下一秒的定时器又触发，就会堆积。堆积的 `getTitle` 回来时可能已经过了页面跳转，所以——

**`url == currentUrl` 是关键。** 记下发起查询时的 URL，回来时如果它已经不是当前 URL 了，**这次结果丢弃**。否则会出现"用户已经跳到下一页，标题栏又被上一页的标题覆盖"。

这个模式和 M4-09 的 `start != epoch`、M4-12 的 `ticket != serial` **完全同构**：异步发起时记身份，回来时核对身份。这是全项目出现第三次了。

**`catch (_) {}` 吞掉异常是有意的。** 注释写得很清楚——页面正在跳转、或者平台视图正在销毁时，`getTitle()` 会抛异常。**这在一个每秒调一次的轮询里是常态，不是异常。**

标题栏最多 1 行、超出省略号，避免一个很长的页面标题把布局撑开。

## 错误处理：区分主框架和子资源

这是 WebView 里最容易搞错的一处：

```dart
onWebResourceError: (failure) {
  if (mounted && failure.isForMainFrame == true) {
    setState(() {
      error = '网页加载失败，请重试';
      progress = 100;
    });
  }
},
```

**`isForMainFrame` 这个判断不能省。**

一个网页加载时会请求几十个子资源：图片、字体、脚本、统计代码。任何一张图片 404、一个广告被拦截，都会触发 `onWebResourceError`。

如果没有这个判断，用户的体验会是：**页面正常显示，但顶部覆盖一层"网页加载失败，请重试"**，而点重试还找不到原因——因为网页本身是好的。

只处理主框架错误，语义才对：**主文档加载失败 = 用户真的看不到内容**。子资源失败，浏览器自己会降级处理，不需要 App 插手。

对应地，错误状态是全屏覆盖：

```dart
if (error != null)
  Positioned.fill(
    child: ColoredBox(
      color: context.colors.surface,
      child: Center(
        child: StateMessage(
          title: error!,
          onRetry: isWebAddress(widget.url) ? retry : null,
        ),
      ),
    ),
  ),
```

而 `onRetry: isWebAddress(widget.url) ? retry : null` 是个细节：**如果最初的 URL 就不合法（比如 `mailto:`），不给重试按钮。** 因为重试一个无效地址毫无意义。

那个 `retry()` 里也有一层判断：

```dart
Future<void> retry() async {
  setState(() { error = null; progress = 0; });
  if (controller == null) {
    await initialize();      // 控制器还没建好，重新初始化
    return;
  }
  try {
    await controller!.loadRequest(currentUrl);
  } catch (_) {
    if (mounted) setState(() => error = '网页加载失败，请重试');
  }
}
```

**用 `currentUrl` 而不是 `widget.url` 重试。** 因为用户可能已经跳转了——他加载失败的地方是 B，重试应该重试 B，不是重试最初那个 A。

## 协议白名单：不能只判断是不是链接

判断一个地址能不能在 WebView 里打开，第一版我写成：

```dart
bool isWebAddress(Uri uri) =>
    (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty;
```

这个判断现在是**唯一**的守门人：

```dart
if (uri != null && isWebAddress(uri)) {
  return NavigationDecision.navigate;
}
if (request.isMainFrame && mounted) {
  notice(context, '此链接暂不支持在网页中打开');
}
return NavigationDecision.prevent;
```

**为什么必须限制 scheme？** 因为 `javascript:` 和 `data:` 这类 scheme 如果放行，等于让网页执行任意代码——`javascript:` 后面可以跟任意 JS，而这段 JS 是在 WebView 的上下文里跑的。

`host.isNotEmpty` 也必要：`http:///path` 这种解析出来 scheme 是 http 但没有主机，是个畸形地址。

而 `isMainFrame` 那个条件让非主框架（iframe 里的、`target=_blank` 的）不走这个提示——它们静默阻止就行，弹提示会很吵。

不过要说明这个白名单的**边界**：它只挡 scheme，**没有做 host 白名单**。也就是说，如果产品要求"只能打开本站文章链接"，那得再加一层 host 判断。现在没加，是因为这个 App 的场景是"文章里的外部参考链接"，本来就该允许任意 http/https 站点。

## 不注入登录态：这是最重要的一条

现在讲安全，也是这个功能里我最想强调的一点。

`webview_flutter` 允许给所有请求注入请求头。这个能力**很诱人**——注入 Authorization 之后，网页里就能直接调我们的 API，用户不用登录。

现在的实现是**什么都不注入**：

```dart
Future<void> initialize() async {
  try {
    final web = WebViewController();
    controller = web;
    await web.setJavaScriptMode(JavaScriptMode.unrestricted);
    await web.setNavigationDelegate(navigationDelegate());
```

没有 `setNavigationDelegate` 之外的任何请求头设置。

**理由要说清楚，因为这是个容易被质疑的决定。**

假设注入了 Authorization，用户的登录令牌就进入了 WebView 的环境。而这个 WebView 加载的是**第三方网站**。也就是说：那个网站的 JS 可以读取它所在页面的任何东西，包括注入的请求头。

现在的身份认证靠什么？access token + refresh token（M4-09）。refresh token 是**长期有效**的，一旦泄露，攻击者可以在用户不知情的情况下长期冒充他。

而这正好撞上 JavaScript 的那个设置：

```dart
await web.setJavaScriptMode(JavaScriptMode.unrestricted);
```

**`unrestricted` 意味着允许任意 JavaScript 执行。** 这是有意为之——很多现代站点（文档站、后台、单页应用）不跑 JS 就是一片空白，限制它等于放弃大部分网站。

但这个决定和"不注入 token"是一体的：**允许任意 JS + 注入长期凭据 = 把用户账号交出去。**

如果哪天产品要求"WebView 里也能用登录态"，那必须同时：限制 host 白名单、换成短期且可撤销的凭据、把 JS 模式降到 `restricted`。**三个条件缺一个都不能做。**

Markdown 正文里的图片 URL 也遵循同一条线——那些图片走的是原生图片加载（`reader_image.dart`），不是 WebView，两者是不同的信任边界。

## 一条我一开始想省掉的事

`onWebResourceError` 里的 `isForMainFrame` 判断，我第一版没写。

当时的测试方式是：打开一个正常网页和一个不存在的网页，都正常。于是这个 bug 没被发现。

直到我在测试时随手打开了一个**有失效广告的网站**——页面顶部盖着"网页加载失败，请重试"，而网页明明显示得好好的。点重试也没用，因为主框架一直是好的。

这个 bug 的恶劣之处在于**它会误报**。一个只报错的页面，用户会怀疑 App 坏了；一个该报错却不报错的页面，用户会白等。**误报比漏报更伤。**

所以判断标准变成：**宁可漏报子资源失败，也不要误报主框架失败。** 因为子资源失败用户基本感知不到，而主框架的误报会直接破坏对 App 的信任。

同一个判断标准也用在别处：

| 场景 | 宽松（宁可误报） | 严格（宁可漏报） |
|---|---|---|
| WebView 错误 | | ✅ 用这个 |
| 目录锚点失配 | ✅ 灰掉不点 | |
| 缓存失效判断 | | ✅ 只有 forbidden 才清空 |

**三处的选择是一致的：涉及"让用户看到内容"的，宁可少做。** 因为漏掉的代价是"少一个功能"，误报的代价是"App 不可信"。

## 小结

内置 WebView 看着只是"放个浏览器进去"，实际要处理五件事：

1. **两套历史** —— WebView 内部 URL 历史和 Flutter 路由栈独立，明确选"返回回来源文章"，同时提供"在系统浏览器打开"作为出口。
2. **当前地址跟踪** —— 用 `controller.currentUrl()` 而非初始 URL，失败降级到本地维护的 `currentUrl`。
3. **异步身份核对** —— 轮询标题时记下发起时的 URL，回来时不一致就丢弃（`url == currentUrl`）。
4. **错误分级** —— 只有主框架失败才算失败，子资源失败静默降级。
5. **不注入凭据** —— `JavaScriptMode.unrestricted` 与"不注入 Authorization"必须绑定决策。

第 3 条是全系列第三次出现同一个模式（M4-09 的 `epoch`、M4-12 的 `serial`、这里的 `url` 比较）。**在 Flutter 里做异步，答案永远是：发起时记身份，回来时核对。**

第 5 条则是这个系列里最重要的安全结论：**"允许任意 JS"和"注入长期凭据"不能共存。** 前者让第三方站点能执行代码，后者让这些代码有机会偷走用户的身份。选一个就行，两个都要就是给账号开后门。

下一篇讲点赞收藏的乐观更新——那是这个系列里最后一个"写操作密集"的模式，也是失败回退最需要仔细设计的地方。

## 延伸阅读

- [Flutter Markdown 阅读器：支持范围与渲染边界]({{LINK:M4-13}})
- [服务端目录与文章辅助阅读：锚点、上下篇、浏览量和阅读历史]({{LINK:M4-14}})
- [点赞、收藏与阅读历史：乐观更新和失败回退]({{LINK:M4-16}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`WebView`、`移动开发`、`路由管理`、`网络安全`、`全栈开发`

### 文章简介（250 字以内）

内置 WebView 同时包含网页 URL 历史和 Flutter 路由历史，而当前 App 选择按返回直接回到来源文章。本文结合实现说明内外链策略、协议校验、认证 token 隔离和加载失败恢复，并明确 Android 本机验证不等于 iOS 已验收。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

WebView 与 App 的返回边界

### 配图 AI 提示词

1. `M4-15-封面`：16:9 中文移动架构封面，Flutter Article→WebPage 路由，WebView 内部从 URL A 导航到 B；App 返回直接回到来源文章，菜单可在系统浏览器打开当前 URL，蓝色两层历史示意。
2. `M4-15-返回模型`：16:9 导航图，Article→WebPage 外层 Flutter 路由，Web URL A→B 留在同一 WebPage，点击 App 返回 pop 到 Article；区分当前实现和未来可选浏览器式 back。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-05、M4-13、M3-12 发布后回填站内链接
- [ ] 确认返回行为与 web_page.dart 当前实现一致
- [ ] 已删除本辅助区
