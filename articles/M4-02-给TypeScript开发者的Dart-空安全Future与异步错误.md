# 成为全栈·Flutter App 篇·给 TypeScript 开发者的 Dart：空安全、Future 与异步错误

> Dart 看起来像带静态类型的 JavaScript，但它的空安全和异步类型会在编译期暴露许多前端运行时才发现的问题。真正的迁移不是换括号，而是把“不确定”表达清楚。

{{IMG:M4-02-封面}}

## 本文目标

从 TypeScript 开发者的熟悉经验出发，掌握 Dart 非空类型、可空值、Future 和异常传播，并理解它们在 Flutter API 调用中的意义。

## 前置知识

读者熟悉 TypeScript 的 `Promise`、`null`/`undefined` 与 async/await。本文示例对应 `flutter-app/lib` 中的 Flutter 客户端；项目使用 Dart 3.13.1，类型生成代码来自冻结 OpenAPI。

## 空安全把“可能没有”写进类型

Dart 默认类型不可空：`String title` 不能接收 `null`。需要允许缺省时写 `String? summary`，读取前通过分支、`??` 或安全调用处理。

```dart
String displaySummary(String? summary) {
  final value = summary?.trim();
  if (value == null || value.isEmpty) return '暂无摘要';
  return value;
}
```

这比到处加 `!` 更有价值。`!` 的意思是“我断言此处不为空”，不是“帮我安全处理空值”。后端字段是否可空应由 API 契约决定；UI 默认值只能解决展示，不得伪造业务字段。

TypeScript 的 `strictNullChecks` 也能表达非空边界，但旧项目中 `any`、类型断言、未启用严格检查等会绕过它。Dart 的静态检查让默认路径更难忽略缺省值，仍无法替代运行时校验：网络 JSON 可能不符合预期，接口适配层仍要验证结构。

## Future<T> 是异步结果的类型

`Future<Article>` 表示未来得到一篇文章或以异常失败。它不是文章本身，也不是“稍后一定成功”。

```dart
Future<Article> loadArticle(String id) async {
  final json = await api.getArticle(id);
  return Article.fromJson(json);
}
```

`await` 会把成功值交给后续逻辑；异常继续向调用方传播。如果 UI 入口不捕获，最终会形成未处理异步错误。项目页面常把加载过程放在异步状态组件/页面动作中，明确区分加载、数据和失败，让失败具有可重试出口。

```dart
try {
  await repository.refreshArticles();
} on ApiException catch (error) {
  showMessage(error.userMessage);
} catch (error, stackTrace) {
  reportUnexpected(error, stackTrace);
}
```

捕获范围要贴近能采取补救动作的层。Repository 负责把传输异常映射成业务可理解的错误；页面负责决定呈现和重试。全局吞掉异常、只打 `print`，会让界面误以为操作已完成。

## Future.wait 的“并行”需要失败策略

首页由焦点、最新、热门等模块组成，并不意味着一个请求失败就必须让整页空白。若它们是相互独立的资源，可以各自暴露异步状态，关键模块显示错误，辅助模块保留其它内容。`Future.wait` 默认整体受错误影响，只有真正需要“全部成功后一起提交”的操作才适合这种语义。

```dart
final results = await Future.wait([
  repository.loadFocus(),
  repository.loadLatest(),
]);
```

这个片段只适用于结果必须成组一致的情形；若是独立首页卡片，分开建状态比对 Future 做 `catchError((_) => [])` 更诚实。空列表代表“成功但没有内容”，不能拿来冒充网络失败。

## sealed 与枚举让状态更完整

布尔变量很容易出现 `isLoading=true` 同时 `hasError=true` 的组合。Dart 的 sealed class 可表达互斥状态：

```dart
sealed class LoadState<T> {}
class Loading<T> extends LoadState<T> {}
class Loaded<T> extends LoadState<T> {
  Loaded(this.value);
  final T value;
}
class Failed<T> extends LoadState<T> {
  Failed(this.error);
  final Object error;
}
```

项目会按场景采用明确的状态对象与 Repository 缓存回复；这里展示的是建模方法，不代表所有页面都强制使用这一段自定义类型。好状态模型应让“陈旧数据仍可看、后台刷新失败”的情况也能表达，而非硬塞进三态模板。

## DTO 不等于领域展示模型

{{IMG:M4-02-异步状态}}

OpenAPI 生成的 DTO 帮助检查字段类型，但服务端不同接口可能返回不同包装：有的互动记录是裸数组，有的列表在 `articles` 下，有的阅读历史每项再包一层 `article`。Repository 适配这些差异后，页面消费稳定的 `ReaderArticle` 等模型。

```text
HTTP JSON → OpenAPI DTO / 响应解析 → Repository 映射 → Widget 展示
```

这样，服务端响应形状变化会集中影响适配边界，而不是渗透到每个 Widget。生成工具能发现契约内类型变化，却不能替我们验证服务端实际遵守契约；所以代码生成和真实联调是两类证据。

## 空安全不是来自网络的自动保证

非空 `String` 只能保证 Dart 代码按声明使用值，不能证明未校验 JSON 一定提供了该字段。DTO 解码若遇到服务端字段缺失、类型错误或契约版本不一致，仍要在映射边界产生可诊断的解析失败。把解析错误 catch 后返回空文章，会让坏数据伪装为正常空态。

Dart 的 `late` 也只是把初始化检查推迟到运行期；它适用于生命周期可证明的延迟初始化，不适合作为绕过 nullable 处理的通用写法。优先使用构造时必需参数和不可变字段，让编译器尽早帮助检查。

## 小结

Dart 空安全促使代码明确“值可能不存在”，Future 让异步成功/失败成为类型边界；异常应在有恢复能力的层处理。生成类型、JSON 解析、Repository 映射和页面状态共同构成可靠数据链路，不能把 `!`、空列表或 catch-all 当作省事捷径。

## 延伸阅读

- [Flutter 工程骨架与 OpenAPI 代码生成]({{LINK:M4-03}})
- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [React 请求层封装：统一信封、业务错误与并发 401]({{LINK:M2-03}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Dart`、`Flutter`、`TypeScript`、`空安全`、`异步编程`、`全栈开发`

### 文章简介（250 字以内）

本文面向 TypeScript 开发者解释 Dart 空安全与 Future：如何把可空字段表达进类型，如何让异步错误沿正确层级传播，何时并行加载，以及为什么 OpenAPI 生成类型仍需 Repository 适配和真实接口验证。示例结合 Flutter 内容客户端的数据链路。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

Dart 的类型边界

### 配图 AI 提示词

1. `M4-02-封面`：16:9 中文编程文章封面，TypeScript Promise 迁移到 Dart Future 的桥梁，旁边展示非空 String 与可空 String? 类型标记，简洁深蓝与青绿色，文字“Dart 的类型边界”，避免代码拼写错误。
2. `M4-02-异步状态`：16:9 数据流图，HTTP JSON 经生成 DTO、Repository 映射为领域模型，再进入 Flutter UI 的加载/成功/失败状态，中文标签清晰。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-03、M4-07 发布后回填站内链接
- [ ] 区分本文抽象示例与项目内实际类型
- [ ] 已删除本辅助区
