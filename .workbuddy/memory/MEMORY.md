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
- 发布进度（10-02）：M0 8 / M1 31（09-16 收官）/ M2 22（09-28 收官）全发完；**M3 已发 01~11**（共 24 篇）。⚠️ 线上占位残留：已发布正文 37 篇含 `{{LINK}}` 72 处（根因前向引用）→ **本地源干净 ≠ 线上干净**，收官须「全量重发」。SOP-C 基线：幽灵链/错链/占位残留全 0。
- **双前台歧义已澄清**：`web-frontend/` = 纯白/晴蓝 A 方案（2182 行，含会员投稿/叠楼评论，**主力**）；`web-frontend-trae/` = 极简编辑风（226 行，已被替代）。**取视觉基准一律以 `web-frontend/` 为准**。
- 七端缩水：`go-backend/`、`app-frontend/` 仍 0 文件；实交付 Node 后端 + `manage-frontend`(React) + `web-frontend`(Next)，Flutter 在设计阶段。

## M4 Flutter APP（设计阶段）
- 文档 `docs/flutter-app/README + 01~06` + `prototype/` + `review/`。`06-UI设计规范与设计令牌.md` = **视觉唯一事实源**（浅色继承网站 A 方案，深色为 APP 新增）；三处刻意例外：浅蓝底文字用 `brand.onSubtle #2A6AA3`、深色主按钮实底 `#37709F`、待审 `#7A6122`/草稿 `#5C6C80` 已加深。
- `prototype/01` 静态样稿；`prototype/02` 单文件可交互原型（18 页 + 兜底、三主题、四态注入）；`app_theme.dart` = ThemeExtension 全量令牌。
- **产品 AI 侧：第五轮 95 → 满分冲刺工单（10 条自检断言）→ 整改验收 100/100，已冻结**（基线 `18da8b9`）。核心洞察：前四轮补的是「契约有、文档没写」（补登记即闭环）；剩余 5 分是「**契约没写、文档当有**」→ 必须降级为待验证项 + 登记 + 设实测落点。
- **设计 AI 侧：第三轮 95 → 第四轮 97**。第三轮 A-1（P1）原型自造锚点 `h-N` 与冻结口径（`01:18`/`03:13`/`03:67`「key 用服务端 anchor，客户端不自行 slug 化」）冲突 → 已按方案 A 修（`SECTIONS` 加 `anchor`/`level`，`TOC` 与 `TocItem` 同形）。第四轮新发现 A-5（P2 辅助子资源失败态缺席）+ A-6~A-8（P3）。
- 设计侧门禁 `prototype/gates/`（零第三方依赖、`bash run_all.sh`）：路由 41/41 · API vs 契约 57/57 · Dart 40:40:40:40（+65 色值）· 交互 54/54 · 退出码 0。
- 待 owner 拍板：`06` 归属（建议设计 AI）；契约回流（`TocItem` 补顺序保证、`ArticleCreate.status` 补取值矩阵）；目录失败态是否进产品侧口径。
- 跨侧遗留：目录锚点配对规则须用**含重复标题 / 代码块内 `#` 行 / Setext 标题**的夹具文章实测（**原型 mock 不具备这三类样本，能跳转 ≠ 已验证**）；`/toc` 对未发布文章按产品侧方案 A 规避。

## M2 前端（React 管理后台）
目录 `manage-frontend/`，Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5 + RHF7/Zod4 + Biome2.5，已开 `strict`，dev 12000。取数：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`（非 `{items,total}`）；信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；token 内存不落 localStorage；附件 `ORIGIN + /files/<key>`。CORS 方案 B（owner 暂定）：dev 走 Vite 同源代理，Cookie 分支上线前须验证。

## 通用工作铁律
- **评审 AI 只审、只写报告**：不写代码、不修 BUG、不代写回复文档。
- **不采信自陈**（含不采信评审报告本身）：结论必附实测证据，逐条独立复验。**阻碍即停**：阻断性卡点立刻报 owner，不自造 workaround（owner 书面授权的兜底除外）。
- 用户自管 git commit，AI 不自动提交。
