# 成为全栈·Flutter App 篇·Riverpod 状态边界：会话、服务端数据和表单草稿

> Riverpod 能管理状态，却不会替团队决定状态属于谁。会话、可重新获取的文章和未提交文本有完全不同的生命周期，混在一个 Provider 里只会让失效变得不可预测。

{{IMG:M4-06-封面}}

## 本文目标

基于 Flutter 工程的 Riverpod 使用方式，划分应用依赖、会话、服务端内容、页面临时值与本机稿件恢复状态，找到每类状态的所有者与清理时机。

## 前置知识

熟悉 Dart Future、Provider 基础和前文路由。项目入口在 `lib/main.dart`，会话封装在 `lib/app/session.dart`，Repository 在 `lib/features/repository.dart`。

## 先问所有权，而不是先问用哪个 Provider

前端常把状态分为 local/global；在移动端还需要问“进程重启后是否应该存在”“切换账号是否清除”“服务端是不是事实源”。

| 状态 | 所有者 | 生命周期 |
|---|---|---|
| access token | Session | 当前进程、退出/失效即清除 |
| 文章正文列表 | Repository/DataCache | 公开资源 TTL 与容量预算 |
| 主题偏好 | 用户设备 | 本机持久化 |
| 编辑输入 | Editor 页面 | 页面编辑期间 |
| 稿件恢复副本 | 本机草稿存储 | 账号+稿件隔离，成功写回后清理 |

Provider 是依赖注入和重建工具，不是所有状态都该由它永久托管。

{{IMG:M4-06-状态所有权}}

## 应用级依赖通过 Provider 装配

API Client、Session、Repository 在根部统一创建，使页面能够注入同一会话与同一缓存策略。Widget 不应自己 new 一个 Dio，也不应在 build 里建 Repository：否则实例不同会丢掉请求合并、缓存和刷新单飞等行为。

```dart
final apiClientProvider = Provider<ApiClient>((ref) {
  final session = ref.watch(sessionProvider);
  return ApiClient(session: session);
});

final readerRepositoryProvider = Provider<ReaderRepository>((ref) {
  return ReaderRepository(ref.watch(apiClientProvider));
});
```

以上表达依赖关系的简化示例；以当前 `main.dart` 与 Provider 定义为准。若依赖持有 Stream/Controller 等资源，Provider dispose 时要同步释放。

## 服务端状态不能当作任意全局变量

文章列表、分类、会员通知都来自服务器。缓存策略、TTL、身份 key 和写后失效由 Repository 统一处理，Provider 负责让页面订阅读取结果。组件本地拷贝一个 `List<Article>` 再自行更新，很容易让互动写入成功后其它页面仍读旧值。

也不能简单说“服务器状态全用自动销毁”。返回 Tab 时保留已加载列表和滚动位置是产品行为；缓存策略决定何时复用和重新验证。状态生命周期应与缓存政策协调，而不是只看 widget 是否卸载。

## 临时表单状态放近编辑者

标题、正文、光标、预览模式等通常归编辑页控制器。将每次按键都写进全局状态会增加重建传播和账号泄露风险。需要恢复时，另建按账号和稿件 ID 隔离的本机副本，并在服务端保存成功后清理；它与公开数据缓存不是一回事。

```text
Editor Widget state → 正在编辑的值
Recovery storage → 可恢复副本
Repository/API → 服务端正式稿件
```

三份状态可能暂时不同，因此保存流程必须处理服务端更新时间冲突，而不能默认本地永远最新。

## 会话变化是全局边界事件

退出、刷新失败和账号切换不仅改变一个 `isLoggedIn` 布尔值，还需要清除 access/refresh 凭据、私有状态和旧账号在途响应。项目通过会话 epoch 识别代际变化，私有页面随会话代次重建；公开文章不应因用户退出而清空。

这正是状态分类的现实价值：全局重置如果简单 `invalidateAll`，可能把可继续使用的公开 feed 一起销毁；只清 auth Provider，则可能让私有内容残留。

## 测试时覆盖 Provider 边界

Riverpod 的 ProviderScope 可在测试中替换 API 或 Repository，验证页面加载态和失败重试。测试覆盖的是注入边界下的行为，不应把 Provider 本身存在当作架构正确的证据。应至少测试：加载失败后重试、会话切换后私有数据不串、公开列表仍可继续显示。

## Provider 重建也是生命周期工具

Provider 作用域可用于在会话变化后重建只属于当前用户的数据依赖。做法不是全局无差别刷新，而是让私有依赖观看会话代次，代次变化后换实例；公开 Repository 可保留其缓存。对带资源的 Provider 要考虑 dispose 与旧 Future，取消不了的 HTTP 请求也必须在结果回写前核对 epoch。

测试可用 ProviderContainer 覆盖 Session 或 Repository，再验证切换身份后拿到新实例、旧请求结果被丢弃。依赖注入不是测试的唯一理由，关键是让生命周期和数据归属清晰可读。

## 项目中的 Provider 数量少，但边界明确

项目并未把每个页面都建成 Provider。`sessionProvider` 是 ChangeNotifierProvider，因为 `AppSession` 持有认证恢复、主题与用户状态；`repositoryProvider` 从会话取 Repository；未读数用 `FutureProvider` 并监听 `(userId, epoch)`；互动变更则通过 `StreamProvider` 暴露 revision。编辑输入仍由页面 State 和 controller 持有。

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

这段与项目 `session.dart` 的 Provider 声明一致。`select` 观察用户 ID 和会话 epoch，可避免主题变化等无关通知触发未读请求。Provider 生命周期应与数据更新频率匹配，不是把整个应用状态塞进一个 notifier。

## 异步依赖组合不应放在 build

项目审阅曾发现会员首页在 `build` 内启动新统计 Future，导致无关重建重复请求。修正方式是由可观察的 Provider/Repository 持有请求，或将一次性 Future 缓存在 State 初始化阶段；先确定刷新触发点，再写异步加载代码。

## 小结

先按所有权、持久性和身份范围分类状态，再选择 Provider 作用域。应用级依赖统一装配，服务器资源走 Repository，临时编辑值留在页面，本机恢复副本单独隔离；会话 epoch 则把账号切换变成可验证的清理边界。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [Refresh Token 旋转与并发 401]({{LINK:M4-09}})
- [三类状态不要都塞进 Zustand]({{LINK:M2-05}})

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

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、M4-09、M2-05 发布后回填站内链接
- [ ] 示例 Provider 与当前实际声明核对
- [ ] 已删除本辅助区
