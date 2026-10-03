# M4 开发 AI 代码第三轮审阅回复

日期：2026-10-03。对应 [第三轮审阅报告](M4-开发AI代码第三轮审阅报告.md)，修改基于第二轮整改后的工作区。

R3-1～R3-6 全部接受并完成。报告指出的 v2 漏检成立：此前的 15/15 只能说明旧工具通过，不能据此认为长函数全部消失。本轮保留三代评审脚本原样，使用 v3 验收，并新增独立 Dart AST 长度检查，不再只依赖同一种词法扫描。

## 逐项整改

路径以 `flutter-app/lib/` 为根；下表行数使用 v3 同一口径。

| 工单 | 调整 | 前后行数 |
|---|---|---|
| R3-1 路由 | 提取 `app/app_bottom_bar.dart` 的 `_AppBottomBar` 与私有导航数据；路由中分离 `_redirect`、`_errorBuilder`、`_shellBranches` 和 `_standaloneRoutes`。保留四分支栈、重复点击当前入口回根、会话恢复及私有页面回跳。 | `createRouter` 196 → **20**；两组路由分别 33、66 行 |
| R3-2 首页 | 提取 `_BrandTitle`、`_HomeLatest`、`_HomePopular`、`_PopularArticle`。最新分区组合焦点与最新文章标题，热门分区使用独立摘要卡，继续走同一仓库。 | `build` 127 → **21** |
| R3-3 搜索 | 提取 `_SearchHeader`、`_SearchResults`、`_SearchSuggestions`；输入控制器、关键词、搜索历史及清空操作留在宿主。结果按关键词建立列表身份。 | `build` 121 → **14** |
| R3-4 焦点轮播 | 提取 `_StoryCarousel`、`_StoryCard`、`_PageDots`；宿主持有 PageController 和当前索引，展示组件只接受必要数据与回调。 | `build` 120 → **20** |
| R3-5 网络请求 | 提取 `_shouldRefresh`、`_retryAfter`、`_decode`，错误文案移到类级 `_messages` 常量。保持 401/1002 刷新资格、GET 一次且最多 3 秒等待、字段错误和失效会话处理。对提取后新增的 await 边界补充会话代际检查，防止旧账号响应继续派发。 | `_request` 119 → **64**；辅助方法分别 4、32、28 行 |
| R3-6 分页列表 | 提取 `_samePrefix` 复用原完整摘要比较，`_applyPage` 统一三分支：私有列表即时替换、公共列表提示更新、常规分页去重追加。 | `load` 85 → **54**；辅助方法分别 3、22 行 |

对 R3-1 建议的具体实现有一处调整：路由组使用私有工厂函数，不声明成常量。`GoRoute`/`StatefulShellBranch` 不是 const 构造，而且每个 Router 应创建自己的分支与 Navigator key。分组目的已实现，没有将导航 UI 当配置豁免。

### 独立检查带来的补充

AST 以整个声明计行，包含 `@override`，发现 `tags_page.dart:build` 为 81 行（与 v3 起算位置不同）。顺带提取 `_TagCard`，保留筛选、计数和编码后的跳转地址。此项不是为了调整检测阈值，而是把可独立理解的标签卡片移出长 build。

## 非阻塞观察的处理

1. **已处理**：`/reader/overview` 纳入 `CacheKeys.overview`，字符串不变，账号隔离和磁盘键兼容性不变。
2. **登记保留**：`editor.dart` 400 行、`article_page.dart` 394 行。本轮未修改它们；后续增加职责时先拆已有组件，不通过压缩空行规避门禁。它们仍是 part 宿主，文件数不代表模块数。
3. **保留导出入口**：`discovery.dart`、`shared/widgets.dart` 目前仅供测试使用，文件头已说明；本轮不把合法兼容入口的迁移混入功能结构整改。
4. **既有依赖方向保持**：报告所述 core → features 依赖未在本轮调整，工程记录继续明确这不是严格单向领域分层。
5. **主题豁免保持**：`AppColors.copyWith` 是逐字段回填配置，v3 为 85 行，AST 完整声明为 86 行；单列登记，不机械拆分。

## 实测与证据

- [静态分析](../evidence/code-review-r3/analyze.txt)：`flutter analyze`，**No issues found**。
- [完整测试](../evidence/code-review-r3/flutter-test.txt)：`flutter test`，**42 项通过**（原 36 项 + 本轮 6 项）。
- [v3 门禁](../evidence/code-review-r3/quality-v3.txt)：**15 PASS / 0 FAIL**；122 文件 / 10918 行，识别 457 个函数；非主题最大函数 79 行，控制流最大嵌套 3 层，中文注释 216 处。
- [v3 自检](../evidence/code-review-r3/quality-v3-selftest.txt)：通过；保留评审提供的缺陷注入，不修改断言。
- [独立 AST 结果](../evidence/code-review-r3/ast.json)：非主题超过 80 行的声明为 **0**；保留全部按长度排序的条目，含命名参数和 record 返回方法，供复查。
- [AST 自检](../evidence/code-review-r3/ast-selftest.txt)：命名参数、record 返回类型、带长内层闭包的箭头函数均可检出。

本轮新增测试经页面公开入口与 API/缓存接口验证行为，未依赖私有组件名称：

| 测试 | 验证目的 |
|---|---|
| 公共文章首屏变化 | 原列表继续显示，出现更新提示，不将新旧结果直接混合 |
| 私有文章首屏变化 | 立即显示最新列表，不残留旧条目或公共更新提示 |
| 字段错误解码 | 保留字段、错误文案、HTTP 状态与 Retry-After 信息 |
| 匿名过期及长限流 | 匿名 401 不刷新 token；超过等待上限的 429 不重试 |
| 轮播前进/后退 | 可见文章和页码同步 |
| 恢复期的受保护路由 | 先等待恢复、后进入登录并保留原目标；设置页仍可公开访问 |

已有并发刷新、退出丢弃在途响应、429 不重放写请求、首页与搜索渲染、主题和认证校验等回归继续通过。

### 可复跑命令

在 `flutter-app` 执行：

```sh
flutter analyze
flutter test
python3 ../docs/flutter-app/review/check_code_quality_v3.py
python3 ../docs/flutter-app/review/check_code_quality_v3.py --selftest
```

独立检查脚本为 [check_dart_ast.dart](check_dart_ast.dart)。使用本机 Flutter SDK 自带 analyzer 的 package config，无需修改 APP 的 pubspec 或运行时依赖：

```sh
# FLUTTER_ROOT 设置为实际 Flutter SDK 根目录；本机为 /opt/homebrew/share/flutter
FLUTTER_ROOT=/opt/homebrew/share/flutter
dart --packages="$FLUTTER_ROOT/packages/flutter_tools/.dart_tool/package_config.json" \
  ../docs/flutter-app/review/check_dart_ast.dart lib
dart --packages="$FLUTTER_ROOT/packages/flutter_tools/.dart_tool/package_config.json" \
  ../docs/flutter-app/review/check_dart_ast.dart --selftest
```

AST 检查覆盖构造函数、方法、具名函数及匿名闭包的声明长度，排除生成代码并单列主题豁免；它不替代控制流门禁、功能测试或性能验证。不同扫描器的函数数量和注解行数口径不同，不以数量相等作为正确性判断。

本轮未重跑模拟器/真机集成测试、截图对比及性能测试，未向生产接口写入数据。不将以前的运行记录列作本轮证据，也不自行给出质量分数。
