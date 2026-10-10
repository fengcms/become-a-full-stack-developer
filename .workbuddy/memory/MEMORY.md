# 项目长期记忆 ·《成为一个全栈开发工程师》

> 维护约定：只留**跨会话仍有效**的事实（决策、口径、工具坑、状态）。过程细节写进当日 `YYYY-MM-DD.md` 或 `docs/**/review/` 报告。当前进度一行一改。

## 性质
以真实多端文章系统为素材载体的全栈技术专栏。**文章是产品，代码是素材**；文章优先、每切片成文即停，不做生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）。owner FungLeo。

## 关键决策（不可擅改）
- 栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（写适配层）。**七端共享一份 OpenAPI，变更先改契约再改实现。**
- 角色三角 `member/editor/admin`（注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管内容不管用户/角色/站点配置）。文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树；阅读量防刷（去重 + 24h 冷却 + 计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；`GET /articles/{idOrSlug}` 对**作者本人与 admin 放宽**（投稿预览页用它，无私有端点）。后台筛选走 `GET /admin/articles`。

## 契约基线（openapi 1.12.0 / 54 paths / 68 操作）
- 语义门 `check_contract.py` 33 OK。改契约必复跑双门（托管 venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 机器化：`x-authz`（minRole + ownerOverride）；`Article.status.x-allowed-transitions`；错误码分段 1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务（5001=限流）；21/67 声明 429。
- **schema 陷阱**：`articleCount` 只在 `Tag`/`CategoryStat`/`SiteStats`/`MemberProfile`；`Category`/`CategoryNode` 没有 → 分类树计数另取 `GET /categories/stats`。`TocItem`=`level/text/anchor`（无顺序保证、anchor 算法未公开）。`ArticleCreate.status` 只约束 `published`。`GET /files/<key>` 挂根路径、不带 `/api/v1`（不在 paths，已知例外）。
- 非阻塞 TODO：树环检测、阅读去重、Comment 状态机未机器化（刻意留 PRD 层）；OAuth redirect 白名单；`GET /me/likes` 分页内部矛盾。

## 编号与协作
- 编号：M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇，周更 2 篇。git tag 里程碑式；根 `ARTICLES.md` 做「标题 ↔ 里程碑 ↔ URL」对照。
- 写作归统筹 AI；发布维护归独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md` + 启动提示词）。**评审 AI 只审、只写报告**，不写代码、不修 BUG、不代写回复文档。
- blog AI（`/Users/fungleo/Documents/Blogs`）：`csdn_backup.py` 公开抓取；`links` 聚合 `old-blogs/*.md` frontmatter 生成 `materials/csdn-已发布链接.md`（单一真相源）。索引过期不阻断，owner 已授权自跑 `run --refresh-ids` → `links`（**必须托管 venv**）。详见 `docs/链接与发布协作约定.md`。
- 每轮发布维护三件事：① 新 URL 镜像进 `ARTICLES.md`（🟢）；② 逐轮回填 `{{LINK:Mx-yy}}`；③ 全量链接审计。脚本 `docs/publish-maintenance/check_links.py`（退出码 0/1/2）。占位形态：M1 裸 `{{LINK:Mx-yy}}`；M2 起 `[标题]({{LINK:Mx-yy}})`。**中途不重发**：系列发布期不改已发布文章，发完一次性全量更新。

## 通用工作铁律（用户级，长期有效）
- **不采信自陈**（含不采信评审报告本身）：结论必附实测证据，逐条独立复验。**单一工具的「绿」永远只是「这把尺子说绿」** → 关键指标换原理的第二把尺子交叉验证。
- **先根因分析，不仓促打补丁**；阻碍即停（阻断性卡点立刻报 owner，不自造 workaround）。
- 用户自管 git commit，AI 不自动提交。统计一律走 AST / Python，**不用 shell grep**。
- **并发写铁律**：同文件多处编辑串行；改前先读最新内容，改后复核。检索先 Glob 拿真实文件名。记忆目录可能被并行会话重写 → **append-only 协作，不恢复旧版**。
- **文章优化铁律**：① 只加真实素材，**不编造未发生的事**；② 补的代码**逐字取自源码**，简化/加注释须人工判定并标注；③ 「报 FAIL 先问是文章错还是尺子错」——检测器口径须跟决策同步。

## 当前进度
- **发布（10-09）**：M0 8 / M1 31 / M2 22 / M3 24 发完；**M4 已发 4/28**（M4-01=`167266219`、M4-02=`167266845`、**M4-03=`167370472`、M4-04=`167371366`**）= 累计 **89 篇**。⚠️ **线上占位残留**（已发布正文含 `{{LINK}}` 原始文本，根因前向引用）→ **本地源干净 ≠ 线上干净**，收官须「全量重发」。SOP-C 每轮基线 = [A]0/[B]0/[C]0（脚本 `check_links.py`；[C] 占位残留是**移动靶**——10-08 三跑 1→2→0；10-09 首跑 15（昨夜批量落盘的 M6/M7/B 新草稿）→ 回填后 0）。
- `articles/` 已 **203 篇**（M4-01~28、M5-01~24、**M6-01~33 全部落盘**、M7-01~11、B-17/19 等）→ 每轮须扫全部草稿前向占位并回填。**ARTICLES.md 各系列段须齐备**（现有段仅 **M0~M5**；**仍缺 M6 / M7 / B 三整段** → 待 owner 定建段时机，M6 33 篇完成属「登记待办」）。**M6 Go 篇用 `{{LINK:GO-xx}}` 前缀（GO-01/03/05/06/07/08/09/GO-REVIEW-3）。**
- 双前台：`web-frontend/` = 白/晴蓝 A 方案（**主力**，视觉基准一律以它为准）；`web-frontend-trae/` 已被替代。交付：Node 后端 + `manage-frontend`(React) + `web-frontend`(Next) + `flutter-app`(Flutter) + `go-backend`(Go) + `taro-miniprogram`(Taro)。
- **M5 小程序文章（24 篇，`taro-miniprogram/`）优化已全部完成（10-08）：24/24 全部 PASS。** 体检结论「**M5 不是 M4**」——写在 M4 优化之后、已吸收教训，**无系统性缺陷**；唯一系统性差距 = **代码密度**（初测中位 10）。**目标线 = M4 优化后中位（正文 ≥3000 / 代码行 ≥45 / 表格行 ≥8 / 免责密度 ≤4.0‰）**。验收器 `docs/publish-maintenance/check_m5.py`（**硬门禁 = 声明的源码路径必须存在**；代码命中率降级为提示）。方案/记录 `docs/M5-文章优化方案.md`（§十 = 全量记录 + 24 篇指标表）。`REVIEW_EXEMPT={05,07,08,24}`（复盘/总述类豁免代码行）。**最短 3008 字（M5-13）、最高密度 4.0（M5-12）。**
- **M6 Go 文章（33 篇，`go-backend/` 素材）优化进行中（10-08 标杆批 3/3 PASS）**：体检结论「**M6 与 M5 同病但更重**」——**代码密度是唯一压倒性差距**（中位 0，**18/33 篇绝对零代码块**；M5 中位 9）。全量基线：正文字数中位 **2201**（28 篇 <3000）、表格中位 7（18 篇 <8）、免责密度 5 篇 >4.0。**门槛同 M5**（≥3000 字 / ≥45 码 / ≥8 表 / ≤4.0‰）。验收器 `docs/publish-maintenance/check_m6.py` —— **M6 特有：正文用 `~~~` 波浪线围栏（M5 是反引号），验收器必须两种都认，否则代码行会被量成 0**；封面 IMG 期望 **1**（非 M5 的 2）。方案 `docs/M6-文章优化方案.md`。`REVIEW_EXEMPT={M6-07,08,09,10,32}`。**标杆 3 篇已 PASS**（M6-05 3064/59/19、M6-07 3060/14(豁)/21、M6-21 3121/132/15）。**待 owner 拍板：① 是否铺开其余 30 篇；② M6-11 围栏漂移（全系列 `~~~`，唯它用 ```）是否统一；③ ARTICLES.md M6 段 + GO-xx 映射（属发布维护线）。**
  - **抓到的事实错误**：M6-21 引用 `article/read.go`（**`internal/article/` 下不存在**，实为 `query.go`/`view.go`）→ 已改正。**由「裸 `pkg/file.go` 引用回搜」自动抓到**（与 M5-19 `auth ?` 守卫同类）。该回搜应纳入 M6 每轮核验。
  - **验收器盲区（尺子量程，非文章错）**：`_all_sources()` 只遍历 `taro-miniprogram/` → **跨仓库节选恒 0 命中**（M5-07 的 Flutter `CachePolicy` 已人工与 `flutter-app/.../data_cache.dart` 逐字核对一致）；**命令片段 / 作者自绘清单**天然不命中且无路径声明，属可接受。「0 命中」须人工判定。
  - **排版坑（可复用）**：源码含 `"\n```typescript\n"` 这类**内层三反引号**，直接贴进代码块会**提前闭合围栏**、污染计数 → 改用对照表呈现（M5-21）。

- **文章三问题治理（10-10 收官，M5/M6/M7/B 共 101 篇全 PASS）**：口径 = ① 1 封面 + 2 内图（`{{IMG:Mx-xx-名}}` 占位）；② 延伸阅读**去前向/自引用/跨系列未发布**。**判定铁律：`{{LINK:Mx-yy}}` 同系列 yy<xx（向后）= 合规**（发布时 SOP-B 回填），**yy>xx / 自引用 / 跨系列未发布 = 必改**。M5 原无延伸阅读→新增；M6 把 `{{LINK:GO-xx}}`（`docs/go-backend/` 设计文档）一并改写；M7 前向与 `B-16/B-17` → 换 M2（React 对照）已发布 URL；**B-07 原缺封面占位符 → 补**。**真实 CSDN 标题以 `~/Documents/Blogs/materials/csdn-已发布链接.md` 为准，`ARTICLES.md` 是短标题（不可直接当 CSDN 标题）。**

## M4 Flutter APP（已交付；设计侧冻结；代码审阅结项 57→87→90→通过）
- **配图 / 延伸阅读规范（10-10 owner 明确）**：每篇 = **1 封面 + 2 内图**，图片位一律 `{{IMG:Mx-xx-名}}` 占位符（封面与内图同格式；未替换 = 裸占位符）；**延伸阅读只引用「发布时已发布」的序号靠前文章，禁前向引用**。⚠️ **上轮优化 `fcc4630` 误删了每篇的内图占位符**（原始 `4dcd133` 每篇 2 个）。已修 M4-05~28：05/06 保留 owner 已替换的真实图 URL、只补第 2 张内图占位符；07~28 各补 2 张；**已发布 01~04 未动**。M5 是唯一留存双占位符的系列（24/24）。
- 文档 `docs/flutter-app/README+01~07` + `prototype/` + `review/`。**`06-UI设计规范` = 视觉唯一事实源**（管「长什么样」）；**`07-UI组件标准` 面向开发 AI**（管「怎么搭」），核心 = **零色值**（只引 06 令牌名），由门禁 `check_ui_standard.py` 守（`§12 差异登记` 豁免令牌存在性检查）。
- `prototype/02` 单文件可交互原型（18 页 + 兜底、三主题、四态注入）；`app_theme.dart` = ThemeExtension 全量令牌。产品 AI 侧 100/100 冻结（`18da8b9`）。门禁 `prototype/gates/`（零依赖 `bash run_all.sh`）全绿。
- **待 owner 拍板 13 项**（全表 `07 §12`）：D6 焦点环 offset（§2.1=3 / §6.2=2）、D1 底部 Tab 图标/字号/字重（§6.7 vs §10 Q4）、目录失败态口径、目录最多几级、`color.info` 悬空令牌、`TocItem` 顺序 + slug 规则等。
- **口径要点**：目录失败态**只注释声明、不进 `notes.states`**（后者 = 已覆盖清单）。面板标签按真实 `level` 取名属口径中性 → 改；`'h'+(level+1)` 的 `level=6 → h7`（`h7` 实为 `HTMLUnknownElement`）属口径问题 → **只声明不钳制**。
- **跨项目可复用教训**：**三代量程教训（最贵一课）**——词法脚本量函数长度，**连续三代把「未达标」判成「达标」**（v1 漏箭头体/多行签名；v2 漏**命名参数组 `{...}`**；v3 才括号深度感知 + 函数名不用签名正则）。**v1/v2/v3 全保留**。**用旧解析器扫单文件并打印其识别的函数名列表，是定位量程盲区最硬的一招。**
- **门禁通用硬规则**：① `place-items:center` ≠ 多子项叠中间。② 断言「A ≠ B」前须确认 A、B 在本环境本就该不等。③ 全量替换**必须带命中次数断言**。④ 结构化字段**不塞说明文字**。⑤ 多子句 `&&` 断言**必须逐条打印 detail**。
- **作者自陈可信度判据**：✅ = 主动标注证据边界、纠正我报告错前提、**拒绝用有缺陷的数字宣布满分**；⚠️ = 察觉量具局限却只写免责声明、没换尺子补量。

## M6 Go 后端（`go-backend/`，已交付；审阅 73→94→96→结项 98/100，已冻结）
- Go 1.26.6 + net/http + GORM v2 + goose，实现冻结 **OpenAPI 1.12.0 / 68 操作**（内嵌 JSON 快照 68=68）。分层 `cmd{server,migrate,seed,data}` + `internal` + `test`。定位**教学代码**（评分权重最高 =「注释与教学可读性」25 分）。
- 门禁 `review/check_go_quality.go`（Go AST，13 断言 + `--selftest`）；探针 `review/check_go_ast.go`。**默认排除 `_test.go`**（否则 229 行 `TestAllOperations` 带偏口径）。`make verify` = gofmt + vet + `sync-contract.cjs --check` + test。定性：**工程判断力强，缺「面向人的表达」**（与 Flutter 那轮相反）。
- **我撤回的论据**：「`e` 会让 errcheck 格格不入」不成立（errcheck 查未处理错误，与变量拼写无关）。
- **作者「不把重复文本做成硬门禁」→ 裁定接受**：`storage` 的 `Local/R2` 三对文档逐字相同却**正当** → 硬门禁会误报。**字符串相等既非充分也非必要，正确性对应需人工核对。**
- **⚠️ 我被作者订正、复现确认他对我错（已回写第三轮报告 §11）**：我曾称「`go/doc` 每包只取一处 package 注释、其余无效」——**错**。两把尺（`go doc` CLI + `go/doc.NewFromFiles`）实测：同包多份说明是**换行拼接**，相同文本也不合并。→ 问题是**可维护性**（改 N 处、漏改会自相矛盾），**不是可见性**。**根因 = 把我自建扫描器的输出当成工具链通用行为**（同报告栽两次）。
- **跨项目可复用**：**「文档唯一性」不止符号级，还有包级**——但**危害是维护、不是可见**。检测须用真语法树；**且警惕「自建工具的输出 ≠ 工具链通用行为」**——两把不同原理的尺交叉才收口。包注释口径已收口（`01-Go工程最佳实践 §8` = 统一中文 + 同包一份；新增 `scripts/doccheck` 纳入 `make verify`）。
- **登记残留（不阻断）**：含测试口径 4 类（测试函数文档缺 37 / 包文档缺 1 / >80 行函数 5 / >120 字符行 35）。

## M2 前端（React 管理后台）
目录 `manage-frontend/`，Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5 + RHF7/Zod4 + Biome2.5，`strict`，dev 12000。取数：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`；信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；token 内存不落 localStorage；附件 `ORIGIN + /files/<key>`。CORS 方案 B（owner 暂定）：dev 走 Vite 同源代理。

## 工具坑（本环境实测，跨轮反复踩）
- ⚠️ **`grep` 的 `\|` 静默假阴性（最坑）**：本环境 `grep` 是 brokered shim，**不支持 BRE `\|` 交替 → 静默返回 0**。**禁忌写法 `\|`；改用 `-E`/`-e` 或内置 Grep 工具**。核验「已发布范围零残留」以 `check_links.py` 的 [C] 项为准。
- zsh 下 `grep --include=*.go` 失效（未加引号不展开 glob）→ 指标全报 0。**代码统计走 AST/Python。**
- **状态判定要用结构化字段（列），不能用整行子串**（`check_links.py` 曾被标题字面「已发布」骗到）。
- **正则交替必须最长优先**：`ts|tsx` 会把 `index.tsx` 截成 `index.ts` → 误报不存在路径。**写 `(tsx|ts)` 或加边界。**
- `git diff <中文路径>` 因 macOS **NFD/NFC** 不匹配**静默返回空**（改用 glob）。
- 沙箱：Bash 单次读约 10~20 文件即 SIGTERM(137)，需分片。

## 待 owner 裁定 / 待办
- **M5 文章优化**：目标线已提至 M4 优化后中位，全面铺开中（见「当前进度」）。
- **M6 含测试口径待 owner 决定（非缺陷）**：`--with-tests` 仍有 4 类失败；标准定义的是「生产 13/0」；若纳入同一把尺则需整改。建议**登记不阻断**。
- M4 设计侧 13 项口径（见上）。
- **发布维护 · ARTICLES.md 缺 M6 / M7 / B 三整段（10-09 登记）**：现有段仅 M0~M5。M6 33 篇已完成（建段时机已到）、B 20 篇、M7 11 篇（**10-09 会话期间仍在实时落盘**）。→ 待 owner 定：是否补建、按什么顺序（建议 M6 → B → M7，M7 待其写稳）。
- **发布维护 · 「六个端 vs 七个端」口径（10-08 owner 拍板后收口，**极易误判**）**：`六个端` ≠ 一律是错，**必须分槽位**——① **正文槽 = 刻意校准口径**：`六个端` = **M2–M7 六个消费端**，与 `七个端`（含 M1 实现端）并存（M0-05 L15 原文「七端共同遵守的协议——M1 实现它，**其余六个端（M2–M7）**共同消费它」；同见 M0-04:106 / M0-08:52 / 配图提示词 / M0 改造清单）→ **正确，禁改**；② **标题/引用槽 = 必须「七个端」**（ARTICLES.md / 索引 / M0-05 正文标题三处互证）。**判据 = 该处是在引用标题、还是在描述消费端数量**；**禁止对「六个端」做全仓无脑替换**。已修的两处标题槽：`articles/M4-03:268`、`docs/prd/01-内容路线图.md:94`（后者超出常规维护面，但属同类标题槽错误 + 疑似前者错误来源，owner 已授权此类「明显错误」可自行修正）。
- **发布维护 · ARTICLES.md 链接列格式已归一（10-08）**：全表 **裸 URL**（87 行）；M3-20~24 的 `[ID](URL)` 5 行漂移已修，`[ID](URL)` 残留 **0**。→ 后续新增行一律写裸 URL。owner 授权「此类明显错误可自行调整」，不必再逐次上报。
- 收官「全量重发」覆盖累积清单（含所有发布后被回填/修正的篇）。
