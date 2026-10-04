# 成为全栈·Flutter App 篇·go_router 与四 Tab App Shell：保留导航状态、深链和登录回跳

四个底部 Tab 看起来只是一排按钮，实际决定了用户在首页、分类、搜索和会员页之间切换时，哪些滚动位置和子页面要留下来。文章详情还要能从分享链接进入，未登录的投稿入口则需要记住用户原来想去哪里。

我会结合 `router.dart` 说明 StatefulShell、独立路由和会话恢复如何配合，并逐步验证匿名深链、登录回跳和系统返回这几条路径。

{{IMG:M4-05-封面}}

## 四个 Tab 不是一条线性的页面栈

应用底部入口为首页、分类、搜索、我的。用户可能在首页打开文章，再进入作者页；切换到搜索输入关键词，又切回首页，期望此前滚动位置和搜索状态仍在。若每次点 Tab 都 push 新页面，返回键会堆出一长串重复首页。

```text
首页栈：Home → Article → Author
分类栈：Categories → Tag
搜索栈：Search → Article
我的栈：Member → Settings
```

项目使用 StatefulShellRoute 的分支导航思路保留各 Tab 状态。它与“每个 Tab 维护自己的 navigator”相匹配；不要把 Tab 切换当作普通 push。

{{IMG:M4-05-导航栈}}

## 路由地址表达可恢复页面

文章路由应包含稳定 ID 或 slug，编辑/预览路由包含稿件标识。地址是应用状态的一部分：进程被系统回收后，深链接仍应能定位目的页面，路由参数也要做解析和错误兜底。

```dart
GoRoute(
  path: '/articles/:id',
  builder: (context, state) => ArticlePage(
    articleId: state.pathParameters['id']!,
  ),
)
```

这是结构示意，实际路由以 `router.dart` 为准。`!` 的前提是路由模式保证必填参数；若数据来自可选 query，应显式解析失败，而不是断言。路由构建页不等于文章已经加载，页面仍需呈现加载、404 和可重试错误。

## 私有路由必须保留登录后的目的地

未登录用户点击投稿或会员私有页面时，直接跳登录会丢失上下文。重定向应把原路径编码到 redirect 参数中，登录成功后验证该目标并回跳。回跳目标属于输入，不能允许任意外部 URL 跳转；项目只在 App 内路由范围恢复。

```text
/editor/new
   ↓ 未登录
/login?redirect=%2Feditor%2Fnew
   ↓ 登录成功
/editor/new
```

鉴权守卫只改善导航体验，Repository 与后端仍负责权限裁决。已登录并不代表有权编辑任意稿件，UI 隐藏按钮也不是安全控制。

## 深链接和内部导航应共用路由

分享文章链接、通知点击和会员回跳都应进入同一条路由定义。若外链由一套解析器、Tab 内按钮由另一套手写 Navigator 管理，容易出现重复页面和不同返回行为。自定义 scheme 当前属于开发期路径验证；正式平台关联域名还需单独配置与真机验收，不能因为页面路由工作就声称 App Links 已发布。

## 错误页也是路由契约的一部分

错误 ID、已撤下文章或深链格式错误都应落到可理解页面，并能返回主导航。路由层负责路径解析/重定向，页面负责业务请求状态。不要在路由 builder 同步发网络请求，也不要将所有异常都重定向到首页掩盖问题。

## 路由守卫应避免重定向循环

异步会话恢复时，Router 可能先看到“未知”再变为已登录/未登录。守卫需要区分初始化中、匿名和有效会话，避免登录页与私有页互相重定向。登录成功读取 redirect 参数时，只接受站内路径并处理空值/编码异常。

验收要从几个入口进入相同文章：Tab 内卡片、通知跳转、外部分享链接；再逐条检查系统返回、Tab 切换和登录回跳。页面能显示只是第一步，返回栈符合用户预期才是路由闭环。

## 登录回跳需要保留完整 URI

项目路由守卫把原始 URI 编码进 `/login?from=...`，会话恢复期间先进入 restoring 页面，恢复完成后再去目标或会员首页。这处理了“启动时 token 仍在安全存储但用户还没加载完”的短暂状态。若把“未知身份”当成匿名，深链用户会先被送去登录；若恢复后不继续原 URI，又会丢失外部链接意图。

```text
private URI + session.restoring → /restoring?from=URI
restore success → from
restore failure / no user → /login?from=URI
```

真实代码用 `state.uri.toString()` 和 `Uri.encodeComponent` 保存完整路径和 query。目标只允许 App 内路径，避免开放重定向；文章路由也不应误设为私有，否则匿名阅读链接会强制登录。

## StatefulShell 的范围并不等于所有页面都在 Tab 内

当前四个主分支使用 indexed stack，文章详情、作者和认证/投稿操作作为 standalone routes，返回后保留原分支。路由设计需和页面导航关系保持一致；单纯把所有路由塞进 Shell 可能导致详情切 Tab 时出现错误底栏。


## 贴着工程代码读实现

下面这段节选自 `flutter-app/lib/app/router.dart 第 36–90 行`（保留原始实现；为突出主线省略了文件其余部分）。读代码时可以顺着调用链确认：分别测试四个分支的栈、深链直达和 from 回跳参数。把这几步连起来，才看得到数据如何从服务边界走到界面。

```dart
class AccountBoundary extends ConsumerWidget {
  const AccountBoundary({
    super.key,
    required this.child,
    this.authenticated = true,
  });
  final Widget child;
  final bool authenticated;
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      authenticated && ref.watch(sessionProvider).user == null
      ? const SizedBox.shrink()
      : KeyedSubtree(
          key: ValueKey(ref.watch(sessionProvider).epoch),
          child: child,
        );
}

GoRouter createRouter(AppSession session) => GoRouter(
  refreshListenable: session,
  redirect: (context, state) => _redirect(session, state),
  errorBuilder: _errorBuilder,
  routes: [
    GoRoute(
      path: '/restoring',
      builder: (c, s) =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
    ),
    StatefulShellRoute.indexedStack(
      builder: (c, s, shell) => Scaffold(
        body: shell,
        bottomNavigationBar: _AppBottomBar(shell: shell),
      ),
      branches: _shellBranches(),
    ),
    ..._standaloneRoutes(),
  ],
);

// 受保护入口等待会话恢复，原始位置作为登录后的回跳目标。
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

## 把容易出错的路径走一遍

我会用这个场景做一次可复现排查：**切换 Tab 后导航栈被重建或登录后丢失原目标**。先分别测试四个分支的栈、深链直达和 from 回跳参数；如果把问题定位在“单 Navigator”，修正方向是“用 StatefulShellRoute 保存分支状态，登录成功后校验回跳目标”。最后再验证正常路径没有退化，并把边界条件留在自动化检查里。

| 方案比较 | 简化做法 | 当前实现/推荐做法 |
|---|---|---|
| 本文核心选择 | 单 Navigator | 分支 Navigator |
| 错误处理 | 失败后清空或静默忽略 | 保留可恢复状态，给出明确反馈 |
| 验证方式 | 只检查成功结果 | 注入边界条件并检查回归 |

| 排错步骤 | 要观察什么 | 通过条件 |
|---|---|---|
| 复现 | 切换 Tab 后导航栈被重建或登录后丢失原目标 | 可以稳定触发或明确构造该输入 |
| 定位 | 分别测试四个分支的栈、深链直达和 from 回跳参数 | 找到责任层和状态归属 |
| 修正 | 用 StatefulShellRoute 保存分支状态，登录成功后校验回跳目标 | 失败不污染后续页面或账号 |

## 小结

四 Tab 导航、路由栈、深链接和登录回跳共同定义了 App 的空间结构。先决定每个分支是否保留状态，再建立可恢复的 URL，最后让身份守卫保留安全的内部目标。路由正确不等于后端授权正确，生产深链也需要平台级验证。

## 延伸阅读

- [Riverpod 状态边界：会话、服务端数据和表单草稿]({{LINK:M4-06}})
- [Refresh Token 旋转与并发 401]({{LINK:M4-09}})
- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})

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
