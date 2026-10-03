# M4 Flutter APP 代码 · 第一轮审阅报告

> **审阅对象**：`flutter-app/`（`lib/` 下 23 个 Dart 文件、8364 代码行）
> **审阅基线**：commit `d4450fe`（feat: 完成Flutter APP核心功能开发与缓存优化）
> **审阅视角**：代码工艺（优雅度 / 组件抽离 / 公共逻辑抽离 / 中文注释 / 面条代码）
> **审阅人**：eno（前端与移动端架构分析）
> **日期**：2026-10-03
> **功能完成度**：不在本报告评分范围内。功能与契约层面的验证见 `09-开发交付与本机验收.md`、`14-缓存优化实施与验收.md`，本报告只评**代码质量**。

---

## 1. 结论速览

| 维度 | 满分 | 得分 | 一句话归因 |
|---|---:|---:|---|
| 架构与分层 | 20 | **16** | 分层正确、依赖方向干净；扣在 `ReaderRepository` 职责过载 |
| 组件抽离与复用 | 25 | **13** | `shared/` 层组件设计得体，但 **features 层页面内零子组件抽离**，最大 build 324 行 |
| 公共逻辑抽离 | 20 | **12** | 缓存/锚点/错误码都抽了；但端点字面量散落 149 处、路径判断三处重复 |
| 注释与可读性 | 20 | **6** | **业务代码中文注释 0 处**（用户明确要求），仅 `app_theme.dart` 有注释 |
| 代码整洁度 | 15 | **10** | 无调试残留、analyze 0 issue 是加分；扣在 60 处裸 `fontSize`、92 处裸 `EdgeInsets` |
| **合计** | **100** | **57** | **工程骨架与契约纪律优秀，代码工艺层欠账集中** |

**一句话结论**：这是一个**工程素养在线、但没做"代码工艺收口"**的交付。架构分层、依赖注入、契约对齐、错误处理链路都达到生产水准；问题几乎全部落在同一个层面 —— **"结构抽离"和"注释"**，即用户本轮明确提出的四项要求中的三项（组件抽离、公共函数抽离、中文注释，外加"不要面条代码"）。

**好消息**：问题类型高度集中、无一是"设计错误"，全部是**可在不动业务逻辑的前提下机械整改**的结构问题。按 §5 清单整改，预计可到 **90+**。

---

## 2. 审阅方法与独立取证

按"**不采信自陈**"纪律，未采信 `flutter-app/.local/*.log` 中开发 AI 自留的日志结论，全部独立复跑：

| 我执行的操作 | 命令 | 结果 |
|---|---|---|
| 静态分析 | `flutter analyze` | `No issues found!`，**EXIT=0** ✅ |
| 单元/组件测试 | `flutter test` | **30/30 通过**，**EXIT=0** ✅（与 `14` 号文档自陈的 30 项一致） |
| 结构量化 | 自写 Python 脚本解析函数边界/注释/装饰/字号 | 见 §3、§4 全部数据 |
| 契约对齐 | 脚本导出 `docs/api/openapi.v1.yaml` 错误码 vs 代码映射表 | **12/12 精确一致** ✅ |
| 调试残留 | `grep -rnE "print\(\|debugPrint\(\|TODO\|FIXME\|HACK"` | **0 处** ✅ |
| 产物污染复核 | `git status --short` | 工作区干净，本轮我**未改动** `flutter-app/` 任何一行 |

环境：Flutter 3.47.1 / Dart 3.13.1（`flutter --version` 实测）。

> 量化脚本对函数边界的识别基于"括号配对 + 字符串感知裁剪"，对 `=>` 单表达式函数不强计长度；`build` 方法长度按含 `@override` 后的方法体起止计算。数据口径如需复核，脚本逻辑已在 §5 验收断言中固化为可复算的形式。

---

## 3. 做得好的六件事（先说优点，均有证据）

### 3.1 分层与依赖方向干净

`lib/` 四层职责清晰，依赖单向：`features → core/shared → app`，`core` 不反向依赖 `features`。`shared/widgets.dart` 只依赖 `core` + `app`，`core/network/api_client.dart` 零业务依赖。这是**教科书式的移动端分层**，也是后面所有缺点的"止损线"——分层对了，整改就只是搬家。

### 3.2 契约纪律达生产水准

- **错误码 12/12 精确对齐**：契约中出现的 12 个业务错误码（`1001–1005 / 2001 / 3001–3003 / 4001 / 5000 / 5001`）与 `api_client.dart:260-273` 映射表**逐一对应，无多无少**。
- **429 只重试读取**：`api_client.dart:225-246` 严格限制为 `method == 'GET'` 且 `retry-after ≤ 3s`，写请求不透明重试 —— 正是冻结口径要求的。
- **可见性铁律遵守**：`repository.dart:269-271` 对非 `published` 内容抛 `3001/404`；预览页走 `private: true` 带令牌路径（`article_page.dart:143`）对应契约的"作者本人放宽"。
- **目录锚点用服务端值**：`reader_markdown.dart:34` `node.attributes['reader-anchor'] = item.anchor!`，且 `ServerHeadingSyntax` 只在 ATX 标题、层级+文本双核对时才消费目录项（L30-37）——**完全符合已冻结的"客户端不自行 slug 化"口径**。这是整个交付里最能体现契约意识的 10 行。

### 3.3 错误处理与并发防护是"想清楚了"的

`api_client.dart` 的单飞刷新（`_refresh`，L110-142）、会话代次（`epoch`，L189/205/213）、旋转写入串行化（`_storageQueue`，L82-88）三件套齐全；`data_cache.dart` 的版本号 + 飞行合并（`_versions`/`_flights`，L184-283）与 `fence`（L285-293）语义正确。这类代码**写错很容易、写对很难**，开发 AI 写对了。

### 3.4 `shared/` 组件库抽离质量高

`shared/widgets.dart` 里 **14 个公开组件类**（`PageFrame`、`StateMessage`、`AsyncPane`、`SectionTitle`、`StatusBadge`、`ReaderImage`、`ArticleTile`、`ArticleFeed`、`SubmitButton`、`UnreadIcon`、`PageIntro`、`ArticleSkeleton`、`CellGroup`、`MenuCell`）都是货真价实的复用件。

其中 `AsyncPane<T>`（`widgets.dart:138-271`）用泛型 + 注入 `load` + `builder` 的方式统一了"加载中/失败/陈旧数据"三态，**并自订阅缓存事件**（L163-185）。这是有设计感的抽象：换任何一个列表页都只需传两个函数。`CellGroup`/`MenuCell` 让"我的"页的功能清单变成 5 行数据而非 5 段布局代码 —— **说明开发 AI 完全具备抽离意识**，这也让 §4 里"features 层不抽"的问题更显得是**没做而不是不会做**。

### 3.5 无调试残留、无 lint 违规

`print` / `debugPrint` / `TODO` / `FIXME` / `HACK` **全库 0 处**，`flutter analyze` 0 issue。这两条看着基础，但在 8364 行的交付里能保持干净，说明有自查习惯。

### 3.6 测试覆盖"难测的点"

30 个单测覆盖的不是"能跑通"，而是**最难测的边界**：并发 401 单飞、退出丢弃迟到响应、429 读写区分、评论跨页重组与环终止、目录重复标题/代码围栏/Setext 三态、320/375/430dp × 1.3 字号溢出。测试选点比数量更能说明问题，这批选点是准的。

---

## 4. 问题清单（按优先级）

### 🔴 P0-1 · 324 行单体 `build`，页面内零子组件抽离

**位置**：`lib/features/article_page.dart:460-783`（`build`，**324 行**，占该文件 41%）

一个方法内顺序堆叠了 **11 个区块**，无一处抽成组件：

| 区块 | 行范围 | 行数 |
|---|---|---:|
| 底部评论输入栏（`bottomBar`） | 464-516 | 53 |
| 顶部 actions（刷新/目录/更多） | 517-536 | 20 |
| 面包屑 + 分类胶囊 | 559-597 | 39 |
| 文章标题 | 598-609 | 12 |
| 作者栏（头像+昵称+元信息） | 610-651 | 42 |
| 摘要块 | 652-676 | 25 |
| Markdown 正文 | 677-682 | 6 |
| 标签 Wrap | 684-695 | 12 |
| 互动按钮区（赞/藏/分享/相邻篇） | 696-769 | 74 |
| 评论区 | 770-776 | 7 |

**为什么是 P0**：`Widget build` 是 Flutter 里**唯一会被框架高频重建**的方法，把它写成 324 行的过程式代码，代价是双重的 —— ① 任何人改动其中一处，都必须通读全篇确认没有跨区块的状态耦合；② 无法对单个区块做 widget 测试（现在只能整体 pump 整页）。

**同类（程度递减）**：
- `member.dart:58-251` `MemberPage.build` **194 行**，内部还嵌套了 **168 行的局部函数 `content()`**（L60-227）—— 等于一个方法里套了一个方法
- `app_theme.dart:483-675` `buildAppTheme` 193 行（可接受，配置型代码天然长，**不建议**拆分）
- `member.dart:257-366` `SettingsPage.build` 110 行 · `member.dart:480-571` `DraftTile.build` 92 行
- `widgets.dart:456-551` `ArticleTile.build` 96 行 · `comments.dart:227-283` `replyBlock` 57 行 · `comments.dart:285-355` `thread` 71 行
- `reader_markdown.dart:72-182` `_CodeBuilder` 111 行 · `web_page.dart:41-103` `initialize` 63 行（嵌套 5 层）

**统计全貌**：148 个函数中 **>80 行的 8 个（5.4%）**、**>120 行的 3 个**；`build` 类方法平均 **90.9 行**，其中 >80 行的 5 个。

**整改方向**（见 §5 A-1~A-3）：把上述区块提为**同文件的私有 `StatelessWidget`**（`_ArticleBreadcrumb`、`_AuthorBar`、`_SummaryBlock`、`_ArticleActions`、`_AdjacentList` 等），`build` 本身收缩到 40 行以内的"组合层"。**不需要新建文件、不需要改状态管理**，是最低风险的重构。

---

### 🔴 P0-2 · 业务代码中文注释为 0

**位置**：全库。`lib/` 下 23 个文件中 **22 个零中文注释**，唯一例外是 `app_theme.dart`（82 处）。

| 指标 | 实测 |
|---|---:|
| 代码行 | 8364 |
| 注释行（含行尾、文档注释） | 135（**1.6%**） |
| 其中中文注释 | 82（**1.0%**） |
| **`app_theme.dart` 之外的中文注释** | **0 处** |
| 英文注释（`app_theme.dart` 外） | 47 处 |

**证据（`app_theme.dart` 之外的全部中文注释）**：

```
（空 —— 业务代码中文注释 = 0 处）
```

**关键点**：`app_theme.dart` 的 82 处中文注释**几乎全部是从 `06-UI设计规范与设计令牌.md` 搬运过来的**（"与 docs/flutter-app/06 一一对应""落地位置""用法"等）。也就是说，**开发 AI 具备注释能力，但在自己原创的业务逻辑上没写**。这不是能力问题，是**标准没落地**。

**为什么扣得重**：这是用户本轮**逐字提出的要求**（"代码要有中文注释"）。同时它在工程上也是真实成本 —— 本交付里有大量"非显然决策"，例如：

| 位置 | 现在的样子 | 缺注释的后果 |
|---|---|---|
| `repository.dart:269-271` | 非 published 抛 3001 | 读代码的人不知道这是**可见性铁律**，会误以为是随手校验 |
| `repository.dart:280-289` | 取 `updatedAt` 二次校验 | 不知道这是防"取目录期间正文被改"的**组合一致性**保护 |
| `api_client.dart:225` | 429 只对 GET 重试 | 英文注释有，但为什么"写操作不能重试"没写 |
| `api_client.dart:131` | `[1002,1003,1004,1005]` 触发登出 | 4 个码分别是什么语义、为什么这几个要清会话，无说明 |
| `repository.dart:335` | `list.length == size ? page + 1 : page` | 这是**用长度猜分页**（裸数组无 total），最需要解释的地方 |
| `blob_store.dart:167` | `while (bodies.length > 100)` | 100 从哪来（§14 容量协议）无引用 |
| `data_cache.dart:121` | `_keyTags.length > 1000` | 同上 |

**整改标准**（见 §5 A-4）：不要求"每行都注释"，要求**三类必注**：
1. **公共 API**（`class` / 公开方法 / 顶层函数）→ `///` 文档注释，说明职责、参数语义、异常情形；
2. **非显然决策**（上面这类"为什么这么写"）→ 行内 `//`，一句话说清**意图与约束来源**（引 `docs/flutter-app/xx` 更佳）；
3. **复杂/易错逻辑**（状态机、并发、索引推算）→ 块注释描述不变量。

明确**不要求**：Getter/Setter、明显的一行转发、纯 UI 布局树（后者的可读性靠组件抽离解决，不靠注释）。

---

### 🟠 P1-1 · 设计令牌体系齐备但被大面积绕过

**这是本报告最"物证确凿"的一条**：`app_theme.dart` 已经把令牌定义得相当完整 ——

```dart
AppSpacing: s1=4 s2=8 s3=12 s4=16 s5=20 s6=24 s8=32 s10=40, page=s4, minTapTarget=44
AppRadius:  rXs rSm rMd rLg rFull
AppType:    displaySmall / headlineSmall / titleLarge / titleMedium
            / bodyLarge / labelLarge / bodySmall / labelSmall
```

**但业务代码几乎不用它们**：

| 令牌 | 应有消费 | 实测裸写 |
|---|---|---|
| `AppType.*`（语义字号） | 全部文字 | **裸 `fontSize` 60 处、17 种数值** |
| `AppSpacing.*` | 全部间距 | **裸 `EdgeInsets.*` 92 处** |
| `AppRadius.*` | 全部圆角 | **裸 `BorderRadius.circular(8)` 12 处**、`circular(99)` 4 处 |

裸 `fontSize` 的 17 种数值分布：`10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 17, 18, 22, 24, 46`。

**为什么是 P1 而非 P2**：这不是"代码风格"问题，是**设计系统失效**问题。设计侧刚刚花了五轮把 `06-UI设计规范` 冻结成"改色只改一处"的唯一事实源，而实现侧用 17 种散落字号绕开了它 —— 后续任何"正文调大 1sp"的需求都变成**全局搜索替换**，且必然漏改。`member.dart:158` 用了 `context.text.labelSmall`（正确用法）而 `member.dart:152` 又裸写 `fontSize: 18`，**同文件内自相矛盾**，说明是习惯未统一而非有意为之。

**附带**：`reader_markdown.dart:96-103` 的代码高亮调色板有 **10 处硬编码色值**（分布在 5 行，如 `0xffc4a0f5` / `0xff8b5cf6`），是全库唯一在 `app_theme.dart`（80 处）之外的色值。既然 `06` 已经定义了 `codeBg`/`codeFg`，语法色也应进令牌（否则深色主题调整会漏掉代码块）。

**整改方向**（§5 A-5）：令牌已存在，**只需替换消费点**。建议同时补一层语义映射让替换变机械（如 `context.text.body`）。

---

### 🟠 P1-2 · `ReaderRepository` 是职责过载的上帝类

**位置**：`lib/features/repository.dart`，**624 行 / 13 个函数 / 7 组互不相干的状态**

它同时承担 **6 项职责**：

| # | 职责 | 相关成员 |
|---|---|---|
| 1 | 缓存策略表 | `policy()` L110-141 |
| 2 | 资源标签推导 | `resourceTags()` L143-162 |
| 3 | 统一读取 + 响应格式校验 | `read()` L183-240 |
| 4 | 文章+目录**组合读取一致性** | `bundle()` L242-307 |
| 5 | **收藏索引状态机** | `_favoriteIndex` `_favoritePage` `_favoriteVersion` `_favoriteComplete` `_favoriteTime` `_favoriteScan` `_favoriteOverrides`（**7 个字段**，散落在 L68-72 与 L82） |
| 6 | 互动状态（赞/藏）内存态 + 乐观更新 | `reactions` `setReaction()` L453-507 |
| 7 | 变更失效推导 + 快照管理 | `_mutationTags()` L509-531 `_mutation()` L533-575 `snapshots` L577-583 |

**两个具体病症**：

① **同一批端点字符串在三处重复判断**（`policy` / `resourceTags` / `_mutationTags`）：
```dart
// policy()          L131: ['/me/favorites', '/me/likes', '/me/history'].contains(path)
// resourceTags()    L148: if (path.startsWith('/me/notifications')) 'notifications'
// _mutationTags()   L514-516: if (path.startsWith('/me/favorites')) ... /me/history ... /me/notifications
```
**加一个端点要改三个地方**，漏一处就是"缓存策略生效了但失效推导没跟上"的隐性 bug。

② **收藏索引的 7 个字段彼此耦合**（版本号 + 游标 + 完成标志 + 时间戳 + 在途任务 + 覆盖表），却和"文章/评论/通知"的读取逻辑平铺在同一个类里。这段逻辑本可独立成 `FavoriteIndex`，有自己的不变量（"只有完整扫描才能判定不在收藏中"），也就可以**单独测试**。

**整改方向**（§5 A-6）：按职责拆出 `CachePolicyTable`（policy+resourceTags+mutationTags 合一）、`FavoriteIndex`、`ReactionStore` 三个协作者，`ReaderRepository` 退化为注入与编排（目标 <300 行）。

---

### 🟠 P1-3 · 文件按"页面数量"堆叠，不做目录级拆分

| 文件 | 行数 | 内含的公开 Widget 类 |
|---|---:|---|
| `features/member.dart` | **1141** | `MemberPage` `SettingsPage` `MemberArticlesPage` `DraftTile` `MemberListPage` `ProfilePage` `NotificationsPage`（**7 个**） |
| `features/discovery.dart` | 736 | `HomePage` `FocusStories` `CategoriesPage` `TagsPage` `SearchPage` `BrowsePage` `AuthorPage`（**7 个**） |
| `shared/widgets.dart` | **1078** | `PageFrame` `StateMessage` `AsyncPane` `SectionTitle` `StatusBadge` `ReaderImage` `ArticleTile` `ArticleFeed` `SubmitButton` `UnreadIcon` `PageIntro` `ArticleSkeleton` `CellGroup` `MenuCell`（**14 个**） |
| `features/article_page.dart` | 784 | 1 个页面（但单 build 324 行） |

（`member.dart` 另有 `_MemberArticlesPageState` 等 **5 个私有 State 类**，故顶层类共 12 个。）

**问题**：`member.dart` 里"个人资料页"和"通知列表页"除了都属于"会员域"之外**没有任何代码关联**，却强制同居一文件 —— 后果是 ① 文件级 diff 噪音大（改通知页要动 1141 行文件的某一段）；② 无法按页面做文件级代码归属；③ IDE 定位靠行号而非文件名。

**整改方向**（§5 A-7）：把 `features/member.dart`、`features/discovery.dart` 改成**同名目录 + 每页一文件**（`features/member/profile_page.dart` 等），`shared/widgets.dart` 按"布局 / 状态 / 列表 / 媒体 / 表单"五类拆。这是**纯搬运**，风险最低、收益最直接。

---

### 🟠 P1-4 · API 端点字面量散落 149 处

**位置**：全库（脚本扫描 `'...'` 形式的路径字面量）

| 指标 | 实测 |
|---|---:|
| 去重后的端点路径 | 51 |
| 端点字面量总出现 | **149 次** |
| 出现 ≥5 次的端点 | 24 个 |

**重复度最高的一批**：

| 端点 | 出现次数 | 分布 |
|---|---:|---|
| `/me/favorites` | **10** | `article_page:283` `repository:131,217,396,403,421` … |
| `/articles` | **9** | `editor:294` `repository:118,157,190,214,322` … |
| `/search` | **8** | `data_cache:84` `router:150` `discovery:50,525,647` `repository:121` |
| `/tags` | **8** | `router:133` `discovery:82,346,624` `repository:115,208` … |
| `/me/history` | **8** | `article_page:123,180` `member:600` `repository:131,218,422` |

**为什么重要**：契约是**冻结**的唯一事实源（53 路径 / 67 操作）。端点字符串散落 149 处意味着 —— 契约回流（例如把 `/me/likes` 改成带分页参数的新路径）时，**没有任何一个地方能一次性改完**，而且编译器帮不上忙（字符串打错不报错，只在运行时 404）。`data_cache.dart:84` 甚至把 `'/search'` 当作**缓存淘汰规则的 key** 使用，与网络层的 `/search` 是同一个字面量、不同语义 —— 这类耦合最危险。

**整改方向**（§5 A-8）：建 `lib/core/network/endpoints.dart`，把路径收敛为常量或**带类型的路径构造器**（如 `Endpoints.articleComments(id, page)`）。这是本报告里**性价比最高**的一条：机械、低风险，但直接决定后续契约变更成本。

---

### 🟡 P2-1 · 平行数组 / 位置索引的隐式契约（3 处）

**① `router.dart:78-111` 底部导航**
```dart
for (var i = 0; i < 4; i++)          // ← 魔法数 4
  ...
  PrototypeIcon(['home','layers','search','user'][i], ...)   // L92
  Text(['首页','分类','搜索','我的'][i], ...)                 // L100
```
两个数组 + 一个硬编码长度，**靠下标隐式对齐**。加一个 Tab 要改 3 处（数组 2 个 + 循环上界），改错顺序**不报错**，只会图标和文字错配。

**② `member.dart:137-159` 统计卡**
```dart
for (var i = 0; i < 4; i++)
  ...
  Text('${data['counts'][i]}')            // L149
  Text(['收藏','点赞','足迹','稿件'][i])   // L157
```

**③ 跨文件隐式契约（最隐蔽的一处）**：`counts` 的**下标含义由生产方决定，被消费方按位置解读**：
```dart
// 生产方 repository.dart:436-442
'counts': [results[0]['pagination']['total'],   // results[0] = /me/favorites
           likes,                               // 单独扫描 /me/likes
           results[1]['pagination']['total'],   // results[1] = /me/history
           results[2]['pagination']['total']],  // results[2] = /me/articles
// 消费方 member.dart:157
Text(['收藏','点赞','足迹','稿件'][i])
```
`results` 数组的顺序在 L421-423 定义，语义靠**位置**传递到另一个文件。若有人调整 `Future.wait([...])` 的顺序（很自然的"整理"动作），**统计数字会静默错位**：收藏数显示成足迹数，且没有任何测试或断言会拦住它。

**整改方向**（§5 A-9）：改为**具名 Map 或 Record**（`{'favorites':…, 'likes':…, 'history':…, 'articles':…}`），消费方按键名取。这类改动会让"顺序"这个维度**从代码里消失**。

---

### 🟡 P2-2 · 局部函数嵌套加深阅读层级

**位置**（三处代表性）：

| 位置 | 形态 | 后果 |
|---|---|---|
| `article_page.dart:133-210` `load()` | 78 行，**嵌套 7 层**，内部再定义 `Future<void> read()`（L141-151） | 要读懂 `load` 得先跳过内嵌函数 |
| `article_page.dart:238-320` `toggle()` | 82 行，嵌套 5 层，单选/收藏两分支合并 | 两个语义不同的操作共用一个方法 |
| `member.dart:60-227` `content()` | 局部函数 **168 行** | 函数套函数，等价于把巨型 build 藏了一层 |
| `comments.dart:227-283 / 285-355` | `replyBlock` 57 行 + `thread` 71 行，均为返回 Widget 的方法 | 本质是"没提成组件的方法" |

**整改方向**（§5 A-10）：局部函数若超过 ~20 行且不捕获大量局部变量，就应提升为**私有方法**（类级）或**私有 Widget**；`toggle(bool)` 按语义拆成 `like()` / `favorite()`。

---

### 🟡 P2-3 · 魔法数字未命名

| 位置 | 数字 | 含义 | 建议 |
|---|---|---|---|
| `data_cache.dart:84` | `{'articleBodies': 100, '/search': 20}` | 每类缓存条数上限（且**每次 `_put` 都重建 Map**） | 提为 `static const` 具名常量 |
| `data_cache.dart:121,123` | `1000` | `_keyTags` 清理阈值 | `_maxKeyTags` |
| `data_cache.dart:235` | `2 * 1024 * 1024` | 单条落盘上限（`14` 号文档已定义） | `_maxPersistBytes` |
| `repository.dart:303,461,480` | `300` | 三个不同语义的容量上限共用同一个数 | 分别命名 |
| `repository.dart:251-253` | `[3]`、`'/reader/article/'.length` | **按位置索引自己序列化的结构** | 见 P2-1 同类问题，应收敛为具名结构 |
| `blob_store.dart:167` | `100` | 正文保留篇数 | 引用 `14` 号文档协议 |
| `image_store.dart:80,97,100` | `10/20 * 1024 * 1024`、`100` | 图片单文件/内存上限/条数 | 命名并集中 |

**特别提示 `repository.dart:251-253`**：
```dart
canonical = ((jsonDecode(persisted) as List)[3] as String).substring(
  '/reader/article/'.length,
);
```
这与 `key()`（L94-100）序列化出的 `['v1', baseUrl, scope, path, query]` 结构**强耦合**，用**裸下标 3** 取值。一旦 `key()` 增删一个字段，这里**静默取错值**（可能取到 query 而 cast 失败，也可能恰好是 String 而静默错误）。这是全库最脆弱的一行代码。

**整改方向**（§5 A-11）：把 key 的结构建模为一个小类（`CacheKey { version, baseUrl, scope, path, query }` + `toJson`/`fromJson`），下标访问全部消失。

---

### 🟢 P3-1 · `buildAppTheme()` 在 `build` 内重复构造

**位置**：`main.dart:76-77`

```dart
theme: buildAppTheme(Brightness.light),
darkTheme: buildAppTheme(Brightness.dark),
```
`MaterialApp.router` 每次重建都会**完整构造两套 `ThemeData`**（`app_theme.dart` 的 `buildAppTheme` 是 193 行的重活：构造 `AppColors`、`TextTheme`、`AppSpacing` 等全套扩展）。这是纯浪费。

**整改**：改为 `late final` 字段或顶层 `final` 缓存（主题不随运行时变化）。

---

### 🟢 P3-2 · 冗余转发方法

**位置**：`repository.dart:350-353`
```dart
Future<List<ApiTag>> tagsList() async => (await read('/tags') as List)...
Future<List<ApiTag>> tags() => tagsList();     // ← 纯转发，零增值
```
`tags()` 与 `tagsList()` 同义并存，属命名债。**保留其一**。

---

### 🟢 P3-3 · 429 重试丢字段，依赖隐式假设

**位置**：`api_client.dart:234-243`

首次请求用 `Options(method: method)` 显式传方法，而 429 重试的第二次请求**未传 `method`**（依赖 "429 只对 GET 生效 → Dio 默认 GET 恰好正确"）。**当前行为正确**，但这是"靠上游条件成立而侥幸正确"，且无注释说明。若将来放开"写请求可重试"，这里会**静默变成 GET**。

**整改**：显式传 `method: method`，或加一行注释固化该前提。

---

## 5. 可执行整改清单

> **统一说明**
> - 所有条目**不改业务逻辑、不改契约、不改 UI 呈现**，纯结构性重构。
> - 每条给出**验收断言**，可用 §5.9 脚本复跑。
> - 建议顺序：**A-1/A-2/A-4（体感最大）→ A-5/A-8（机械且收益高）→ A-6/A-7（结构性）→ 其余**。
> - 每完成一批运行 `flutter analyze` + `flutter test`，保持 **EXIT=0 / 30 通过**。

### 5.1 组件抽离（P0-1）

| # | 级别 | 位置 | 动作 | 验收 |
|---|---|---|---|---|
| **A-1** | P0 | `article_page.dart:460-783` | 把 `build` 内 11 个区块提为同文件私有 `StatelessWidget`：`_ArticleCommentBar` `_ArticleActions` `_ArticleBreadcrumb` `_ArticleTitle` `_AuthorBar` `_ArticleSummary` `_ArticleTags` `_ArticleReactions` `_AdjacentList`；`build` 收缩至 **≤40 行** | `build` 起止行差 ≤40 |
| **A-2** | P0 | `member.dart:60-227` | 就地消灭 168 行局部函数 `content()`：提为私有方法或 `_MemberContent` 组件；`MemberPage.build` ≤40 行 | 同上 |
| **A-3** | P1 | `member.dart:257-366/480-571`、`widgets.dart:456-551`、`comments.dart:227-355`、`reader_markdown.dart:72-182`、`web_page.dart:41-103` | 同法把 >80 行的方法降到 80 行以内（`replyBlock`/`thread` 转组件） | 全库 >80 行函数 = **0** |

### 5.2 中文注释（P0-2）

| # | 级别 | 位置 | 动作 | 验收 |
|---|---|---|---|---|
| **A-4** | P0 | 全库 22 个零注释文件 | **三类必注**：① 公共 class/方法 → `///` 说明职责、参数语义、异常；② 非显然决策 → `//` 说清**为什么**并尽量引 `docs/flutter-app/xx`；③ 复杂逻辑（并发/状态机/索引推算）→ 块注释写不变量。**明确不注**：getter/setter、一行转发、纯布局树 | `lib/`（除 `app_theme.dart`）中文注释 **≥ 150 处**且每个 public class 上方有 `///` |

**优先补注释的 12 个位置**（都是"换个人读会误判"的地方）：

| 位置 | 该写什么 |
|---|---|
| `repository.dart:269-271` | 可见性铁律：公开读数只认 published |
| `repository.dart:280-289` | 组合一致性：取目录期间正文被改则整体作废 |
| `repository.dart:335` | 为什么能用"长度 == pageSize"推断还有下一页（裸数组无 total） |
| `repository.dart:90-101` | 缓存 key 的组成与字段顺序（**外部结构依赖它**） |
| `api_client.dart:131` | 1002/1003/1004/1005 分别什么语义、为何都触发出清会话 |
| `api_client.dart:225-231` | 为何只允许 GET 重试 429、为何限 3 秒 |
| `api_client.dart:189-205` | epoch 代次在防什么（跨账号迟到响应） |
| `data_cache.dart:285-293` | `fence` 与 `invalidate` 的语义差别（保留可见 vs 立刻清除） |
| `data_cache.dart:204-223` | Cache-Control 覆盖本地策略的优先级规则 |
| `blob_store.dart:9` | 该存储只放可重建数据，用户原创数据禁止入内 |
| `reader_markdown.dart:23-39` | 服务端 anchor 配对规则与"不自行 slug 化"的缘由 |
| `widgets.dart:152-271` | `AsyncPane` 的三态语义与缓存事件自订阅契约 |

### 5.3 设计令牌（P1-1）

| # | 级别 | 位置 | 动作 | 验收 |
|---|---|---|---|---|
| **A-5** | P1 | 全库 60 处裸 `fontSize` | 替换为 `AppType` 语义字号（`context.text.xxx`）。**做法建议**：先在 `app_theme.dart` 补一层"语义名 → AppType"的映射（如 `context.text.body` / `.caption` / `.micro`），再机械替换，避免逐处判断 | 业务代码裸 `fontSize` ≤ **10 处**（允许动画/一次性大字） |
| **A-5b** | P1 | 全库 92 处裸 `EdgeInsets` | 页面边距 → `AppSpacing.page`；常规间距 → `s1..s10`；触控目标 → `minTapTarget` | 裸 `EdgeInsets.all(16)` 等**常规值** = 0 |
| **A-5c** | P1 | 12 处裸 `circular(8)`、4 处 `circular(99)` | → `AppRadius.rMd` / `rFull` | 裸 `circular(8)`/`circular(99)` = 0 |
| **A-5d** | P1 | `reader_markdown.dart:96-103` | 5 处语法高亮色值进 `app_theme.dart`（`codeKeyword`/`codeString`/`codeNumber`…），组件只引令牌 | `app_theme.dart` 外色值 = **0** |

### 5.4 公共逻辑抽离（P1-2 / P1-4）

| # | 级别 | 位置 | 动作 | 验收 |
|---|---|---|---|---|
| **A-6** | P1 | `repository.dart`（624 行） | 拆出三个协作者：`CachePolicyTable`（合并 `policy`+`resourceTags`+`_mutationTags`，**同一端点只声明一次**）、`FavoriteIndex`（收藏索引 7 字段与其不变量）、`ReactionStore`（赞/藏内存态）。`ReaderRepository` 只做注入与编排 | `repository.dart` ≤ **300 行**；三处端点判断合并为 **1 处** |
| **A-8** | P1 | 全库 149 处端点字面量 | 建 `lib/core/network/endpoints.dart` 收敛 51 个端点；列表/详情等带参路径用具名构造器 | 端点字面量散落 ≤ **20 处**（端点文件内除外） |

### 5.5 结构与命名（P1-3 / P2）

| # | 级别 | 位置 | 动作 | 验收 |
|---|---|---|---|---|
| **A-7** | P1 | `member.dart`(7 类/1141 行)、`discovery.dart`(7 类/736 行)、`widgets.dart`(12 类/1078 行) | 改为**同名目录 + 每组件一文件**：`features/member/{member_page,settings_page,member_articles_page,draft_tile,member_list_page,profile_page,notifications_page}.dart`；`shared/widgets/` 按布局/状态/列表/媒体/表单分类 | 单文件 ≤ **400 行**；`features/` 下无文件含 >1 个公开页面类 |
| **A-9** | P2 | `router.dart:78-111`、`member.dart:137-164`、`repository.dart:436-442` | 平行数组 → **具名结构**。导航：`const _tabs = [(label:'首页', icon:'home'), …]`；统计：`{'favorites':…,'likes':…,'history':…,'articles':…}`（生产方返回具名 Map，消费方按键取） | 全库 `[i]` 位置索引（非循环计数器） = **0** |
| **A-10** | P2 | `article_page.dart:133-210/238-320`、`member.dart:60-227`、`comments.dart:227-355` | >20 行局部函数提升为类级私有方法或私有 Widget；`toggle(bool)` 拆 `like()`/`favorite()`；`load()` 内嵌 `read()` 抽出 | 局部函数 ≤ **20 行**；函数最大嵌套 ≤ **4** |
| **A-11** | P2 | `repository.dart:251-253` + `data_cache.dart:84,121,235`、`repository.dart:303,461,480`、`blob_store.dart:167`、`image_store.dart:80,97,100` | 缓存 key 建模为具名结构（消灭裸下标 `[3]`）；魔法数提为 `static const` 具名常量并注释来源（引 `14` 号文档容量协议） | 裸下标访问序列化结构 = **0**；容量类魔法数 = **0** |

### 5.6 收尾（P3）

| # | 级别 | 位置 | 动作 |
|---|---|---|---|
| **A-12** | P3 | `main.dart:76-77` | `buildAppTheme` 结果缓存（`late final` 或顶层 `final`），避免每次 build 重建两套 ThemeData |
| **A-13** | P3 | `repository.dart:350-353` | 删除 `tags()` / `tagsList()` 中的冗余转发，保留其一 |
| **A-14** | P3 | `api_client.dart:234-243` | 429 重试显式传 `method: method`，或注释固化"仅 GET 可重试"前提 |

### 5.7 整改分期建议

| 批次 | 内容 | 特征 |
|---|---|---|
| **批次一** | A-1、A-2、A-4 | 用户最直观感知的三项（面条 / 注释）；A-1/A-2 是纯搬家 |
| **批次二** | A-5（a~d）、A-8 | 机械替换，量大但零判断；建议脚本辅助 + 逐文件复核 |
| **批次三** | A-6、A-7 | 结构性拆分，需重跑全部测试验证无回归 |
| **批次四** | A-3、A-9 ~ A-14 | 收尾 |

### 5.8 整改后的目标值

| 指标 | 当前 | 目标 |
|---|---:|---:|
| 最大函数行数 | 324 | **≤ 80** |
| >80 行函数数 | 8 | **0** |
| `build` 方法平均行数 | 90.9 | **≤ 45** |
| 业务代码中文注释 | **0** | **≥ 150** |
| 裸 `fontSize` | 60 | ≤ 10 |
| 裸 `EdgeInsets` | 92 | ≤ 20（非常规值） |
| 端点字面量散落 | 149 | ≤ 20 |
| 单文件最大行数 | 1141 | ≤ 400 |
| `repository.dart` | 624 | ≤ 300 |
| `flutter analyze` / `flutter test` | 0 / 30 通过 | **不变** |

### 5.9 自检门禁

整改后请运行（脚本已随本报告交付）：

```bash
cd flutter-app
/Users/fungleo/.workbuddy/binaries/python/envs/default/bin/python \
    ../docs/flutter-app/review/check_code_quality.py
```

脚本路径 `docs/flutter-app/review/check_code_quality.py`，**13 条断言覆盖 A-1 ~ A-8 的全部可量化项**，退出码 **0 = 全部达标**、1 = 有未通过项。

**整改前基线（我已实测）**：`PASS=0 / FAIL=13` —— 这是"尚未整改"的真实状态，不是空跑：

```
[A] 组件与函数抽离
  FAIL  最大函数 ≤ 80 行            实际=324 (article_page.dart:build)
  FAIL  >80 行函数数 = 0            实际=8
  FAIL  函数最大嵌套 ≤ 4 层          实际=7 (article_page.dart:load)
  FAIL  单文件 ≤ 400 行             实际=1141 (member.dart)
  FAIL  features 每文件公开类 ≤ 1    实际=discovery.dart=7; member.dart=7
[B] 中文注释
  FAIL  业务代码中文注释 ≥ 150 处     实际=0
[C] 设计令牌被消费
  FAIL  裸 fontSize ≤ 10            实际=60
  FAIL  裸 EdgeInsets ≤ 20          实际=92
  FAIL  无裸 circular(8)            实际=12
  FAIL  无裸 circular(99)           实际=4
  FAIL  业务代码无硬编码色值          实际=10
[D] 公共逻辑抽离
  FAIL  repository.dart ≤ 300 行    实际=624
  FAIL  端点常量文件存在             实际=False
```

另有两条**功能回归门禁**需一并跑（不进脚本，因需 Flutter 环境）：

```bash
flutter analyze   # 期望：No issues found，EXIT=0
flutter test      # 期望：All tests passed（30 项），EXIT=0
```

**为什么用 Python 而非 grep 写断言** —— 三条坑都是本轮实测踩到的，如实记录：

| 坑 | 现象 | 后果 |
|---|---|---|
| BSD grep 的 `--exclude` 与 `--include` 同用 | 排除不生效，仍统计到 `app_theme.dart` | 指标虚高：曾把"业务代码 0 处中文注释"算成 82 处 |
| zsh 不对未加引号的变量做分词 | `grep ... $FILES` 把整串当成一个文件名 | 全部指标报 0，断言形同虚设 |
| grep 无法排除字符串内的 `//` 与中文 | `Text('首页')` 被判为"中文注释" | 注释统计失真 |

> **口径说明**：断言绑定**意图**（无巨型方法、有中文注释、令牌被消费），不绑定具体写法。若认为某条过紧，请**回问**而不是静默替换后再声称通过 —— 否则下一轮无法判断"通过"基于哪组断言。

---

## 6. 评分明细

| 维度 | 满分 | 得分 | 依据 |
|---|---:|---:|---|
| 架构与分层 | 20 | 16 | 四层清晰、依赖单向、DI 规范（+）；`ReaderRepository` 职责过载、`features` 文件粒度粗（−4） |
| 组件抽离与复用 | 25 | 13 | `shared/` 14 组件设计得体、`AsyncPane` 泛型抽象优秀、`CellGroup`/`MenuCell` 把菜单变成数据（+）；**features 层页面内零子组件抽离**、324 行 build、168 行局部函数（−12） |
| 公共逻辑抽离 | 20 | 12 | 缓存/锚点/错误码/会话代次都有像样的抽象（+）；端点字面量 149 处、端点判断三处重复、缓存 key 裸下标、魔法数（−8） |
| 注释与可读性 | 20 | 6 | 命名规范、无调试残留、`app_theme` 注释到位（+）；**业务代码中文注释 0 处**（用户明确要求）、非显然决策无说明（−14） |
| 代码整洁度 | 15 | 10 | analyze 0 issue、30 测试通过、无 TODO 残留（+）；60 裸字号 / 92 裸间距 / 12 裸圆角 / 嵌套最深 7 层（−5） |
| **合计** | **100** | **57** | |

**评分的定位说明**：57 分**不代表交付质量差**，而是本报告只评"代码工艺"这一个切面。功能完备度、契约对齐度、测试有效性、平台验收这几项在 57 分之外，且实测均为**优良**（§3）。若把"功能性交付"计入综合分，本交付属于"能上线、但要还技术债"的典型状态 —— 这也是为什么整改清单全部是**低风险机械重构**：地基是对的，只是没收拾。

---

## 7. 评审方自我订正（本轮 5 处，均为我的工具/口径错）

按"**不采信自陈同样约束评审方**"的纪律，本轮我在核算过程中被自己的复算推翻 5 次，如实记录 —— 其中第 4 条如果不发现，会把一个**恒真断言**交给开发 AI，让"未整改"被判成"已达标"：

| # | 我的初判 | 实际情况 | 影响 |
|---|---|---|---|
| 1 | `grep -rh '//' lib \| grep -v app_theme` 得出"业务代码中文注释 **63 处**"，与 Python 脚本的 **0 处**矛盾 | `grep -v app_theme` 是**按行内容**过滤，而注释行本身不含 "app_theme" 字样 → **过滤完全失效**，63 其实是全库（含主题文件）的行数 | 撤回。**结论维持"业务代码 0 处"**，Python 口径正确 |
| 2 | 用 `grep -r --exclude='app_theme.dart'` 重算，得"裸 fontSize 61 / 色值 85" | **BSD grep 的 `--exclude` 与 `--include` 同用时不生效**，数字里仍混着主题文件 | 撤回，改 Python `--exclude` 语义等价的路径过滤 |
| 3 | 改用 `find … ` 结果存进 `$BIZ` 再 `grep $BIZ` | **zsh 不对未加引号的变量做分词**，整串被当成一个文件名 → 4 项指标全报 0 | 撤回，最终改为 Python 单文件脚本 |
| 4 | 自写的门禁脚本首跑，"features 每文件公开 Widget 类 ≤ 1" **PASS** | 判断条件写成 `"/lib/features/" in path`，而实际路径是相对的 `lib/features/…` → **条件永假、循环空转，PASS 是恒真的** | 修正为 `os.path.join(LIB,"features")+os.sep` 前缀判断；修正后**正确报红**（`discovery=7; member=7`）。**这是本轮最危险的一处** |
| 5 | 报告中 6 个数字 | 复算修正：`repository` 625→**624**、`article_page` 785→**784**、`circular(99)` 5→**4**、`widgets.dart` 组件 12→**14**（补 `PageIntro`/`ArticleSkeleton`/`CellGroup`/`MenuCell`）、硬编码色值 5→**10**（原按"行"计、应计"处"）、`member.dart` "7 个页面"→**"7 个公开 Widget 类"**（其中 6 个是 Page） | 已在正文逐处更正 |

**由此新增一条纪律**（已回写我维护的评审技能）：

> **自己给出的每条断言，交付前必须实测"当前会红"** —— 不仅要防恒绿（改不改都 PASS），也要防恒假（永远 FAIL，作者改了也看不到正反馈）。
> 更隐蔽的是**恒真**：断言因逻辑写错而"恰好通过"，会被作者误读为"已达标"。本轮第 4 条即此类，**唯一可靠的办法是把断言放在真实基线上跑一次，看它的实际值是否有意义**。

---

## 8. 诚实边界声明

1. **未做真机/模拟器运行验证**。本报告所有结论来自**静态读码 + 结构量化脚本 + `flutter analyze`/`flutter test` 实测**。UI 呈现是否与原型一致、运行时性能（首帧、滚动帧率、内存峰值）**不在本轮审阅范围**，也未验证。
2. **功能正确性不重复验证**。`09`、`14` 号文档已交付功能验收记录；我本轮只复核了它们可复现的部分（analyze/test 通过），未重跑 integration test（需模拟器+隔离后端）。
3. **量化数据口径**：函数长度按"括号配对"计算，`=>` 表达式体函数不计长；注释统计含行尾注释与 `///`，并排除字符串内的 `//`；`fontSize`/`EdgeInsets`/装饰模式用正则统计。**这些是量级指标**，用于横向比较与整改前后对照，不宜当作绝对精度。
4. **未采信任何自陈**：`README.md`、`08`、`09`、`14` 的结论我都以独立命令复核；`.local/*.log` 中的历史日志**未作为证据**（只用于了解作者的验证意图）。
5. **未修改被审对象**：本轮我**未改动 `flutter-app/` 任何一行**，只新增本报告与索引条目（`git status --short` 可验）。

---

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-10-03 | 首版：独立复跑 analyze/test + 结构量化（函数长度/嵌套/注释/令牌/端点/装饰）+ 契约错误码核验；产出 A-1~A-14 可执行整改清单 + 门禁脚本 `check_code_quality.py`（13 条断言，基线 `PASS=0/FAIL=13`）；含 5 处评审方自我订正；综合 **57/100** |

---

## 附件

| 文件 | 说明 |
|---|---|
| `docs/flutter-app/review/check_code_quality.py` | 代码工艺门禁（13 条断言，零第三方依赖，Python 3 标准库）。用法见 §5.9 |
| `docs/flutter-app/review/M4-开发AI代码第一轮审阅报告.md` | 本报告 |
