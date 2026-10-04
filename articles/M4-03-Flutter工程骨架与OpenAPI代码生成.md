# 成为全栈·Flutter App 篇·Flutter 工程骨架与 OpenAPI 代码生成

> 代码生成能减少重复声明，却不会自动给你一个正确的应用架构。生成模型、HTTP 传输、业务适配和页面状态仍然需要清晰边界。

{{IMG:M4-03-封面}}

## 本文目标

沿着 Flutter 项目的真实目录和契约生成工具，理解跨端应用如何复用 OpenAPI、哪些代码适合生成、哪些必须由工程师适配，以及如何避免生成文件成为新的手写孤岛。

## 前置知识

了解 REST API、JSON 和 Flutter/Dart 基础。仓库根目录中的 `docs/api/openapi.v1.yaml` 是共享契约；实现位于 `flutter-app/`，不是已废弃的 `app-frontend/`。

## 工程结构服务于依赖方向

```text
flutter-app/lib/
├── app/                 # Riverpod 装配、路由、会话、主题
├── core/generated/      # OpenAPI 生成模型
├── core/network/        # Dio、端点、信封、鉴权与错误
├── core/cache/          # 数据与图片缓存基础设施
├── core/markdown/       # 阅读器 Markdown、代码块和 token 缓存
├── features/            # discovery/article/auth/member/editor/comments
├── features/data/       # Repository、读取模型、缓存策略
└── shared/              # 页面框架、状态视图、列表等公共组件
```

目录名不能自动保证分层正确。项目经过代码审阅后明确：这是便于维护的实用分层，不是严格的 Clean Architecture；某些展示组件会依赖共享 UI，`features/data` 组合业务读取。文章应描述真实依赖，而不是为了术语整齐声称“所有 core 都与 Flutter 无关”。

{{IMG:M4-03-目录}}

## 生成什么：让契约替代重复 DTO

本项目通过 `flutter-app/tool/generate_contract.mjs` 读取冻结 YAML 并生成 `lib/core/generated/models.dart`。生成文件可重建，不应直接手改；字段变更要先更新契约，再运行生成脚本和 analyzer。

```bash
cd flutter-app
node tool/generate_contract.mjs
flutter analyze
```

这一步能证明：当前生成器可从契约产出 Dart 类型，代码通过静态检查。它不能证明生产服务真实返回与契约完全一致，也不能替代接口行为测试。生成器依赖仓库锁定的解析工具，运行前需有 `node-backend/node_modules`；版本和路径以项目脚本为准。

## 不要把生成 DTO 直接铺满 Widget

契约常描述通用接口形状，而 UI 需要稳定、适合呈现的数据结构。项目在 `features/data/reader_models.dart`、`repository.dart` 等边界映射模型；原因不是“多一层更高级”，而是服务端响应确有差异。

```text
生成 DTO / JSON
      ↓ 解析与适配
Repository 领域读取模型
      ↓
页面与共享 Widget
```

例如搜索列表响应位于 `articles` 字段、点赞记录可能是裸数组、阅读历史元素包裹文章。若 Widget 直接解码这些 JSON，接口小变化会让页面到处出现 `map['article']`。Repository 把传输包装差异消化掉，页面只需要明确的文章与分页模型。

## API Client 与 Repository 的职责不同

`core/network/api_client.dart` 统一处理 Dio 请求、Authorization、业务信封、刷新、限流和错误分类；Repository 决定读取哪个资源、如何映射、采用哪条缓存策略；页面组织输入、展示和用户动作。

```text
Widget：点击刷新
  → Repository：取文章流并决定缓存策略
  → ApiClient：发 HTTP、解析信封、处理 401/429
  → Repository：映射稳定模型
  → Widget：显示数据或可重试错误
```

不要让 Repository 重复实现 token 刷新，也不要让 ApiClient 知道“首页热门卡片”。一个管通用传输语义，一个管业务读取组合。

## 生成代码应被版本控制并可重复验证

提交生成文件能让 IDE/analyzer 与构建直接使用；更重要的是生成过程必须可复现。CI 或本机门禁先生成，再检查 Git diff，防止契约修改而模型未更新。当前仓库 README 提供 `node tool/generate_contract.mjs`、`flutter analyze` 和测试命令；这些证据比“我装了生成包”更有意义。

生成器输出是外部契约输入，应检查文件头和生成命令，避免为了一个字段在生成文件中手改后又被下一次生成覆盖。手写适配代码应放在生成目录之外。

## 契约变更是一条完整工作流

当后端增加字段时，不应先在 `models.dart` 手工补属性。更可靠的顺序是更新 OpenAPI schema 与示例，检查 operation 的 required/nullable/enum，运行生成器，查看生成 diff，再更新 Repository 适配与 Widget 状态，最后运行 analyzer、单测和隔离后端联调。

```text
OpenAPI change → regenerate → inspect diff → adapt → test → integrate
```

如果接口只是契约新增可选字段，旧客户端可能无需展示；如果错误码或状态转换改变，则不仅是类型变化，需要更新业务动作和失败测试。代码生成帮忙对齐结构，变更影响仍要由开发者分析。

## 小结

OpenAPI 生成模型减少跨端 DTO 漂移，但正确工程仍需要生成器、网络客户端、Repository 适配和 UI 状态各司其职。目录只是线索；要用真实响应形状和测试验证边界。复用的是契约与业务语义，不是 Flutter 页面代码。

## 延伸阅读

- [契约先行：设计一套被六个端复用的 API]({{LINK:M0-05}})
- [Dio + Repository：统一响应信封与模型适配]({{LINK:M4-07}})
- [前端 OpenAPI 生成类型为什么请求函数仍然手写]({{LINK:M2-04}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`OpenAPI`、`代码生成`、`Dart`、`API设计`、`软件架构`

### 文章简介（250 字以内）

结合 Flutter 项目目录和 OpenAPI 生成脚本，拆解生成 DTO、Dio API Client、Repository 与 Widget 的职责边界。代码生成减少契约重复，却不保证真实接口行为正确；文章进一步说明模型适配、可重复生成和静态检查该如何配合。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

生成代码不等于生成架构

### 配图 AI 提示词

1. `M4-03-封面`：16:9 中文技术封面，OpenAPI YAML 契约经生成器形成 Dart DTO，再流入 Dio、Repository、Flutter Widget 的分层数据管线，深蓝背景、青绿箭头，标题“生成代码不等于生成架构”。
2. `M4-03-目录`：16:9 分层工程目录图，app、core/network、core/generated、features/data、features、shared 各自职责标注，突出单向数据流和真实工程目录。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M0-05、M4-07、M2-04 发布后回填站内链接
- [ ] 生成器命令执行结果与文章版本对应
- [ ] 已删除本辅助区
