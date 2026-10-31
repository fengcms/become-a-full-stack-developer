# 项目长期记忆 ·《成为一个全栈开发工程师》

> 维护约定：只留**跨会话仍有效**的事实（决策、口径、工具坑、状态）。过程细节写进当日 `YYYY-MM-DD.md` 或 `docs/**/review/`。当前进度一行一改。

## 性质
以真实多端文章系统为素材载体的全栈技术专栏。文章是产品，代码是素材；文章优先、每切片成文即停，不做生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`），owner FungLeo。

## 关键决策（不可擅改）
- 栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（适配层）。七端共享一份 OpenAPI，变更先改契约再改实现。
- 角色三角 `member/editor/admin`（注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管内容不管用户/角色/站点配置）。文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树；阅读量防刷（去重+24h 冷却+计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；`GET /articles/{idOrSlug}` 对作者本人与 admin 放宽（投稿预览页用它，无私有端点）；后台筛选走 `GET /admin/articles`。

## 契约基线（openapi 1.12.0 / 68 操作）
- 语义门 `check_contract.py` 33 OK。改契约必复跑双门（托管 venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 机器化：`x-authz`（minRole+ownerOverride）；`Article.status.x-allowed-transitions`；错误码分段 1xxx 认证/2xxx 授权/3xxx 资源/4xxx 参数/5xxx 服务（5001=限流）；21/67 声明 429。
- **schema 陷阱**：`articleCount` 只在 `Tag/CategoryStat/SiteStats/MemberProfile`；`TocItem`=`level/text/anchor`（anchor 算法未公开）；`GET /files/<key>` 挂根路径、不带 `/api/v1`（已知例外）。

## 编号与协作
- 编号：M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇，周更 2 篇。根 `ARTICLES.md` 做「标题↔里程碑↔URL」对照。
- 写作归统筹 AI；发布维护归独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md`）。评审 AI 只审、只写报告，不写代码/不修 BUG/不代写回复文档。
- blog AI（`/Users/fungleo/Documents/Blogs`）：`csdn_backup.py` 抓取；`materials/csdn-已发布链接.md` = 已发布 ID/URL 单一真相源（**必须托管 venv 跑 `run --refresh-ids`**）。详见 `docs/链接与发布协作约定.md`。

## 发布维护 Agent 本职（边界，不可越界）
- **只做机械维护**：① 新 URL 镜像进 `ARTICLES.md`（🟢）；② 逐轮回填 `{{LINK:Mx-yy}}`；③ `docs/publish-maintenance/check_links.py` 全量审计（退出码 0/1/2）。**不写正文、不改文案措辞、不打 tag、不改索引文件**。
- SOP：同文件相邻多行一次 Edit 整块替换（避写竞争）；批量回填带命中次数断言、**填后残留为最终判据**（上一轮曾因计数告警误中止，已改填后核验）；链接列写裸 URL。
- 占位形态：M1 裸 `{{LINK:Mx-yy}}`；M2 起 `[标题]({{LINK:Mx-yy}})`；**M6/M7/B 实际用 `{{LINK:M6-xx}` / `{{LINK:M7-xx}` / `{{LINK:B-xx}`**（⚠️ 记忆曾记"M6 用 GO-xx"与实际文件不符，以实际为准）。`check_links.py` 仅读**状态列+路径列**，不校验标题。
- 真实 CSDN 标题以 `csdn-已发布链接.md` 为准；ARTICLES.md 是短标题（M1/M4 段甚至是文件名式），不可直接当 CSDN 标题。
- 延伸阅读判定铁律（文章优化线口径，供回填参考）：`{{LINK:Mx-yy}}` 同系列 `yy<xx`（向后）= 合规（发布即回填）；`yy>xx`/自引用/跨系列未发布 = 必改。
- **「六个端 vs 七个端」双口径（10-08 收口）**：正文槽 `六个端`=M2–M7 消费端（正确，禁改）；标题/引用槽必须 `七个端`。判据 = 该处引用标题还是描述消费端数量；**禁止全仓无脑替换**。

## M6 文章质量基线（10-24 评估 → 10-24 P0/P1/P2 已治理）
- **治理前**：M6 = 工程报告体，中位 3146 汉字、代码块 4、表格 13 行、套话 2.1/万字、**第一人称仅 4.3/万字**（M4 50.5、B 59.4）；33/33 首节「前言」+ 33/33「小结」+ 首部摘要引用块 → 与 M7 完全同模板。强项 = 边界声明（32/33）、代码快照（27/33）、数字证据密、**跨篇重复长句 0**。
- **P0 围栏已统一（10-24）**：M6 原用 `~~~`（**252 个围栏 = 126 个代码块**，只有 M6-11 用 ```），已全部改 ```。现 M6 行首围栏 262 个（126 块 + M6-11 的 10 行），`~~~` 归零、全成对。⚠️ 早前记"126 个围栏"是错的，126 是**代码块数**，围栏数是它的两倍。
- **P1 亲历钩子（10-24）**：33/33 篇在 `## 前言` 标题下插入**单段**第一人称场景（40–80 汉字），保留原摘要块/封面/快照声明与前言正文。**铁律：钩子只写场景，不写解决方案或"本文讲什么"**——写了就会和原 `前言` 后续段落重复（首版两段式即踩此坑，M6-13/M6-21 重复明显，已全部收回单段）。
- **P2 M6-33 加厚（10-24）**：1895 → **2509 汉字**，补 3 个 Go 代码块（`auth.Public` 投影 / UpdateUser 三步事务 / `siteSettingColumns` 白名单）+ 4 段论述。零代码块篇数 8 → 7（余 08/09/10/29/30/31/32，均决策/复盘类，不贴代码合理）。
- **代码块口径（第三次踩）**：` ``` ` 数 + `~~~` 数；且**备份文件口径不同时不可直接对比**——用旧备份算"改前字数"若不认 `~~~`，会把代码块里的字算进正文，得出"改后反而少了"的假结论。

## 脱敏红线 · 真实域名（10-21 收口）
- 文章（**仅 `articles/`**）中真实业务域名已全部替换为 IANA 保留示例域名（RFC 2606/6761）：`api-befull.kao9.com`→`api.example.com`、`manage-befull.kao9.com`→`manage.example.com`、`befull.kao9.com`→`www.example.com`。已落地 16 篇 40 处，**articles 零 kao9 残留**。
- 🔴 **代码与 docs 里的 95 处是"真运行配置"（`flutter-app/lib/main.dart`、`taro-miniprogram/config/index.ts`、`node-backend/wrangler.toml`、`manage-frontend/vite.config.ts` 等），改了程序连不上后端——永不可改**。
- **子串陷阱**：`befull.kao9.com` 是 `api-befull.kao9.com` 子串，替换顺序必须**长→短**，否则削成 `api-example.com`。
- **转义形态要单独处理**：正则字面量 `befull\.kao9\.com`、`grep kao9` 这类不会被 `\.kao9\.com` 正则命中 → **扫指纹先按裸关键词宽口径扫，再分类**。
- 语义冲突处理档位：示例域名与"真实线上环境"表述打架时，加括号说明（如"（文中用示例域名替代实际地址）"），不删原论断。

## 文末「专栏订阅」推广段规范（10-19 收口）
- **标准形态（明文版，owner 指定）**：`---` → `如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：` → `🔗 专栏地址：[完整URL](完整URL)` → `📦 本系列配套代码仓库：[完整URL](完整URL)` → `![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)`。
- **标准位置**：`## 延伸阅读` **之后**、`<!-- PUBLISH_ASSIST_START` **之前**（正文最后一块）。放在延伸阅读之前 = 错，读者在末尾看不到。
- **链接必须明文**（`[https://...](https://...)`），**禁用短写**（`[成为全栈](url)` / `[fengcms/仓库名](url)`）。
- 已统一：**M0/M1/M2/M3/M4（基准）**、**M5（24）**、**M6（33）**、**M7（24）**、**B（20）**、M1-05。全仓 217 篇终态：明文 207、短写 0、角括号 0、**早期形态 10 篇**（M0 全 8 + M1-01/02，只有两条 bullet「本系列专栏 / 完整项目仓库」，无 CTA 句与订阅图，未改待 owner 拍板）。
- **四种历史形态**（按时间由早到晚）：① 早期 bullet 版 → ② 短写 `[成为全栈](url)` → ③ 角括号 `<url>`（仅 M1-05） → ④ **明文（现行标准）**。排查顺序：先判有无「如果这篇文章对你有帮助」，再看链接写法。
- **校验陷阱**：① 明文形态下 URL 在文本+href 各一次，判定唯一性要用「如果这篇文章对你有帮助」计数，不能用 URL count；② 数真图要过滤代码块里的示例串（只认 `url.startswith('http')`）；③ 已发布篇（如 M5-01~04）本地源文件已无 `{{IMG}}`，配图口径=占位符数+真图数==3。

## 通用工作铁律（用户级，长期有效）
- 不采信自陈（含评审报告）：结论必附实测证据，逐条复验；单一工具的「绿」只是「这把尺子说绿」→ 关键指标换原理第二把尺交叉验证。
- 先根因分析，不仓促打补丁；阻碍即停（阻断卡点立刻报 owner）。
- 用户自管 git commit，AI 不自动提交。统计走 AST/Python，不用 shell grep。
- 并发写：同文件多处编辑串行；改前读最新、改后复核。检索先 Glob 拿真实文件名。记忆 append-only 协作，不恢复旧版。

## 当前进度（2026-10-26 快照）
- **发布**：M0 8 / **M1 34（全部发完，10-18 收官）** / M2 22 / M3 24 / **M4 28（全部发完，10-17 收官）** / **M5 24（全部发完，10-24 收官）** / **M6 22/33（M6-01~22 已发，10-30）** / M7 24 / B 20。已发布累计 **162 篇**（ARTICLES.md 🟢 行）。CSDN ID 真相源 = `csdn-已发布链接.md`。
- `articles/` 共 **217 篇**；`ARTICLES.md` 九段齐备（M0~M7+B，2026-10-13 补建）。
- 文章优化：M5（24/24 PASS，10-10 收官）；M6（标杆 3/3 PASS，待 owner 铺开余 30 篇）；M7/B 未优化。

## 各端状态快照（已交付线）
- **M4 Flutter**：已交付、设计侧冻结、代码审阅结项通过。`prototype/gates/` 门禁全绿；`check_ui_standard.py` 零色值门禁。配图规范 = 每篇 1 封面+2 内图（`{{IMG:Mx-xx-名}}`）；延伸阅读禁前向引用。可复用：三代量程教训、`place-items:center`≠多子项叠中等门禁硬规则。
- **M6 Go**：已交付、审阅结项 98/100 冻结。可复用：文档唯一性（包级，危害是维护非可见）；警惕「自建工具输出≠工具链通用行为」。
- **M2 React**：`manage-frontend/`（Vite+React+TS+Tailwind+shadcn/ui）。
- 双前台：`web-frontend/`=主力（白/晴蓝）；`web-frontend-trae/` 已替代。

## 工具坑（本环境实测，跨轮反复踩）
- ⚠️ `grep` 的 `\|` 静默假阴性：本环境 grep 是 brokered shim，不支持 BRE `\|` 交替→静默返回 0。禁 `\|`；用 `-E`/`-e` 或内置 Grep 工具。
- zsh 下 `grep --include=*.go` 失效（未加引号不展开 glob）→ 指标全报 0。代码统计走 AST/Python。
- 状态判定用结构化字段（列），不用整行子串（曾被标题字面「已发布」骗到）。
- 正则交替最长优先：`ts|tsx` 会把 `index.tsx` 截成 `index.ts` → 写 `(tsx|ts)` 或加边界。
- `git diff <中文路径>` 因 macOS NFD/NFC 不匹配静默返回空（改用 glob）。
- 沙箱：Bash 单次读约 10~20 文件即 SIGTERM(137)，需分片。

## 待 owner 裁定 / 待办
- 收官「全量重发」覆盖累积清单（含所有发布后被回填/修正的篇；**线上占位残留根因 = 前向引用，本地源干净≠线上干净**）。
- M6 含测试口径待定（`--with-tests` 4 类失败）；M6 铺开余 30 篇待拍板。
- M4 设计侧 13 项口径待拍板（全表 `07 §12`）。
- ARTICLES.md M1/M4 段标题仍是「文件名式短标题」历史遗留（非维护面，未动）。
