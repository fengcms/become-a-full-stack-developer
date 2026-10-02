# 项目长期记忆 ·《成为一个全栈开发工程师》

## 项目性质
用真实多端文章系统作素材载体写全栈技术专栏。核心定位：**文章是产品，代码是素材**；文章优先，每切片成文即停，不追求生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）。用户 FungLeo，CSDN 前端专家。

## 关键决策（不可随意变更）
- 技术栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（须写适配层）。
- 角色三角 `member/editor/admin`：注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管全站内容不管用户/角色/站点配置。
- 文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树（`GET /categories/tree`）；阅读量防刷（去重+24h 冷却+计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **公开可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；**但 `GET /articles/{idOrSlug}` 对作者本人与 admin 放宽**（故投稿预览页用它，不需私有端点）。后台筛选走 `GET /admin/articles`。
- 领域模型+API 契约是七端共同地基；**变更先改 OpenAPI 再改实现**。

## 契约基线（v1.14 / openapi 1.11.0，已冻结 2026-08-11）
- 双门全绿：结构门 OK；语义门 `check_contract.py` **33 OK**（**53 路径 / 67 操作** / 45 schema / 46 x-authz）。改契约后必复跑双门（venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 机器化约束：`x-authz`（minRole+ownerOverride）；`Article.status.x-allowed-transitions`；错误码分段（1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务，5001=限流）。
- 非阻塞 TODO：树环检测、阅读去重、Comment 状态机未机器化（刻意留 PRD 层）；OAuth redirect 白名单；`GET /me/likes` 分页形态内部矛盾待整改。
- **易踩的 schema 级陷阱**：`articleCount` 只在 `Tag` / `CategoryStat` / `SiteStats` / `MemberProfile` 上；**`Category` 与 `CategoryNode`（分类树返回项）没有**——分类树别照抄标签页的数字，需按分类计数要另取 `GET /categories/stats`。

## 文章编号体系
M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇，周更 2 篇。
git tag 里程碑式（`contract-v1.11.0`、`node-backend-v1.0`…）；M0 不打 tag；废止 per-article tag。根 `ARTICLES.md` 做「标题 ↔ 代码里程碑 ↔ URL」对照。

## 协作约定（权威文本在 docs，本处只留要点）
- **写作分工（A 计划）**：文章写作归统筹 AI；发布维护 M1 起归独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md` + `启动提示词`）。
- **blog AI**：工作目录 `/Users/fungleo/Documents/Blogs`；`csdn_backup.py` 公开抓取；`links` 生成 `materials/csdn-已发布链接.md`（单一真相源，**只聚合 `old-blogs/*.md` 的 frontmatter，不抓网**）。索引过期时**不算阻断**，owner 已授权自跑 `run --refresh-ids` → `links`（**必须用托管 venv**，系统 python3 缺依赖）。详见 `docs/链接与发布协作约定.md`。
- **每轮发布维护三件事**：① 新 URL 镜像进 `ARTICLES.md`（🟢）；② **逐轮**回填指向已发布篇的 `{{LINK:Mx-yy}}`；③ 全量链接审计。已落成脚本 **`docs/publish-maintenance/check_links.py`**（+同目录 README）：出 A 幽灵链 / B 真错链（严格口径）/ C 占位残留，退出码 0 绿 / 1 有缺陷 / 2 输入缺失。两个真相源：A/B 用 blog AI 索引，C 用 `ARTICLES.md` 的 🟢 行。
- **中途不重发**（owner 2026-09-21）：系列发布期间不更新已发布文章，本地源改动一律累积，**全系列发完后一次性全量更新到 CSDN**。
- **占位形态**：M1 裸 `{{LINK:Mx-yy}}`（替换成完整 `[标题](URL)`）；M2 `[标题]({{LINK:Mx-yy}})`（**只填 URL**）。
- **并发写铁律**：同文件多处编辑必须**串行**（并行会写竞争静默丢改动），不同文件才可并行；改前先读目标文件最新内容（行号会漂移），改后再复核一次。
- 检索纪律：查文章先 Glob 拿真实文件名（勿猜编号）；按目标编号逐个精确 grep 核验覆盖。
- 占位残留是**移动靶**：写作线并发改稿会新写入占位，每轮收尾须动态复核，命中即补。

## 文档位置
- 00-项目章程（v1.14）/ 02-领域模型与API契约（v1.14）/ 01-内容路线图（v1.15）
- 契约 `docs/api/openapi.v1.yaml`（1.11.0）；语义自查 `docs/api/check_contract.py`
- M1 计划 `docs/prd/M1-后端实现计划.md` + 批次任务包 `docs/prd/m1-tasks/00~07`
- 发布维护：岗位说明书 + 启动提示词 + **SOP-C 脚本 `docs/publish-maintenance/`**
- M4 Flutter：`docs/flutter-app/README + 01~06`、`prototype/`、`review/`

## 当前进度
- **M0 产品篇 8 篇收官**（08-29）；**M1 Node 后端已冻结**（tag `node-backend-v1.0`，08-27；tsc 0 / biome 0 / vitest 133 / 契约双门 33 OK），已部署 Cloudflare 全链路 GREEN（`api-befull.kao9.com`），域名、部署指南与验收报告在 `docs/node-backend/`。后续 BUG 走增量维护，不热改主干。
  - 部署 FAQ 四坑：R2 binding 名对齐 `env.ts` 的 `R2_BUCKET`；D1 改密码须 bcryptjs(12) 同源且含 `$` 用 heredoc；curl `-F file=@` 的 `~` 不展开；**`GET /files/<key>` 挂根路径不带 `/api/v1`**（也**不在契约 paths 中**，属已知例外）。
  - 本地：`bash scripts/dev-local.sh`（:11000，admin/admin123456）；`scripts/seed-articles.ts`（幂等，把 M0–M3 md 以 published 写入）；`readEnv` 强制 `JWT_SECRET`。
- **发布进度（2026-10-02）**：M0 全 8、M1 全 31（09-16 收官）、M2 全 22（09-28 收官）、**M3-01~11 已发布**（10-01 止，M3-12/13 待发）。M3 共 24 篇。
  - ⚠️ **线上占位残留**（09-28 实测）：已发布正文备份中 37 篇含 `{{LINK}}` 原始文本共 72 处，根因是**前向引用**（发布时目标篇尚未发）。**结论：本地源干净 ≠ 线上干净**；收官须**逐篇以本地源重新覆盖**（做一轮「全量重发」，不做按需精选）。
  - SOP-C 审计基线（10-02）：幽灵链 0 / 错链 0 / 占位残留 0。
- **双前台目录歧义已澄清（10-02）**：`web-frontend/`＝**纯白／晴蓝 A 方案**（2182 行 CSS，含会员投稿/叠楼评论，**当前主力**）；`web-frontend-trae/`＝极简编辑风（226 行，已被 `web-frontend/docs/01` 明示替代）。**任何端取视觉基准一律以 `web-frontend/` 为准**。根 `README.md` 仍写旧说法，待 owner 定 canonical。
- **七端缩水观察**：`go-backend/` 与 `app-frontend/` 仍 0 文件；实际只交付 Node 后端 + `manage-frontend`(React) + `web-frontend`(Next)，Flutter 进入设计阶段。Go/Taro 是否仍属范围待 owner 确认。
- **下一步**：M4 Flutter 进 Phase 0（工程骨架 + 认证链路）；M3 继续发文章。

## M4 Flutter APP（2026-10-02 启动）
- 规划基线 `docs/flutter-app/README + 01~05` 已过第一轮评审（91/100，可进 Phase 0）。
- **UI 设计三步已交付**（owner 确认「满意」）：
  - ① `06-UI设计规范与设计令牌.md` — **视觉唯一事实源**。浅色继承网站 A 方案，深色为 APP 新增独立设计。**三处必须保留的刻意例外**：浅蓝底上文字用 `brand.onSubtle #2A6AA3`（`#3277B5` 在其上仅 4.29:1，不达标）；深色主按钮实底 `#37709F`；待审 `#7A6122`、草稿 `#5C6C80` 已加深（网站原值不达标）。
  - ② `prototype/01-基本页面样稿.html` — 首页 + 详情双屏、双主题。
  - ③ `prototype/02-高保真可交互原型.html` — 单文件自包含，覆盖 `02-页面地图` 全 18 页 + 兜底；hash 路由 / 三主题 / 状态四态注入 / 登录态切换；左导航树 + 393×852 设备 + 右页面规格说明。
  - ③ 配套 `prototype/app_theme.dart` — `ThemeExtension` 全量令牌 + `buildAppTheme()` + `AppLayout`（textScaler 夹紧 1.3）+ 状态/错误文案映射；M4 建工程后移到 `lib/app/theme/`。
- **第一轮评审与回复（2026-10-02，xtgxiso）**：评审报告 `review/M4-设计AI原型第一轮评审报告.md`（本侧 88.5/100）+ 产品 AI 侧同目录另一份；我的回复 `review/M4-设计AI原型第一轮评审回复.md`（**v2**）。**B-1~B-7 + B-0 八项全部采纳，无驳回**；**另加 1 项自查发现 N-1**。门禁（v2）：语法 OK / 运行时零错误 / 交互 **69/69** / 全路由 **20/20**（19 路由 + 兜底，从源码 `ROUTES` 程序化抽取）/ **原型 57 条 API 标注与契约 57/57 一致** / Dart **39:39:39:39**（字段·构造器·copyWith·lerp 四表交叉）。
  - 关键改动：移除「举报内容」（契约无端点）；清掉详情页不可达的**评论审核态徽章**（含评审未指出的 `rejected` 徽章）并新增「发帖被拒即时反馈」；订正 10 处 API 标注 + 补 5 个遗漏端点；复制链接改走剪贴板（失败不谎报成功）；删除评论措辞改「一并删除」；补 `heroWashFrom/To` 与 `AppLayout`；压 hero 高度（首屏露出 2 条列表）+ 详情顶栏加「目录」入口。
  - **一处部分采纳**：评审建议把目录入口移到正文前，但 `02 §4` 有「正文优先、操作条不遮挡正文」硬要求 → 改为**顶栏加入口**，面板位置不动。
  - **🔴 N-1（评审未指出、我自查，本轮最高价值）**：编辑页对任何状态都无条件渲染「保存草稿」→ 待审稿件点它即**变相撤回**（契约对「会员更新 draft/pending」结果未定义，`PUT` 只写 published→pending，请求体 `status` 无约束而 `draft` 是合法枚举）→ Node/Go 会分歧。**B-0 只堵了显式按钮，隐式后门还在**。已修：按钮矩阵 `draft`→保存草稿(次)+提交审核(主)；`pending`→保存(主)、无提交审核；`published`→保存(转 pending)。**口径与文档侧一致**（产品 AI 已落 `02:49-50` 状态矩阵 + `03:49` 不得下发 status）。
  - **并发写保护经验**：动手前发现 `prototype/01·02`、`app_theme.dart` 及多个 docs 已被另一批未提交改动覆盖 → **核哈希 → 确认写入方停手（md5 稳定两次）→ 按当前磁盘状态续做，不回退他人改动**。`06` 归属有争议（评审划给产品 AI，实为设计 AI 撰写且已被产品 AI 修订），本轮只做 1 行最小订正，**已请 owner 明确归属防双写**。
  - **可复用规程**：① 能程序化从被测对象自身推导的期望值（路由表/字段表/端点表）**绝不手写**——手写清单会把「清单写错」伪装成「测试通过」；② `switch` 判 `act.split(':')[0]` 时 case **不能含冒号**；③ 断言「某文本已消失」必须先排除 `<script>` 源码（在 `<body>` 内）。
  - **两条复用纪律**：① 详情页这类「只返 approved」的公开接口，**不可渲染 reviewing/rejected 态**（不可达 = 误导性 UI）；② 判断「某文本是否消失」时**必须先排除 `<script>` 源码**（`body.textContent` 含脚本源码→假阳性）。
  - **坑**：`handleAct` 里 `switch` 判的是 `act.split(':')[0]`，写 `case 'toc:panel'` 永远匹配不上且**静默失效不报错**——复合 case 必须写成 `case 'k'` + `if(a === '...')`。
  - ⚠️ **发现并发写**：本轮动手前 `prototype/*` 与 `docs/flutter-app/*` 已被另一 Agent 部分修改。规程：先核对哈希 + 确认写入方停手，再按当前磁盘状态续做，不回退他人改动。
- **第二轮评审与回复（2026-10-02，eno，89/100）**：报告 `review/M4-设计AI原型第二轮评审报告.md`；回复 `review/M4-设计AI原型第二轮评审回复.md`（**v2**）。**N-2-1~N-2-6 六项全对，零驳回**（逐条独立复现，含反向核查）。
  - N-2-1 🔴 P1 目录点击**只弹 toast 不滚动**（评审实测 `scrollTop 420→420, Δ=0`）→ 根因是**手写 `TOC` 与正文各写一份**（双源必漂移）→ 改**单一真相源** `SECTIONS[]` 渲染正文 + 派生 `TOC` + `scrollToSection()` 真滚动（拿不到锚点返 false 如实提示）。
  - N-2-2 文章对象挂 `Comment` 专属 `rejectedReason` → 删；N-2-3 `POST/DELETE` 未统一（**门禁归一化把这类真缺陷洗掉了** → 加断言「分隔符必须逗号」）；N-2-4 `01` 样稿详情顶栏缺「目录」→ 补；N-2-6 正文内 `.toc-bar` 是 `02 §4` 未枚举的第三形态 → **选方案 B 删除**。
  - N-2-5（流程）**门禁脚本未随交付 = 第三方无法复跑** → 新建 **`prototype/gates/`（881 行、零第三方依赖、`bash run_all.sh` 一键、退出码 0）**：路由 **41/41**（从源码 `ROUTES` 程序化抽取）/ API vs 契约 **57/57**（零依赖 YAML 扫描，契约键带 `/api/v1` 须先归一）/ Dart **40:40:40:40** + 65 色值逐值 / 交互 **51/51**（真点击读 DOM/`scrollTop`）。**做过两次注入回归证明断言非空转**。
  - **🔴 我额外自查发现 2 项**：① **「删除评论」流程完全不可达**（`cmt-del` 只在「顶层评论 且自作者」渲染，而种子数据 ME 只有回复 → 两条路都死；同 B-2 类）；② **`color.line.button` 规范有、Dart 无** → B-6 实际 3 项 → 令牌 **39:39:39:39 → 40:40:40:40**。
  - **D 门禁反查出的规范缺口**：`codeBg`/`codeFg`/`skeleton` 在 Dart 与原型 CSS 都在用，`06 §2.1~2.4` 却**没写**（属规范侧问题，不计 Dart 的错）。
  - **新增可复用：第三方 harness 交叉复现**（防「自写门禁自证清白」）——用与本侧零代码共享的通用探针复测 P1：`scrollTop 0 → 1362`、toast 为第 3 节真实标题 → 两套 harness 结论一致。
  - **🔴 环境坑（耗时最多）**：本机跑无头 Chrome **必须同时加 `--no-sandbox` + `--no-proxy-server`**。缺前者 → `sandbox initialization failed: Operation not permitted` → GPU 退出 → 网络服务崩 → CDP 端口永不开启；但 Node 侧只报 `unsettled top-level await` + **退出码 13**，**报错完全指向探针脚本而非环境**。缺后者 → 本机 `HTTP_PROXY=http://127.0.0.1:65413` 使 Chrome 连 `127.0.0.1` 也走代理。排查：spawn 时别 `stdio:'ignore'`，看 Chrome stderr。**已回写 `~/.workbuddy/skills/html-artifact-headless-probe/`**（probe.mjs 默认带上 + `--keep-sandbox` 可关；cdp-recipes 陷阱 11–13）。
  - ⚠️ **BSD grep `\|` 假阴性本轮又踩一次**：查 N-2-3 时 `grep "a\|b"` 返 0 命中，一度以为评审错了 → 必须 `grep -E`。

- **产品 AI 文档评审（第一~五轮，2026-10-02）**：报告 `review/M4-产品AI设计文档第N轮评审报告.md`，评分 91→93→94→**95**（第五轮）。第四轮 6/6 全闭环；第五轮新增 N-18~N-24。
  - **满分冲刺工单已交付**：`review/M4-产品AI设计文档满分冲刺工单-95到100.md` —— 5 分扣分账本 + G-1~G-5 **六段式**工单（扣分归属/契约证据/精确落点/**现状原文**/**可直接替换的成稿文本**/复核命令）+ **10 条自检脚本**（改前实跑验证 `PASS=0 FAIL=10`）+ 权限边界声明。改动量约 12~15 行，改完自检全过 → 第六轮预期 **100**。
  - **🔑 本轮核心洞察（可复用）**：前四轮补的是「**契约有、文档没写**」→ 补登记即闭环；剩余 5 分全部是「**契约没写、文档当有**」→ 必须**降级为待验证项 + 登记 + 设实测落点**。这是"补登记"方法的盲区。
  - **第五轮报告已发 v1.1 自我订正两处**：`§3.4` 差异表行数 16→**12**（笔误，脚本实测）；`§2 N-21` 补引 `/adjacent` 404 原文「文章不存在**或不可见**」（初版漏引）。补正后定性更锐利：同族三端 `view` 明确 / `adjacent` 隐含 / **`toc` 完全未表态**。
  - 关键契约事实：**67 operation / 21 声明 429**（含 callback）；`ArticleCreate.status` **只约束 `published`**（`slug` 自陈"与 status 同规格"却写全三路径矩阵 → 反证 status 是**遗漏**非刻意模糊）；`TocItem`=`level/text/anchor`，**无顺序字段**，`anchor` 全契约仅 2 处命中。
  - ⏳ **待 owner 拍板**：`06` 归属（建议设计 AI）；契约回流建议（`TocItem` 补顺序保证 + `ArticleCreate.status` 补 member×取值矩阵——属"把已有实现的事实写成文字"，最易推动）。

## M2 前端（React 管理后台）
- 目录 `manage-frontend/`。栈：Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5（仅鉴权）+ RHF7+Zod4 + Biome2.5；已开 `strict`；dev 端口 12000。文档在 `docs/manage-frontend/`。
- **取数铁律**：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`（**不是** `{items,total}`）；信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；accessToken 内存不落 localStorage。
- **附件 URL**：`ORIGIN + /files/<key>`，**不带 `/api/v1`**（否则 404）。
- **CORS 方案 B（owner 暂定）**：dev 走 Vite 同源代理；代价是「空体→HttpOnly Cookie」分支 dev 无实测，上线前须验证。
- 第一轮审阅已收口（83/100）；owner 已裁决：编辑器 chunk 563 kB 超线**接受不改**、高亮语言 297→41、Cookie 分支延至上线前。下一步 Phase 2 评论审核。

## 通用工作铁律
- **评审角色铁律**：评审 AI 只审、只写报告，**不写代码、不修 BUG、不代写回复文档**。
- **阻碍即停**：遇阻断性卡点立刻停下报 owner，不得自行绕过自造 workaround（**例外**：owner 已书面授权的兜底路径属正常执行）。
- **不采信自陈**：结论必附实测证据（门禁输出、脚本比对、grep 取证）；改配置后验证是否真生效，而非只看"没报错"。**包括不采信评审报告本身**——逐条独立复验。
- 用户自管 git commit，AI 不自动提交。门禁：`pnpm typecheck` / `lint` / `test` / `build`。
