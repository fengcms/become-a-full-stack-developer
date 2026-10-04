# 成为全栈·Flutter App 篇·内置 WebView：网页历史、App 返回与外链安全

> WebView 看上去只是 App 里的一块网页，但它同时拥有浏览器历史和 Flutter 路由历史。若不定义返回顺序，用户按一次返回可能退出页面，却没法回到刚才的网页。

{{IMG:M4-15-封面}}

## 本文目标

介绍 Flutter APP 中的内置网页浏览、App 返回键行为、外部链接处理和认证边界，明确 Android 已验收与 iOS 尚未验收的范围。

## 前置知识

了解 Flutter 路由和移动 WebView。当前实现位于 `lib/features/web_page.dart`；集成测试见 `integration_test/web_page_test.dart`。

## 两套导航历史需要有优先级

用户从文章链接打开帮助网页后，WebView 可能已从页面 A 导航到 B。按系统返回键通常期望先回到 A，只有 WebView 历史为空时才 pop Flutter 路由。

```text
Flutter 栈：Article → WebPage
Web 历史：   A → B
返回第 1 次：B → A
返回第 2 次：WebPage → Article
```

如果只 pop 外层路由，Web 历史就被丢掉；如果每次都交给 WebView，历史为空时返回可能无响应。页面需明确检查 WebView 是否可后退，再选择动作。

{{IMG:M4-15-返回模型}}

## 内链与外链取舍

项目在 App 内打开普通网页链接，特定外部地址可交给系统浏览器。判断 scheme 和 host 时要拒绝不支持协议，避免把 `javascript:` 等地址作为常规网页导航。WebView 中加载网页不应注入 App 的 Bearer token 或 refresh token；Web 身份凭据和原生 API 凭据边界不同。

## Android 证据不能替代 iOS 验收

项目在 Android 模拟器通过网页导航和返回测试。当前开发 Mac 没有完整 Xcode，因此没有宣称 iOS WebView 构建、真机返回手势或应用商店环境已验收。平台插件配置即使在仓库中存在，也不等于目标平台验证通过。

## 错误与重试

网页 DNS 失败、TLS 问题和 HTTP 错误要显示网页加载失败状态；可重试当前地址。重试需保留 URL，不应退回到 App 首页。敏感认证页面不应被当作无差别外部网页缓存。

## 返回动作是一个优先级判断

App 返回处理可以写成一条明确优先级：先让当前 WebView 消费 back；没有网页历史时才 pop Flutter route；若路由已到根，再由平台处理退出或主导航行为。

```dart
Future<void> handleBack() async {
  if (await controller.canGoBack()) {
    await controller.goBack();
    return;
  }
  if (context.mounted && context.canPop()) {
    context.pop();
  }
}
```

示例表达控制流，WebView 插件和 go_router 的实际 API 以锁定版本为准。实现还要覆盖页面切换期间 controller 尚未就绪、网页加载失败和重复按键等情况。

外链校验也应解析 URI，而不是简单 `startsWith('https')`：scheme 只允许 `https`/必要的 `http`，主机和跳转目标按策略判断，异常 URI 交给错误状态。即便打开可信网页，也不能把应用 Authorization header 附加到 WebView 请求。

## 小结

WebView 与 Flutter Router 是两套栈，返回键需先消费网页历史；协议与 host 需有限校验，认证令牌不能跨边界注入。当前有 Android 模拟器证据，iOS 必须作为独立发布验收项目。

## 延伸阅读

- [Flutter Markdown 阅读器]({{LINK:M4-13}})
- [go_router 与四 Tab App Shell]({{LINK:M4-05}})
- [同源 BFF 代理：API、附件、Cookie 与跨站写入保护]({{LINK:M3-12}})

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

内置 WebView 同时包含网页历史和 Flutter 路由历史，系统返回键必须先回退网页，再退出 WebView 页面。本文结合实现说明内外链策略、协议校验、认证 token 隔离和加载失败恢复，并明确 Android 本机验证不等于 iOS 已验收。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

WebView 有两套返回栈

### 配图 AI 提示词

1. `M4-15-封面`：16:9 中文移动架构封面，Flutter Router 页面栈包裹 WebView 浏览历史栈，返回键先退网页再退 App 页面，蓝色两层路线图。
2. `M4-15-返回模型`：16:9 双栈交互时序图，Article→WebPage 外层路由，Web URL A→B 内层历史，分别展示两次返回键的行为。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-05、M4-13、M3-12 发布后回填站内链接
- [ ] 查看 Android 与 iOS 当前 WebView 验收边界
- [ ] 已删除本辅助区
