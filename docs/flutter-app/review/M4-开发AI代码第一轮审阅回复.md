# M4 开发 AI 代码第一轮审阅回复

日期：2026-10-03。对应《M4-开发AI代码第一轮审阅报告》，整改基线为 `d4450fe`。本轮修改 Flutter 工程及相关文档，不涉及后端、管理后台、网站前台或依赖升级。

## 处理结论

采纳 A-1～A-14 的整改方向并完成代码调整。保持已确认原型的颜色、尺寸、图标、页面结构，以及现有缓存和账号隔离语义。原审阅门禁脚本未修改；按原脚本验收，不自行提高阈值或改写断言。

本轮解决的是职责划分、可读性和维护成本。长函数不是掉帧的充分证据，拆成组件也不自动证明性能提升；下文的耗时只代表特定数据读取序列，不代表首帧、帧率或真机性能。

## 逐项处理

| 工单 | 处理 | 代码与说明 |
|---|---|---|
| A-1 文章页巨型 build | 已完成 | `features/article/` 拆出评论入口、面包屑、栏目、标题、作者栏、摘要、标签、互动区、相邻文章和阅读内容；目录/分享/更多操作由 `article_navigation.dart` 管理。主 build 29 行。 |
| A-2 会员页嵌套 content | 已完成 | `features/member/member_page.dart` 使用 `_MemberContent`，身份卡和统计分别为独立组件；主 build 28 行，不再在 build 内定义 content。 |
| A-3 其他长方法 | 已完成 | 设置账号/外观、稿件操作、文章卡片正文、评论楼层/引用/操作、Markdown 代码块/语言栏分别抽成组件；WebView 导航委托与初始化分开；编辑器分离表单、预览、工具栏、保存条、发布信息和恢复草稿。 |
| A-4 中文注释 | 已完成 | 手写公共类补充职责说明，在缓存代际、TTL、磁盘写入、图片隐私、收藏全量扫描、正文/目录一致性、乐观回滚处说明约束与原因。生成模型继续由生成器维护，没有手改生成物凑注释。 |
| A-5/A-5b/A-5c/A-5d 设计令牌 | 已完成 | 页面消费 `AppType`、`AppInsets`、`AppSpacing`、`AppRadius`；保留 11.5/12.5/13.5/15.5 等已确认细分字号，而非用相近字号替换。语法高亮色值移入 `AppSyntax`，继续按主题切换。 |
| A-6 仓库职责与策略重复 | 已完成 | `features/data/` 包含 `ArticleReader`、`FavoriteIndex`、`ReactionStore`、`MemberOverview`、网络响应包装与领域模型。`CachePolicyTable.family()` 统一资源分类，读策略、响应格式与写后失效共用分类结果；仓库保留组合和协调职责。 |
| A-7 文件粒度 | 已完成 | 发现/会员各公开页面独立文件，公共组件按职责拆入 `shared/widgets/`。旧入口保留导出，内部改为明确导入。页面私有组件使用 `part` 保持库内私有，不传入整个页面 State。主题也分为色板、颜色扩展、尺寸、组件装配和状态展示。 |
| A-8 API 端点集中 | 已完成 | `core/network/endpoints.dart` 集中固定端点与动态路径构造，调用方使用常量或方法；动态文章标识编码处理。应用导航不复用 API 常量，避免将两套路由错误绑定。 |
| A-9 并行数组/下标协议 | 已完成 | 底部导航使用同条记录的图标与名称；会员统计使用 `favorites/likes/history/articles` 命名字段，生产端与消费端同步修改，点赞总数继续扫描全部分页。 |
| A-10 局部函数与深层回调 | 已完成 | `readArticle()`、`toggleLike()`、`toggleFavorite()` 为明确方法；缓存事件变为生命周期处理方法，分页结果安装、错误安装、磁盘索引恢复各有边界。点赞和收藏仍有独立忙碌状态和失败回滚。 |
| A-11 缓存键与魔法数 | 已完成 | `CacheKey` 排序编码并用模式匹配容错解析，保持 v1 磁盘兼容；别名恢复同时检查 API 环境、public 范围和正文前缀。`CacheLimits` 集中数据、图片、正文、搜索、索引、快照和高亮容量；`CacheTags.searchResults` 消除缓存底层对 `/search` 路径的依赖。 |
| A-12 重复构建主题 | 已完成 | `ReaderApp` State 持有两套 `late final ThemeData`，会话通知和主题切换不重复装配主题。 |
| A-13 tags 冗余封装 | 已完成 | 仅保留 `tags()`，删除 `tagsList()`。 |
| A-14 429 重试方法 | 已完成 | 重试 `Options` 显式设置 `method`，仍仅允许 GET 单次有界重试；原代码默认 GET 在当前分支是正确的，此项属于显式化与防误改。 |

## 验证与证据

- 原脚本 `python3 ../docs/flutter-app/review/check_code_quality.py`：**PASS=13 / FAIL=0**。
- `flutter analyze`：**No issues found**。
- `flutter test`：**34 项通过**，原 30 项保留；新增缓存键 v1 兼容/损坏处理、资源策略契约、命名会员统计与跨页点赞计数、语义搜索容量淘汰 4 项测试。
- Android 模拟器线上只读 Profile 缓存回归：通过。首次序列 6 次请求，内存复用 14ms，重新创建缓存实例后的磁盘恢复 100ms；两次复用及 Tab 返回均无新增请求，模拟弱网的旧值展示/强刷失败通过。见 [本轮缓存证据](../evidence/code-review-r1-cache.json)。
- Android 模拟器 + 11002 隔离后端集成测试：**2 项通过**，覆盖阅读、登录、保存草稿、预览、送审、收藏、评论、深色模式，以及真实文件上传/下载。截图单独保存至 [本轮截图目录](../evidence/code-review-r1/)，未覆盖原验收图片；测试仅暂存并恢复隔离环境的草稿，不再清除所有 `draft.*`。
- 上述 Profile 验收第一次在等待首页“焦点阅读”时超时，数据阶段未报告断言失败；增加失败时可见文案诊断后，以相同等待阈值重跑通过，未修改业务逻辑或放宽断言。未得到足以确定首次超时根因的证据，不能声称修复了一个已定位的页面故障。

结构指标来自原门禁解析器，详见 [机器可读指标](../evidence/code-review-r1-metrics.json)。该脚本不完整覆盖多行签名和箭头表达式，因此“最大函数长度”仅表示脚本识别范围，不能当作完整 Dart AST 的证明。除门禁外，本轮也拆分了箭头体中的编辑器、会员内容与 Markdown UI。

| 指标 | 本轮 |
|---|---:|
| 文章页主 build | 29 行 |
| 会员页主 build | 28 行 |
| 最大文件 | 399 行 |
| ReaderRepository 文件 | 293 行 |
| 脚本识别的最大函数 | 79 行 |
| 脚本识别的最大嵌套 | 4 层 |
| 非主题代码裸字号/色值 | 0 / 0 |
| EdgeInsets 构造（脚本口径） | 7 处 |

## 对报告口径的补充

1. **不把代码长度等同于运行性能。** 本轮采纳拆分要求，但没有基于行数宣布帧率提升，也不自行宣布评分达到 100。
2. **端点字面量应排除 App 导航。** `/member/...`、`/browse?...` 等属于 go_router 页面地址；它们没有被机械搬进 HTTP 端点类。本文不拿两者混合的字符串总数声称网络端点重复数。
3. **主题拆分不用于“搬家凑注释”。** 除原脚本口径外，指标另行记录排除整个 `app/theme/` 目录的中文注释数量，仍超过 150 处。
4. **分层不是严格单向。** 报告称 core 不依赖 features，实际 Markdown 展示使用共享图片与内部网页页面；本轮未把这种既有展示层依赖包装成纯领域架构。缓存/网络基础设施与 UI 的边界、当前组织方式已补入 [工程架构记录](../08-工程架构与实施记录.md)。
5. **平台范围不扩大。** Android 模拟器运行不等于 iOS 真机验收；磁盘恢复测试重新创建缓存实例，不等于测量完整应用冷启动；没有进行生产写操作或发布。

## 后续修改约束

新增 API 时同时核对 `Endpoints`、资源分类/读规则、响应格式、写后失效和账号范围。新增展示组件优先消费语义令牌；不要为了缩短文件将整页 State 传入子组件。修改缓存生命周期时必须保留并发、强刷、退出、磁盘恢复及失败回滚测试。

## 复跑入口

在 `flutter-app/` 中执行：

```sh
flutter analyze
flutter test
python3 ../docs/flutter-app/review/check_code_quality.py
FLUTTER_CACHE_EVIDENCE=../docs/flutter-app/evidence/code-review-r1-cache.json flutter drive --profile -d emulator-5554 --driver=test_driver/cache_results.dart --target=integration_test/cache_acceptance_test.dart --dart-define=DEV_HTTP_PROXY=10.0.2.2:7897
FLUTTER_SCREENSHOT_DIR=../docs/flutter-app/evidence/code-review-r1 flutter drive -d emulator-5554 --driver=test_driver/screenshots.dart --target=integration_test/app_test.dart --dart-define=API_BASE_URL=http://10.0.2.2:11002/api/v1
```

本地写入验收要求 11002 隔离后端及原有验收账号/数据；测试自身拒绝其他 API 地址。代理参数对应本机现有开发网络配置，不进入发布配置。门禁文本另存于 [本轮门禁结果](../evidence/code-review-r1-gate.txt)。最终手写业务代码（排除整个主题目录）中文注释为 182 处，原脚本口径为 264 处。

最终已重新构建并在 `emulator-5554` 启动正常 `lib/main.dart`，使用默认线上 API `https://api-befull.kao9.com/api/v1`。脱离调试连接后进程仍在运行，已核对前台 Activity 为 `com.yingzhou.fullstack_reader/.MainActivity`。本轮未提交 Git commit，改动保留在工作区供复审。
