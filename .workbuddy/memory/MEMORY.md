# 项目长期记忆 ·《成为一个全栈开发工程师》

> 维护约定：本文件只留**跨会话仍有效**的事实（决策、口径、工具坑、状态）。逐轮过程性细节写进当日 `YYYY-MM-DD.md` 或 `docs/**/review/` 报告，不在此重复。当前进度一行一改，不追加历史。

## 性质
以真实多端文章系统为素材载体的全栈技术专栏。**文章是产品，代码是素材**；文章优先、每切片成文即停，不做生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）。owner FungLeo。

## 关键决策（不可擅改）
- 栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（写适配层）。**七端共享一份 OpenAPI，变更先改契约再改实现。**
- 角色三角 `member/editor/admin`（注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管内容不管用户/角色/站点配置）。文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树；阅读量防刷（去重 + 24h 冷却 + 计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；但 `GET /articles/{idOrSlug}` 对**作者本人与 admin 放宽**（投稿预览页即用它，无私有端点）。后台筛选走 `GET /admin/articles`。

## 契约基线（**现为 openapi 1.12.0 / 54 paths / 68 操作**；M0~M4 时期冻结 1.11.0/67，Go 端推进一版 / 章程 v1.14）
- 语义门 `check_contract.py` 33 OK。改契约必复跑双门（托管 venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 机器化：`x-authz`（minRole + ownerOverride）；`Article.status.x-allowed-transitions`；错误码分段 1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务（5001=限流）；21/67 声明 429。
- **schema 陷阱**：`articleCount` 只在 `Tag`/`CategoryStat`/`SiteStats`/`MemberProfile`；**`Category`/`CategoryNode` 没有** → 分类树要计数另取 `GET /categories/stats`。`TocItem`=`level/text/anchor`（**无顺序保证、anchor 算法未公开**）。`ArticleCreate.status` 只约束 `published`。`GET /files/<key>` 挂根路径、不带 `/api/v1`（不在契约 paths，已知例外）。
- 非阻塞 TODO：树环检测、阅读去重、Comment 状态机未机器化（刻意留 PRD 层）；OAuth redirect 白名单；`GET /me/likes` 分页内部矛盾。

## 编号与协作
- 编号：M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇，周更 2 篇。git tag 里程碑式；根 `ARTICLES.md` 做「标题 ↔ 里程碑 ↔ URL」对照。
- 写作归统筹 AI；发布维护归独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md` + 启动提示词）。**评审 AI 只审、只写报告**，不写代码、不修 BUG、不代写回复文档。
- blog AI（`/Users/fungleo/Documents/Blogs`）：`csdn_backup.py` 公开抓取；`links` 聚合 `old-blogs/*.md` frontmatter（不抓网）生成 `materials/csdn-已发布链接.md`（单一真相源）。索引过期不阻断，owner 已授权自跑 `run --refresh-ids` → `links`（**必须托管 venv**）。详见 `docs/链接与发布协作约定.md`。
- 每轮发布维护三件事：① 新 URL 镜像进 `ARTICLES.md`（🟢）；② 逐轮回填 `{{LINK:Mx-yy}}`；③ 全量链接审计。脚本 `docs/publish-maintenance/check_links.py`（幽灵链/错链/占位残留，退出码 0/1/2）。占位形态：M1 裸 `{{LINK:Mx-yy}}`；M2 起 `[标题]({{LINK:Mx-yy}})`（只填 URL）。**中途不重发**：系列发布期不改已发布文章，全系列发完一次性全量更新。

## 通用工作铁律（用户级，长期有效）
- **不采信自陈**（含不采信评审报告本身）：结论必附实测证据，逐条独立复验。**单一工具的「绿」永远只是「这把尺子说绿」** → 关键指标要换原理的第二把尺子交叉验证。
- **先根因分析，不仓促打补丁**；阻碍即停（阻断性卡点立刻报 owner，不自造 workaround，owner 书面授权除外）。
- 用户自管 git commit，AI 不自动提交。统计一律走 AST / Python，**不用 shell grep**。
- **并发写铁律**：同文件多处编辑必须串行；改前先读最新内容（行号漂移），改后复核。检索先 Glob 拿真实文件名（勿猜编号）。记忆目录可能被并行会话重写 → **按 append-only 协作，不恢复旧版**。

## 当前进度
- **M1 Node 后端已冻结**（tag `node-backend-v1.0`，tsc/biome/vitest 133/双门 33 全绿），已部署 Cloudflare（`api-befull.kao9.com`），走增量维护。本地 `bash scripts/dev-local.sh`（:11000，admin/admin123456）。
- **发布进度（10-08）**：M0 8 / M1 31（09-16 收官）/ M2 22（09-28 收官）/ **M3 全 24 篇（10-07 收官）** 全发完；**M4-01/02 今日（10-08）发布**。M3 尾部 ID：16=`167079523`/17=`167080343`、18=`167121410`/19=`167121971`、20=`167172856`/21=`167172892`、22=`167218692`/23=`167218828`/24=`167218879`。
- ⚠️ **线上占位残留**：已发布正文含 `{{LINK}}` 原始文本（09-28 快照 37 篇/72 处，根因前向引用）→ **本地源干净 ≠ 线上干净**，收官须「全量重发」。SOP-C 基线（10-08）：[A]/[B]/[C] 全 0（索引 482 / 正文唯一 ID 82 / 已发布 85 篇）；待发占位 114 处 / 52 个未发布目标（M4-03~27、M5-01~24、M1-32~34、B-01/B-11）。
- `articles/` 现 **140 篇**（含 M4-01~28、M5-01~24、M1-32~34 等草稿）→ **每轮须扫全部草稿中的前向占位并回填**。
- **ARTICLES.md 各系列段须齐备**：10-08 发现缺 M4 整段（并行会话加了 M5 跳过 M4）→ 已补建 28 行。**行缺失先补建，再走 SOP-A**。
- 双前台：`web-frontend/` = 白/晴蓝 A 方案（**主力**）；`web-frontend-trae/` 已被替代。**视觉基准一律以 `web-frontend/` 为准**。实交付：Node 后端 + `manage-frontend`(React) + `web-frontend`(Next) + `flutter-app`(Flutter) + `go-backend`(Go)。

## M4 Flutter APP（APP 已交付；设计侧已冻结；**代码侧审阅已结项 57→87→90→通过**）
- 文档 `docs/flutter-app/README + 01~07` + `prototype/` + `review/`。**`06-UI设计规范与设计令牌.md` = 视觉唯一事实源**（浅色继承网站 A 方案，深色为 APP 新增）。**`07-UI组件标准.md` 面向开发 AI**：分工 = **06 管「长什么样」，07 管「怎么搭」**；核心设计 = **零色值**（只引 06 令牌名）→ 派生前置条件「引用的名字必须真实」，由门禁 6 `check_ui_standard.py` 机器守（`§12 差异登记` 豁免令牌存在性检查，正是该范围让它能发现漂移）。
- `prototype/02` 单文件可交互原型（18 页 + 兜底、三主题、四态注入）；`app_theme.dart` = ThemeExtension 全量令牌。**产品 AI 侧 100/100 已冻结**（基线 `18da8b9`）：前四轮补「契约有、文档没写」，剩余 5 分是「**契约没写、文档当有**」→ 降级为待验证项 + 登记 + 设实测落点。
- **设计 AI 侧：三轮 95 → 四轮 97 → 五轮（待评）**。门禁 `prototype/gates/`（零依赖、`bash run_all.sh`）：路由 43/43 · API vs 契约 58/58 · Dart 40:40:40:40(+65 色值) · 图标几何 37 · 交互 90/90 · UI 组件标准 6/6 · 退出码 0。
- **待 owner 拍板 13 项**（全表 `07 §12`，细节见各轮报告）。优先两项自相矛盾：**D6 焦点环 offset**（§2.1=3 / §6.2=2，本轮取 2）、**D1 底部 Tab 图标 22/24 + 文字 10/11 + 字重**（§6.7=500 vs §10 Q4=600）。其余含：目录失败态是否进产品侧口径、目录最多几级、**`color.info` 悬空令牌**（06 有 `AppColors` 无）、契约回流（`TocItem` 顺序 + slug 规则）等。
- **口径要点（别搞反）**：目录失败态**只注释声明、不进 `notes.states`**（后者渲染成「必须状态」＝已覆盖清单，加演示不出的状态＝死标注）。面板标签按真实 `level` 取名属**口径中性** → 改；`'h'+(level+1)` 的 `level=6 → h7`（实测 `h7` 是 `HTMLUnknownElement`）属**口径问题** → **只声明不钳制**。
- **代码侧（开发 AI）已结项**：`d4450fe` 57 → `eda7860` 87 → `fd9e97b` 90 → 四轮**通过**（R2-1~R2-9 / R3-1~R3-6 全关闭）。要点：作者**首次主动换尺子**（自建 `check_dart_ast.dart` 覆盖匿名闭包），我复跑一致 → **三法交叉同报非主题 >80 行 = 0** 才判定成立。
- **`part` 取舍**：合理（私有组件 + 不收窄公开 API）；代价 = part 文件不能自有 import、不能独立测试，**文件数 ≠ 模块数**。
- **跨项目可复用教训**：
  - **三代量程教训（本项目最贵的一课）**：词法脚本量函数长度，**连续三代把「未达标」判成「达标」**（v1 漏箭头体/多行签名；v2 仍漏**命名参数组 `{...}`** → 带命名参数的方法整条不入枚举；v3 才用括号深度感知 + 函数名不用签名正则 + 嵌套只数控制流分支块）。**v1/v2/v3 全部保留**。**用旧解析器直接扫单文件并打印其识别的函数名列表，是定位量程盲区最硬的一招。**
  - **门禁通用硬规则**：① `place-items:center` ≠ 多子项叠中间（Grid 会排成多行、内容溢出边框）。② 断言「A ≠ B」前必须确认 A、B 在取样环境里本就该不等（深色下两令牌本就同值 → 取样时机错而非断言错）。③ 全量替换**必须带命中次数断言**。④ 结构化字段**不塞说明文字**（加后缀会变幽灵端点）。⑤ 多子句 `&&` 断言**必须逐条打印 detail**。
  - **作者自陈可信度判据**：✅ 加分 = 主动标注证据边界、主动纠正我报告的错前提、**拒绝用有缺陷的数字宣布满分**；⚠️ 扣分 = 察觉量具局限却只写免责声明、没换尺子补量一次。
  - 工具坑：`git diff <中文路径>` 因 macOS **NFD/NFC** 不匹配**静默返回空**（改用 glob）。

## M6 Go 后端（`go-backend/`，已交付；**代码审阅 73 → 94/100**）
- **Go 1.26.6 + net/http + GORM v2 + goose**，实现冻结 **OpenAPI 1.12.0 / 68 操作**（内嵌 JSON 快照 68=68 一致）。分层 `cmd{server,migrate,seed,data}` + `internal{领域包}` + `test`。定位**教学代码**（评分权重重押「注释与教学可读性 25 分」）。
- 门禁 `review/check_go_quality.go`（Go AST，13 断言 + `--selftest`）；量化探针 `review/check_go_ast.go`。**默认排除 `_test.go`**（否则 159 行的 `TestAllOperations` 带偏「最大函数」口径）。`make verify` = gofmt + vet + `sync-contract.cjs --check` + test。
- **第一轮（`043fda2`）73/100**：架构 19 / 抽离 17 / 去重 13 / **注释与教学 10** / 整洁 14。门禁 `PASS=3/FAIL=10`。P0 = 中文注释 0 行 + `e` 899 vs `err` 39；P1 = 软删除谓词手写 15 处、`pathID(r,` 25 处、>120 行 103 行（最差 443 字符）、`Normalize` 99 行、`contract.Load` 嵌套 7 层。12 条工单 A-1~A-12。定性：**工程判断力强，缺「面向人的表达」**。
- **第二轮（`9590cb1`）94/100**：架构 20 / 抽离 19 / 去重 18 / **注释与教学 22** / 整洁 15。生产门禁 **PASS=13/FAIL=0**、自检 13/13 全红、含测试 9/4。**12/12 工单达成且非凑数**（软删除抽 `database.ActiveArticles` 带 JOIN 测试、`contract.Load` 真拆、`Normalize` 99→37）。`make verify` 全绿，`gofmt/vet/build/test` 全绿，12 包 ok。报告 `review/M6-Go后端代码第二轮审阅报告.md`。
- **第二轮唯一未满分原因 = 门禁盲区**：`check_go_quality.go` 的「中文注释 ≥ 120」只数**含 CJK 的行数**，**不判注释是否正确**。实测抓到 `values.go:73 func Text(s string) *string` 的文档「可空输入返回 nil」是从同文件方法**复制**的错文档（该函数永不返回 nil）；`article/query.go` 两个 `Get` 文档逐字重复且包级那条失实。→ **属「为达成指标牺牲正确性」的最小样本**；作者自己在回复 §5.5 写了「统计不是教学质量的充分条件」，其代码里恰好有反例。另残留 9 条英文内联注释、3 处固定查表每调用重建。
- **对作者回复 §5（6 条边界声明）的裁定：全部接受**。其中**我撤回自己第一轮的一个论据**——「`e` 会让 errcheck 格格不入」不成立（errcheck 查的是未处理错误，与变量拼写无关）；改名依据只能是清晰与一致性。
- **独立性核验**：`git diff --stat 043fda2 9590cb1 -- scripts/ ../docs/api/` 为空 → 差分脚本与冻结契约未被放宽；作者未改评审工具、未宣称新评分。

## M2 前端（React 管理后台）
目录 `manage-frontend/`，Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5 + RHF7/Zod4 + Biome2.5，`strict`，dev 12000。取数：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`；信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；token 内存不落 localStorage；附件 `ORIGIN + /files/<key>`。CORS 方案 B（owner 暂定）：dev 走 Vite 同源代理，Cookie 分支上线前须验证。

## 工具坑（本环境实测，跨轮反复踩）
- ⚠️ **`grep` 的 `\|` 静默假阴性（最坑）**：本环境 `grep` 是 brokered shim，**不支持 BRE `\|` 交替 → 静默返回 0 匹配**。实测 `grep -c "A\|B"` = 0，而 `grep -cE "A|B"` / `grep -e A -e B` 正常。**禁忌写法 `\|`；改用 `-E`/`-e` 或内置 Grep 工具**。核验「已发布范围零残留」**一律以 `check_links.py` 的 [C] 项为准**。
- zsh 下 `grep --include=*.go` 失效（未加引号参数不做 glob 展开）→ 四个指标全报 0。**代码统计走 AST/Python。**
- **状态判定要用结构化字段（列），不能用整行子串**（`check_links.py` 曾被标题里的字面「已发布」骗到）。
- 沙箱：Bash 单次读约 10~20 文件即 SIGTERM(137)，需分片。

## 待 owner 裁定 / 待办
- **教学代码注释用中文还是英文**（决定 M6 的 A-1/A-3 口径）——第二轮实际已按中文整改，建议补进 `01-Go工程最佳实践.md` 成文。
- M4 设计侧 13 项口径（见上）；`M4-设计AI原型第四轮评审回复.md` 等 owner 通知。
- 收官「全量重发」覆盖累积清单（含所有发布后被回填/修正的篇）。
