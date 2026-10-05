# 成为全栈·Flutter App 篇·内置 WebView：网页历史、App 返回与外链安全

读文章时点开一条外链，用户只是想看完网页再回来继续读。WebView 如果完全照搬浏览器的返回习惯，返回键可能留在网页历史里；如果直接关闭页面，又要让这个行为成为清楚的产品决定。

这篇对照当前 `WebPage` 的 `NavigationDelegate`、页面标题和返回按钮实现，解释 APP 为什么选择返回来源文章，并补上安全校验与网页失败重试。

{{IMG:M4-15-封面}}

## 当前产品选择了“返回来源页”，不是网页后退

这里要区分浏览器的习惯和本 App 的实现。`WebPage` 将普通网页内导航留在同一个 WebView 路由中，顶部返回按钮始终 pop Flutter 路由回到来源文章；菜单提供“关闭网页”和“在系统浏览器打开”。当前页面没有把系统返回键改成 `controller.goBack()`，所以用户离开内置网页时不会逐页遍历它的 WebView 历史。

```text
Flutter 栈：Article → WebPage
WebView 内部：URL A → URL B（留在当前 WebPage）
App 返回：WebPage → Article
菜单选择系统浏览器：打开当前 URL
```

这是适合“从文章临时查看链接，然后返回继续阅读”的产品取舍。若未来改成浏览器式 WebView，就要在 PopScope 中先检查 `canGoBack()`，并处理 Android 系统返回手势和 iOS 边缘返回；不能只改变顶部按钮而漏掉平台返回路径。

{{IMG:M4-15-返回模型}}

## 内链与外链取舍

项目在 App 内打开普通网页链接，特定外部地址可交给系统浏览器。判断 scheme 和 host 时要拒绝不支持协议，避免把 `javascript:` 等地址作为常规网页导航。WebView 中加载网页不应注入 App 的 Bearer token 或 refresh token；Web 身份凭据和原生 API 凭据边界不同。

## Android 证据不能替代 iOS 验收

项目在 Android 模拟器通过网页导航和返回测试。当前开发 Mac 没有完整 Xcode，因此没有宣称 iOS WebView 构建、真机返回手势或应用商店环境已验收。平台插件配置即使在仓库中存在，也不等于目标平台验证通过。

## 错误与重试

网页 DNS 失败、TLS 问题和 HTTP 错误要显示网页加载失败状态；可重试当前地址。重试需保留 URL，不应退回到 App 首页。敏感认证页面不应被当作无差别外部网页缓存。

## 如果产品改成浏览器语义，先写清返回规则

浏览器式返回可以采用“有网页历史先回退，没有网页历史再 pop App 路由”。这属于可选增强，不是当前实现。改动时需要处理 controller 尚未初始化、同一 URL 的 SPA history、页面加载中重复按键、WebView 销毁等竞态，并增加 Android back 与 iOS 手势测试。当前自动化验收覆盖 Android 网页导航和返回来源页；没有完整 iOS 验收。

外链校验也应解析 URI，而不是简单 `startsWith('https')`：scheme 只允许 `https`/必要的 `http`，主机和跳转目标按策略判断，异常 URI 交给错误状态。即便打开可信网页，也不能把应用 Authorization header 附加到 WebView 请求。

## WebView 与本机内容共享信任边界要谨慎

项目把 Markdown 文章中的网页链接通过 URL launcher/内置网页页面处理，但 API token 不注入 WebView。这样即使网页跳到第三方域名，原生认证头也不会自动泄露。外部浏览器跳转仍需检查 URI scheme；不能把用户提供的任意文本直接当作可执行导航地址。

当前测试应验证网页导航 A→B 后点击 App 返回仍回到来源文章，菜单“在系统浏览器打开”使用当前 URL。若将来更改为浏览器式返回，平台返回手势与 Android back 按钮可能走不同回调；届时需增加首次回退网页、第二次关闭 WebView 的测试，并检查 controller 生命周期。

## 页面还负责进度、标题和失败重试

`NavigationDelegate` 将 WebView 主框架进度写入线性进度条；页面开始时清除旧标题和错误，完成后读取 `document.title`。单页应用可能在 load finished 后再次改标题，所以实现定时采集 title，并用当前 URL 核对异步返回，防止旧页面标题覆盖新页面。

JavaScript 当前设为 unrestricted，适合打开动态站点，但也扩大网页脚本可执行能力。内容站的 Markdown 渲染与 WebView 是两条不同信任边界：不要把不可信 HTML 拼到 WebView；加载网页时不注入应用 token；如产品未来只允许特定站点，应增加 host allowlist，而当前实现只限制 HTTP/HTTPS scheme。

网络错误覆盖主框架时显示全页重试，子资源图片失败不会把整页替换成错误。重试使用当前 URL，不回初始链接；在外部浏览器打开也读取 WebView 当前 URL，而不是最初文章中的 href。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/features/web_page.dart 第 34–107 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：尝试 javascript/mailto 深链，并检查 WebView 请求头是否含 Authorization。这里关注的是它如何改变数据流，而不只是记住一个 API 名称。

```dart
  @override
  void initState() {
    super.initState();
    if (!isWebAddress(widget.url)) {
      error = '此链接不是有效的网页地址';
      return;
    }
    initialize();
  }

  Future<void> initialize() async {
    try {
      final web = WebViewController();
      controller = web;
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await web.setNavigationDelegate(navigationDelegate());
      if (!mounted) return;
      setState(() {});
      await web.loadRequest(widget.url);
      // Also follow document.title changes made by single-page websites.
      if (mounted) {
        titleTimer = Timer.periodic(
          const Duration(seconds: 1),
          (_) => updateTitle(),
        );
      }
    } catch (_) {
      if (mounted) setState(() => error = '网页加载失败，请重试');
    }
  }

  /// 所有网页导航只更新 WebView；不向 App 导航栈追加路由。
  NavigationDelegate navigationDelegate() => NavigationDelegate(
    onNavigationRequest: (request) {
      final uri = Uri.tryParse(request.url);
      if (uri != null && isWebAddress(uri)) {
        return NavigationDecision.navigate;
      }
      if (request.isMainFrame && mounted) {
        notice(context, '此链接暂不支持在网页中打开');
      }
      return NavigationDecision.prevent;
    },
    onPageStarted: (url) {
      if (!mounted) return;
      setState(() {
        currentUrl = Uri.tryParse(url) ?? currentUrl;
        title = null;
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
    onProgress: (value) {
      if (mounted) setState(() => progress = value);
    },
    onPageFinished: (_) {
      if (mounted) setState(() => progress = 100);
      updateTitle();
    },
    onWebResourceError: (failure) {
      if (mounted && failure.isForMainFrame == true) {
        setState(() {
          error = '网页加载失败，请重试';
          progress = 100;
        });
      }
    },
  );
```

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**WebView 接受非 HTTP scheme 或把 App token 带进网页**。先尝试 javascript/mailto 深链，并检查 WebView 请求头是否含 Authorization；如果把问题定位在“任意 URI 导航”，修正方向是“校验 scheme 与 host，拒绝不支持协议，原生令牌不跨到网页”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 任意 URI 导航 | HTTP(S) allow rule |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | WebView 接受非 HTTP scheme 或把 App token 带进网页 | 可以稳定触发或明确构造该输入 |
| 定位 | 尝试 javascript/mailto 深链，并检查 WebView 请求头是否含 Authorization | 找到责任层和状态归属 |
| 修正 | 校验 scheme 与 host，拒绝不支持协议，原生令牌不跨到网页 | 失败不污染后续页面或账号 |

## 小结

WebView 内部 URL 历史与 Flutter Router 历史需要分别设计；当前 App 返回主动关闭内置页回来源文章，协议与 host 需有限校验，认证令牌不能跨边界注入。当前有 Android 模拟器证据，iOS 必须作为独立发布验收项目。

## 延伸阅读

- [Flutter Markdown 阅读器]({{LINK:M4-13}})
- [go_router 与四 Tab App Shell]({{LINK:M4-05}})
- [同源 BFF 代理：API、附件、Cookie 与跨站写入保护](https://blog.csdn.net/fungleo/article/details/166991347)

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
