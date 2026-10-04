# 成为全栈·Flutter App 篇·测试分层：单元、Widget、集成与线上只读验证

> 一条绿色测试命令只能证明它实际覆盖的部分。Flutter APP 同时包含纯业务逻辑、Widget、原生平台和真实 API；测试应分层，也必须限制生产环境的写入风险。

{{IMG:M4-26-封面}}

## 本文目标

梳理 Flutter 工程的单元、Widget、集成和线上只读验证边界，说明各类证据回答什么问题，以及如何隔离生产写入。

## 前置知识

熟悉 Flutter test、integration_test 和 API 环境配置。项目测试在 `flutter-app/test/`、`integration_test/` 与 `tool/verify_backend.mjs`。

## 测试金字塔不是测试数量竞赛

纯函数测试适合验证分页去重、目录标题匹配、缓存键、错误映射和评论循环保护；Widget 测试验证加载/空/错状态、表单校验、主题和尺寸布局；集成测试验证登录、投稿、评论、上传等真实端到端流程。

```text
Unit       → 规则/映射/竞态辅助函数
Widget     → 页面状态与交互组合
Integration→ Flutter + 本地后端 + 模拟器完整路径
Read-only  → 生产匿名公开读取的可达性/样本行为
```

各层成本不同，不能把全部逻辑写成模拟 HTTP 的 Widget 测试，也不应把线上账户用作日常写集成环境。

{{IMG:M4-26-测试矩阵}}

## Flutter 本机质量门禁

```bash
cd flutter-app
node tool/generate_contract.mjs
flutter analyze
flutter test
node tool/verify_backend.mjs
```

生成模型和 analyzer 处理类型漂移，测试覆盖核心状态机，后端验证脚本检验隔离 API。Android 集成测试运行在单独本地 11002 后端和 `.local` 数据目录中，测试账号与线上分离；写操作真实发生，但目标是可清理的测试数据。

## 生产环境只读，不是“少写几条”

生产验证限定公开匿名读取，例如分类、文章列表、正文和缓存命中。不要用线上真实账号测试投稿、评论、收藏或删除。使用独立脚本/测试入口校验 base URL，避免调错成生产写入地址；README 中隔离后端脚本明确只接受本地测试端口。

生产只读 profile 记录了同一模拟器在某网络下的缓存读取样本。它能说明那次特定公开资源链路运行，不证明所有用户、设备、接口和网络都正确。

## 按失败路径设计断言

并发 401 只刷新一次、旧账号响应被丢弃、429 读写策略不同、评论父链循环终止、目录异步到达仍可绑定、上传失败保留正文，这些测试比再测一遍静态首页更有价值。断言应检查状态和副作用次数，而不只是 widget 文本出现。

## 本机通过仍有平台边界

当前 Flutter analyze 和测试通过，Android Pixel 8 模拟器关键流程验收完成。没有完整 Xcode，所以 iOS 构建/真机、系统相册相机权限、平台深链和商店签名未验收；远端 CI 是否执行也不能从 workflow 文件存在推断。

## 失败注入比重复成功截图更能发现边界

认证测试可让多个请求同时收到 401，断言 refresh endpoint 只调用一次；缓存测试先填充，再断网读取，检查旧内容是否按策略保留；投稿测试使创建成功后的图片上传失败，确认稿件 ID 和正文没有丢失；评论测试故意构造父链循环，断言渲染终止。

```text
Arrange: 准备隔离 API / fake response / 会话状态
Act:     触发用户动作或并发竞态
Assert:  检查 UI 状态 + 请求次数 + 数据副作用
```

只断言“页面出现成功”可能漏掉重复 POST、旧账号数据回填和无边界重试。对于生产只读脚本，应显式拒绝非 GET 方法，并在启动前核对 base URL，形成可审计的防护。

## 测试替身应逼近竞态，而非堆满实现细节

项目使用 Dio `HttpClientAdapter` 构造可控响应，Completer 让测试暂停网络、再按指定顺序放行，从而验证并发刷新和迟到响应。缓存测试注入可控时钟与 BlobStore，检查 fresh/stale/maxAge 变化，而不是 sleep 几分钟等 TTL。

```dart
final gate = Completer<CacheReply>();
var requests = 0;
Future<CacheReply> fetch() {
  requests++;
  return gate.future;
}
final reads = List.generate(
  10,
  (_) => cache.get('one', policy, fetch),
);
gate.complete(CacheReply({'id': 1}));
await Future.wait(reads);
expect(requests, 1);
expect(cache.metrics['joined'], 9);
```

这是项目 `test/cache_test.dart` 的并发请求合并用例核心：十个调用共享一个 Future，网络只请求一次，其余九个加入已有任务。测试初始化时使用禁用磁盘的 BlobStore 和可控时钟，tearDown 关闭 DataCache。避免 mock 复制所有生产分支，优先让一个测试针对一条重要不变量并验证副作用次数。

## 集成测试依赖被隔离的真实服务，而不是生产模拟

项目集成命令指向 Android emulator 的 `10.0.2.2:11002` 本地后端，数据库和上传文件落到被忽略的 `.local/`；测试会员与线上账号不同。测试中创建投稿、评论和上传图片是真实 HTTP 副作用，只是目标为可重置隔离库。

生产 profile 测试只做匿名公开读取，并将结果写入证据文件；代理仅用于模拟器网络连通，不关闭 TLS 校验，也不修改 release 网络策略。任何测试在启动前都应打印/断言目标 host 和 HTTP method allowlist，避免环境变量被误设后直写生产。

## 小结

测试证据必须写清环境、对象和边界。单测证明规则、Widget 测试证明界面状态、隔离集成测试证明端到端流程，线上只读只证明公开访问样本。将生产写入与本地测试库隔离，既保护真实数据，也能让测试可重复。

## 延伸阅读

- [Flutter 缓存与图片优化]({{LINK:M4-24}})
- [构建与发布准备：Android、iOS 和签名边界]({{LINK:M4-27}})
- [质量门禁：契约测试、会话竞态与浏览器验收]({{LINK:M3-22}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter测试`、`单元测试`、`Widget测试`、`集成测试`、`测试策略`、`全栈开发`

### 文章简介（250 字以内）

Flutter APP 的质量门禁覆盖纯逻辑、Widget 状态、模拟器端到端和线上公开只读，各层证据不能互相替代。本文结合项目实际命令、Android 隔离后端和竞态测试，说明如何防止生产写入，并明确 iOS 真机、商店签名和远程 CI 尚未验收的边界。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

每类测试只证明一部分

### 配图 AI 提示词

1. `M4-26-封面`：16:9 中文测试工程封面，Flutter 单元、Widget、集成、本地 API、生产只读五层金字塔，生产写入与隔离本地库明显分开。
2. `M4-26-测试矩阵`：16:9 测试矩阵图，行是认证竞态/Markdown目录/投稿上传/缓存，列是 unit/widget/integration/production-read-only，标出各自验证范围。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-24、M4-27、M3-22 发布后回填站内链接
- [ ] 测试命令与 flutter-app/README.md 核对
- [ ] 已删除本辅助区
