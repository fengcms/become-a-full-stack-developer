# 项目长期记忆 ·《成为一个全栈开发工程师》

## 性质
以真实多端文章系统为素材载体的全栈技术专栏。**文章是产品，代码是素材**；文章优先、每切片成文即停，不做生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）。owner FungLeo。

## 关键决策（不可擅改）
- 栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（写适配层）。**七端共享一份 OpenAPI，变更先改契约再改实现。**
- 角色三角 `member/editor/admin`（注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管内容不管用户/角色/站点配置）。文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树；阅读量防刷（去重 + 24h 冷却 + 计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；但 `GET /articles/{idOrSlug}` 对**作者本人与 admin 放宽**（投稿预览页即用它，无私有端点）。后台筛选走 `GET /admin/articles`。

## 契约基线（openapi 1.11.0 冻结 / 章程 v1.14）
- **53 路径 / 67 操作**；语义门 `check_contract.py` 33 OK。改契约必复跑双门（venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 机器化：`x-authz`（minRole + ownerOverride）；`Article.status.x-allowed-transitions`；错误码分段 1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务（5001=限流）；21/67 操作声明 429。
- **schema 陷阱**：`articleCount` 只在 `Tag`/`CategoryStat`/`SiteStats`/`MemberProfile`；**`Category`/`CategoryNode` 没有** → 分类树别照抄标签页数字，要计数另取 `GET /categories/stats`。`TocItem`=`level/text/anchor`（**无顺序保证、anchor 算法未公开**）。`ArticleCreate.status` 只约束 `published`。`GET /files/<key>` 挂根路径、不带 `/api/v1`（不在契约 paths，已知例外）。
- 非阻塞 TODO：树环检测、阅读去重、Comment 状态机未机器化（刻意留 PRD 层）；OAuth redirect 白名单；`GET /me/likes` 分页内部矛盾。

## 编号与协作约定
- 编号：M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇，周更 2 篇。git tag 里程碑式；根 `ARTICLES.md` 做「标题 ↔ 里程碑 ↔ URL」对照。
- 写作归统筹 AI；M1 起发布维护归独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md` + 启动提示词）。
- blog AI（`/Users/fungleo/Documents/Blogs`）：`csdn_backup.py` 公开抓取；`links` 聚合 `old-blogs/*.md` frontmatter（不抓网）生成 `materials/csdn-已发布链接.md`（单一真相源）。索引过期不阻断，owner 已授权自跑 `run --refresh-ids` → `links`（**必须托管 venv**）。详见 `docs/链接与发布协作约定.md`。
- 每轮发布维护三件事：① 新 URL 镜像进 `ARTICLES.md`（🟢）；② 逐轮回填 `{{LINK:Mx-yy}}`；③ 全量链接审计。脚本 `docs/publish-maintenance/check_links.py`（幽灵链/错链/占位残留，退出码 0/1/2）。占位形态：M1 裸 `{{LINK:Mx-yy}}`（替换成完整链接）；M2 `[标题]({{LINK:Mx-yy}})`（只填 URL）。**中途不重发**：系列发布期不改已发布文章，全系列发完一次性全量更新。
- **并发写铁律**：同文件多处编辑必须串行；改前先读最新内容（行号漂移），改后复核。检索先 Glob 拿真实文件名（勿猜编号）。

## 当前进度
- **M1 Node 后端已冻结**（tag `node-backend-v1.0`，tsc/biome/vitest 133/双门 33 全绿），已部署 Cloudflare（`api-befull.kao9.com`），后续走增量维护。本地 `bash scripts/dev-local.sh`（:11000，admin/admin123456）。
- 发布进度（10-04）：M0 8 / M1 31（09-16 收官）/ M2 22（09-28 收官）全发完；**M3 已发 01~15**（共 24 篇，M3-16/17 待发）。M3 尾部 ID：10=`166945924`/11=`166945972`（10-01）、12=`166991347`/13=`166991388`（10-02）、14=`167033186`/15=`167033673`（10-03）。⚠️ 线上占位残留：已发布正文含 `{{LINK}}` 原始文本（09-28 快照 37 篇 / 72 处，根因前向引用）→ **本地源干净 ≠ 线上干净**，收官须「全量重发」。SOP-C 基线（10-04）：幽灵链/错链/占位残留全 0（`check_links.py` 退出码 0；索引 473 / 正文唯一 ID 73 / 已发布 76 篇）。
- **双前台歧义已澄清**：`web-frontend/` = 纯白/晴蓝 A 方案（2182 行，含会员投稿/叠楼评论，**主力**）；`web-frontend-trae/` = 极简编辑风（226 行，已被替代）。**取视觉基准一律以 `web-frontend/` 为准**。
- 七端缩水：`go-backend/` 仍 0 文件；实交付 Node 后端 + `manage-frontend`(React) + `web-frontend`(Next) + **`flutter-app`(Flutter，已交付)**。

## M4 Flutter APP（APP 已交付；设计侧已冻结；**代码侧审阅已结项：57→87→90→通过**）
- 文档 `docs/flutter-app/README + 01~07` + `prototype/` + `review/`。`06-UI设计规范与设计令牌.md` = **视觉唯一事实源**（浅色继承网站 A 方案，深色为 APP 新增）；三处刻意例外：浅蓝底文字用 `brand.onSubtle #2A6AA3`、深色主按钮实底 `#37709F`、待审 `#7A6122`/草稿 `#5C6C80` 已加深。
- `prototype/01` 静态样稿；`prototype/02` 单文件可交互原型（18 页 + 兜底、三主题、四态注入）；`app_theme.dart` = ThemeExtension 全量令牌。
- **产品 AI 侧：第五轮 95 → 满分冲刺工单（10 条自检断言）→ 整改验收 100/100，已冻结**（基线 `18da8b9`）。核心洞察：前四轮补的是「契约有、文档没写」（补登记即闭环）；剩余 5 分是「**契约没写、文档当有**」→ 必须降级为待验证项 + 登记 + 设实测落点。
- **设计 AI 侧：第三轮 95 → 第四轮 97 → 第五轮（待评）**。第三轮 A-1（P1）原型自造锚点 `h-N` 与冻结口径（`01:18`/`03:13`/`03:67`「key 用服务端 anchor，客户端不自行 slug 化」）冲突 → 已按方案 A 修（`SECTIONS` 加 `anchor`/`level`，`TOC` 与 `TocItem` 同形）。第四轮 A-5（P2 辅助子资源失败态缺席）+ A-6~A-8（P3）**已整改**（02 哈希 `9553f0b6dc37c11c` → `6c3150dd256539b7`）。
- 设计侧门禁 `prototype/gates/`（零第三方依赖、`bash run_all.sh`）：**6 道** —— 路由 43/43 · API vs 契约 58/58 · Dart 40:40:40:40（+65 色值）· 图标几何 37 ✅ · 交互 **90/90** · UI 组件标准 6/6 · 退出码 0。`01` 哈希 `3eb2785029e83963`（第四轮后未改动）。
- **`07-UI组件标准.md`（第五轮新增，面向开发 AI）**：owner 四项 UI 调整的第 ④ 项。**归属先问过 owner**（三选项 → 选「新建 07 + `06 §6` 加指引行」）。分工：**06 管「长什么样」（视觉/令牌唯一事实源），07 管「怎么搭」（结构/实测尺寸/状态矩阵/Flutter 落地/反例）**。14 节，含反例清单 20+ 条与 `§12` 差异登记 13 项。
- **07 的核心设计＝零色值**：只引 06 令牌名，否则「改色只改一处」不成立。由此派生一条**前置条件**：「引用的名字必须真实」→ 用**门禁 6 `check_ui_standard.py`** 机器守（07 零裸色值 / 令牌名逐名回查 06 / `AppColors.*` 回查 `app_theme.dart` / 原型选择器回查 / 原型里 `07-UI组件标准 §N` 前向引用可解析 / 原型侧令牌有定义**也有消费方**）。`§12 差异登记` **豁免**令牌存在性检查（该节按定义会点名 06 里没有的令牌）——**正是这个范围让它能发现漂移**。`--selftest` 注入 7 类缺陷全部被告出。
- **设计侧已闭环（要点，细节见各轮报告）**：第五轮修掉 3 处原型缺陷 —— `.radio` 是 `display:grid` 且 2 个子项 → **Grid 排成两行**、24.5dp 溢出 22dp 圆框（改单一 `::after`）；`--line-button` 令牌**原本不存在**（补齐后**深色下与 `line-strong` 同值，该区分只在浅色存在**）；动效硬编码 → 补 `--dur-fast/base/page`。
- **门禁通用硬规则（三轮累积，跨项目可复用）**：① **`place-items:center` ≠ 多子项叠中间** —— Grid 会把多子项排成多行、容器高不变而内容溢出边框（原型 P1 根因）。② **断言「A ≠ B」前必须确认 A、B 在取样环境里本来就不等** —— 深色下两令牌本就同值，首跑报红但**断言没错、取样时机错**（修法：先切浅色 + 加「取样前确为浅色」前置断言）。③ 全量替换**必须带命中次数断言**（假设 2 次实际 1 次，当场拦下、未写盘）。④ 结构化字段**不塞说明文字** —— 给 `api:[...]` 加「（本阶段不实现）」后缀立刻变**幽灵端点**；语义区分要用**独立字段**并让门禁一并扫它。⑤ 多子句 `&&` 断言**必须逐条打印 detail**，否则报红原因不是真正不成立的那条。
- 待 owner 拍板 13 项（全表见 `07 §12`）。**优先：06 内部自相矛盾** —— D6 焦点环 offset（§2.1=3 / §6.2=2，本轮按「专门条款优先于通表备注」取 2）、D1 底部 Tab 图标 22/24 + 文字 10/11 + 字重（§6.7=500 vs §10 Q4=600）。其余：目录失败态是否进产品侧口径、目录最多几级、`06 §2.4` 缺 `color.line.button` 深色值、`06` 补 `codeBg`/`codeFg`/`skeleton`、**`color.info` 06 有而 `AppColors` 无（悬空令牌）**、`06 §2.1` 补 `surface.elevated` 浅色值、`06` 归属、契约回流（`TocItem` 顺序 + slug 规则）、`.b.dgr` 与按钮 `loading`·`disabled` 零消费方、`.seg` 与 `.segs` 同名不同物。
- **A-5 口径（别搞反）**：目录失败态**只注释声明、不进 `notes.states`**（后者渲染成「必须状态」＝已覆盖清单，加演示不出的状态＝死标注，且等于替 owner 决定跨侧口径）→ 应表述为「声明 + 升级为跨侧待决」。**A-6 分界**：面板标签按真实 `level` 取名属**口径中性**（原「3 级显示二级标题」是事实错误）→ 改；`'h'+(level+1)` 的 `level=6 → h7`（实测 `h7` 是 `HTMLUnknownElement`）属**口径问题** → **只声明不钳制**。
- 跨侧遗留：目录锚点配对规则须用**含重复标题 / 代码块内 `#` 行 / Setext 标题**的夹具文章实测（**原型 mock 不具备这三类样本，能跳转 ≠ 已验证**）；`/toc` 对未发布文章按产品侧方案 A 规避。
- **开发 AI 代码**：`d4450fe`(23 文件/8364 行) → 首轮 **57/100**；`eda7860`(101 文件) → 二轮 **87/100**；`fd9e97b`(110 文件/10734 行) → 三轮 **90/100**（`review/M4-开发AI代码第三轮审阅报告.md`）。三轮复验：`repository` 624→**293**、业务中文注释 **0→197 处/100 文件**、裸 fontSize/EdgeInsets/circular/色值 60/92/16/10 → **0/5/0/0**、最长文件 1141→**400**（`editor.dart` 贴线）、依赖环 0、`analyze` 0 issue、`test` **36 通过**。**R2-1~R2-9 九项全部真落地**（抽出的组件**收窄参数** `{required this.n, required this.onTap}`，非传整个 State）→ 定性**「标准未落地」而非「能力不足」**持续成立。三轮还各有加分：主动标注证据边界、主动拒绝宣布满分、**R2-6 主动纠正我报告里的描述错误**（那三处端点常量是 `onMutation` 缓存通知的排除条件，**不是「清会话」条件**）。
- **🔴 三代量程教训（本项目最贵的一课，跨项目可复用）**：我用词法脚本量函数长度，**连续三代把「未达标」判成「达标」**。v1 逐行正则漏**箭头体 / 多行签名**（报「>80 行 8 个」，真实 13）→ v2 反向回溯仍漏**命名参数组 `{...}`**（参数组的 `}` 被误当语句边界 → **所有带命名参数且有函数体的方法整条不入枚举**；报「最大 79 / >80 行 0 个」，真实 **6**，**二轮基线真实 11**）→ v3 改**括号深度感知**（`pdepth==0` 的 `{` 才可能是函数体）+ **函数名判定不用签名正则**（兼容命名 record / getter / setter / operator）+ 箭头终止符深度感知（不被内层 lambda 的 `;` 截断）+ **嵌套只数控制流分支块**（花括号深度会把集合字面量算进去 → 虚高到 5~6 层，真实 ≤4）+ 长度断言排除 `theme/`（配置型；但**路由表里内联的 UI 不能跟着豁免**）。**v1/v2/v3 全部保留**——「每修一个盲区，真实数字就往上跳一次」本身就是最大发现。v3 真实 `PASS=13/FAIL=2`，`--selftest` 注入 10 类缺陷 **15/15 全红**，并额外断言两项**口径正确性**（「命名参数长函数被看见」「主题目录被排除」）。**四轮验收必须用 v3**，期望 `PASS=15/FAIL=0`。
- **剩余 R3-1~R3-6（全为既有代码，本轮零新增）→ 已全部关闭**（第四轮结项，`review/M4-开发AI代码审阅结项确认.md`）：`createRouter` 196→**20**（58 行内联底部导航抽为 `app_bottom_bar.dart`）/ `home_page|search_page|focus_stories:build` 127/121/120 → **21/14/20** / `api_client._request` 119→**64**（拆 `_shouldRefresh`/`_retryAfter`/`_decode`，12 条文案提为类级 `_messages`）/ `article_feed.load` 85→**54**（**两遍 `differs` 收敛为单一 `_samePrefix`**）。`member.dart` 已删除。独立复跑 `analyze` 0 issue / `test` **42 通过**。**第四轮要点：作者首次把「换尺子」补上**——主动引入 `check_dart_ast.dart`（Dart analyzer 真语法树，覆盖构造器/方法/具名函数/**匿名闭包**，908 声明为最宽网），我亲自复跑一致；**三法交叉（我的 v3 / 宽网探针 / 作者 AST）同报非主题 >80 行 = 0** 才判定成立。方法论沉淀：**单一工具的「绿」永远只是「这把尺子说绿」**。唯一行为变更 R3-5（各 await 边界补 `start != epoch` 抛 `SessionChanged`）属收敛加固，6 处均有捕获。工具坑：`git diff <中文路径>` 因 macOS **NFD/NFC** 不匹配会**静默返回空**（改用 glob）；**用旧解析器直接扫单个文件并打印其识别的函数名列表**，是定位量程盲区最硬的一招。
- 代码侧剩余 **R2-1~R2-9**：**4 个 >80 行函数**（`profile_page:build` **147** / `auth_page:build` 125 / `notifications_page:build` 106 / `data_cache:_fetch` 103·深度6）——前 3 个都是「文件分了、函数没分」的箭头 build；缓存 key 命名空间 `/reader/article/` **跨 3 文件硬编码 5 次**；`api_client.dart:165-167` 3 处裸路径前缀；`features/member.dart` **零引用桶文件**；`AppType` 21 成员语义层未贯通；`part`（64 条）文件中「页面私有→part、跨页面复用→独立库」判据待写入 `08`。
- **`part` 取舍**：合理（私有组件 + 不扩大公开 API + 已确认收窄参数，`_ArticleContent` 收 10 个窄参数而非整个 State）；代价是 part 文件**不能自有 import、不能独立测试**，且**文件数 ≠ 模块数**。
- 作者自陈的可信度处置（**可复用判据**）：✅ 加分 = 主动标注证据边界（"脚本不完整覆盖多行签名和箭头表达式"）、主动纠正我「core 不依赖 features」的错前提（实有 4 处分层越界，均为既有）、**拒绝用有缺陷的数字宣布 100 分**；⚠️ 未完成 = **察觉到了量具局限，却只写免责声明、没有换尺子补量一次**。

## M2 前端（React 管理后台）
目录 `manage-frontend/`，Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5 + RHF7/Zod4 + Biome2.5，已开 `strict`，dev 12000。取数：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`（非 `{items,total}`）；信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；token 内存不落 localStorage；附件 `ORIGIN + /files/<key>`。CORS 方案 B（owner 暂定）：dev 走 Vite 同源代理，Cookie 分支上线前须验证。

## 通用工作铁律
- **评审 AI 只审、只写报告**：不写代码、不修 BUG、不代写回复文档。
- **不采信自陈**（含不采信评审报告本身）：结论必附实测证据，逐条独立复验。**阻碍即停**：阻断性卡点立刻报 owner，不自造 workaround（owner 书面授权的兜底除外）。
- 用户自管 git commit，AI 不自动提交。
