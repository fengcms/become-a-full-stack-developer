# 项目长期记忆 ·《成为一个全栈开发工程师》

## 项目性质

用一个真实的多端文章系统作为素材载体，撰写全栈技术专栏系列。
**核心定位：文章是产品，代码是素材。** 不是"做完系统顺便写文章"。

## 已确认的关键决策

1. **主次关系**：文章优先。每完成一个功能切片立刻成文，功能做到"够讲清楚"就停，不追求生产级完备。
2. **目标读者**：双轨。主线面向有基础的前端（1~5 年，会 React/Vue，缺后端），支线（B 系列）补零基础知识。**主线不为照顾支线降速。**
3. **发布阵地**：**主阵地是 CSDN 博客**（`blog.csdn.net/fungleo`）；Next.js 自建站仅作成果演示品，不做付费/商业化。
4. **单篇形态**：**约 2500 中文字（±300）**，每篇只讲一个聚焦技术点，对应一个 git tag。
5. **文风约定（v1.1 新增，章程第九节）**：比过往博客（`SiXiDianGong` 的 BLOG_STYLE_GUIDE 轻松口语风）**更克制、更结构化**，但保留个人习惯——第一人称"我"、鲜明判断、中文代码注释、表格/ASCII 图、通用化脱敏；**收掉**"各位看官"口头禅、儿化音俗语、自黑卖惨、求赞营销腔。动笔写正式文章前仍须读全局 BLOG_STYLE_GUIDE 的脱敏规则。
6. **推进节奏（v1.1 重构为八段式）**：波次**串行**，不并行。**一个 M 系列只讲一件实现（一个独立代码库/端）。**
   - M0 开篇规划（地基） / M1 Node 后端 / M2 React 管理后台 / M3 Next.js 网站前台（含会员中心）
   - M4 Flutter / M5 Taro / M6 Go 后端重写 / M7 Vue3 后台重写 / M8 收官
   - **会员中心归入 M3**（同属一个 Next.js 应用），不单独占 M。
   - M3 结束即为完整交付点；M4–M7（含 Go/Vue 同契约重写）是可延后加分项，其中 M6/M7 为差异化王牌。
7. **唯一硬地基**：领域模型 + API 契约。已定稿为 `docs/prd/02-领域模型与API契约.md` 与 `docs/api/openapi.v1.yaml`（**契约版本 1.9.0**，OpenAPI 3.1；文档 00/01/02/README 统一 **v1.12**）。**双门校验均已独立复验 PASS（第十二轮 v1.12 整改后复跑确认）**：结构门 `openapi-spec-validator` → OK；语义门 `python docs/api/check_contract.py` → 53 路径 / 67 操作 / **45 schema** 全绿（28 条 OK 断言：无孤儿 schema、状态机闭环、operationId 唯一、Sort 带符号枚举化、可选鉴权标准写法、**错误码机器强制校验**、**授权求值机器化 R1/N1**、**限流声明 R5/N5**、**扩展约束 G**、**字段约束 N2**）。**错误码已机器化**：`ErrorCode` 枚举（13 值：0 + 12 错误码，v1.11 新增 5001）+ 每个 4xx/5xx 响应钉死 `code` 示例，语义门 F 段强制校验（枚举码须在结构化 `example`/`examples` 落地、禁未定义码，已去 `description` 兜底）。**授权求值 RBAC 已机器化（v1.12 清零二次评审 N1–N6）**：46 需登录端点全部声明结构化 `x-authz:{minRole, ownerOverride?:{param,ownerField}}`；minRole 单字段（member/editor/admin，无列表歧义，顺带解决 N3），6 个归属端点带 `ownerOverride`（param 为真实 path 参数 `id`，ownerField 用真实字段：article→authorId、comment&attachment→userId、notification→userId——并为 Notification 补 `userId` 字段，顺带解决 N4）；第 4 铁律改写为**自包含求值规则**（admin 始终放行；min-role **或** ownerOverride 归属，删除"详见 02"，仅凭 OpenAPI 即可确定性推出授权结果）；`x-idempotent`/`x-cascade`(none/children/soft-hide)/`x-max-depth:4`/上传 `x-max-size-bytes`+`x-accepted-mime-types`/`ErrorCode 5001` + `RateLimited` 组件 + `info.x-rate-limit`（scope:per-endpoint,key:client，21 公开端点挂 429）均下沉为机器字段；语义门 R1 段升级校验 ownerOverride.param 真实 path 参数 + ownerField 真实归属字段，并新增 N2 URL/展示字段约束、N5 限流粒度断言（22→28 条 OK）；02 文档自身角色矛盾（端点目录误标 categories/tags/评论审核/approve"仅 admin"）已统一为 `editor/admin`（以角色定义段为权威）。Go 后端实现完全一致的接口，Vue3 后台对接完全一致的接口。契约变更必须先改 OpenAPI 再改实现。**`SiteSetting` 站点配置字段（v1.9 扩展后）：siteName / siteTitle / siteDescription / siteKeywords / logoUrl / copyright / updatedAt**，端点 `GET /site/settings`（公开）+ `GET/PATCH /admin/site/settings`（admin）。**v1.10 新增辅助接口**：纯计算/聚合类 `adjacent`/`related`/`toc`/`categories/{id}/breadcrumb`/`categories/stats`/`stats`/`search`；互动类 `like`（`Like` 实体）+ `notifications`（`Notification` 实体），`Article`/`ArticleSummary` 加 `likeCount`。标签云计数已由 `GET /tags` 的 `Tag.articleCount` 覆盖不重复造；RSS/sitemap/robots 列为 M3 实现笔记不进 JSON 契约。
   - ~~⚠️ 版本号错位（已修）~~：00/01/02/README 已统一为 **v1.12**，契约 1.9.0，三文档与契约版本完全对齐。
   - **公开内容可见性铁律（N2，安全硬约束）**：公开列表（`GET /articles`）忽略 `status`、只返 `published`；未发布详情/评论对匿名返回 404；后台管理筛选走鉴权端点 `GET /admin/articles`。照契约实现不会泄露草稿/待审。
8. **后端技术栈（M1，已定）**：Hono + Drizzle ORM + Cloudflare D1（数据库）+ Cloudflare R2（对象存储），**同时兼容部署在普通 Linux 服务器**。由此必须写"适配层"让同一份业务逻辑在边缘（CF）与自管 Linux 上都能跑——这是高价值内容题材（M0-03、M1-24）。
9. **文章状态机（极简三态）**：`draft / pending / published`。会员投稿默认 `pending`（待审核）；管理员发布直接 `published`（已审核）。详见 02 文档 §2.3。去掉了 `archived`。
10. **会员等级**：User 增加 `level` 字段（int 默认 1），仅展示用、无业务功能，在会员公开主页呈现。
11. **会员公开主页**：公开端点 `GET /api/v1/members/:id`，聚合会员资料与其 `published` 文章（M3-15 对接）。
12. **slug 策略（已定）**：id 为主、slug 可选。前台默认 `/articles/{id}`；slug 仅管理员手动填且需唯一。不做标题自动转写（拼音/翻译依赖 + 冲突处理不划算，CSDN 是主阵地）。
13. **分类无限级树形结构（已定）**：Category 自关联 `parent_id` 表达任意层级；提供 `GET /api/v1/categories/tree` 整树返回；后台用平铺列表 + 客户端 `reduce` 构树。详见 02 文档 §2.2。
14. **阅读量防刷（已定，做）**：`POST /api/v1/articles/:id/view` 带去重（登录按 `user_id`、匿名按 `ip+ua` 哈希）+ 冷却窗口（默认 24h）+ 计数写分离（不锁主表）。详见 02 文档 §2.4。
15. **评论内容安全（已定）**：提交即跑敏感词过滤，命中转等长 `*`；违规比率 > 阈值（默认 10%，可配）→ `rejected`，否则 → `approved`（转义后展示）；`reviewing` 为管理员人工兜底态（**评论 reviewing 与文章 pending 同名异义，已在全文档统一为 reviewing**，N9 修 R18 漂移）。不做语义级审核。详见 02 文档 §2.5。
16. **附件双存储（已定）**：上传走适配层，R2 为主、本地磁盘兜底，由 `STORAGE_DRIVER` 配置驱动；Attachment 增加 `storage` 字段记录实际后端。详见 02 文档 §2.6。
17. **阅读历史写入路径（N4）**：`ReadingLog` 唯一写入端点为 `POST /me/history`（鉴权，upsert）；`POST /articles/{id}/view` 只增 `view_count`、不写历史。两职责分离。
18. **第三方登录扩展点（N5）**：契约预留 `POST /auth/{provider}/callback`（wechat/weibo/github），第一波可返回 501 占位，M3-09 讲设计模式。保证前后端不漂移。
19. **会员中心改密码（N17）**：`POST /me/change-password` 端点已补，个人设置功能在契约上完整。
20. **角色边界（N13/N14/N20）**：注册默认 `member`；`admin` 经 `PATCH /users/{id}` 晋升为 `editor`（内容编辑，管全站文章/评论/分类/标签，但不涉用户/角色/站点配置）；三角色 `member` / `editor` / `admin`。`editor` 调用户管理端点吃 403，可演示 RBAC；`level` 仅展示（默认 1，不自动变化）。
21. **删除语义**：分类删除须无子节点且无文章引用（否则 409，N8）；标签删除须无文章引用（否则 409）；评论删除级联删子回复（N16）。

## 文章编号体系（已固化，不可变更）

- `M0` 开篇 / `M1` Node 后端 / `M2` React 后台 / `M3` Next.js 前台 / `M4` Flutter / `M5` Taro / `M6` Go 后端 / `M7` Vue3 后台 / `M8` 收官 / `B` 支线
- 每篇对应 git tag：`article/M1-15`
- 仓库根维护 `ARTICLES.md` 做「标题 ↔ 链接 ↔ tag」对照

## 规模

主线 112 篇 + 支线 14 篇 = 126 篇（v1.3 调整新增 M1-25~27；v1.8 新增 M2-16/M3-16 站点配置；v1.10 新增辅助接口 M1-28/29/30、M2-17、M3-17/18/19）。**最小可交付集：41 篇（01 §13 代码块 41 条唯一项：M0×5/M1×21/M2×8/M3×8/M8×1，已与正文统一，见第十轮 v1.10）。**
发布频率：**周更 2 篇**。按每周 2 篇计：全量约 14 个月（59 周），最小集约 4.5 个月。

## 文档位置

- `docs/prd/00-项目章程.md` — 定位、非目标、风险、文风约定、技术方向与产品决策（**v1.12**）
- `docs/prd/01-内容路线图.md` — 八段式完整大纲（北极星文档，**v1.12**）
- `docs/prd/02-领域模型与API契约.md` — 实体/关系/端点/错误码（**v1.12**，与 00/01 同轮）
- `docs/api/openapi.v1.yaml` — 机器可读 API 契约（**契约版本 1.9.0**，双门校验 PASS）
- `docs/prd/README.md` — 文档索引与进度

## 审阅发现（持续更新 · 截止 2026-08-11）

**历史审阅（内容视角，已清零）**：v1.7 冻结时清零 F1–F4——错误码机器化（定义 `ErrorCode` 12 值枚举 + 每错误响应钉 `code` 示例 + 语义门 F 段强制校验）、应急集 33→35、§三 ?status 矛盾修正、三文档版本对齐 v1.7；v1.8 加 editor 角色 + 站点配置 + Sort 带符号，应急集 35→37。F5–F7 为可选散文优化，冻结不阻塞。

**一审复审（后端架构师视角 · 2026-08-11 上午 · 独立跑双门 + 脚本深剖）**：结论 **不可冻结**。结构/错误码已扎实，但暴露比 F1 更隐蔽的系统性缺陷——**授权（RBAC）完全未机器化**，且文档 §3.2 自身铁律（约束须下沉、不许只写散文）在"角色"上被违反；另有多处 doc/contract 漂移。完整报告：`docs/review/API契约专项审阅-后端架构师视角.md`。R1–R11 明细见该报告。

**产品 AI 回复（2026-08-11）**：`docs/review/API契约专项审阅-回复报告.md` 声称 R1–R11 全清零、契约 1.8.0、双门 22 断言全绿、可冻结；四文档升 v1.11、F4 顺带清零。

**二次评审（Backend Architect · 2026-08-11 晚 · 独立复验回复 + 穿透脚本核验）**：结论 **仍不可冻结**。回复"字段已声明"层面基本属实（R1 角色覆盖 46 端点、R2 幂等示例、R3 主体、R4/R5、R6–R11、F4 均脚本核验真实落地），但 R1 只修了一半、R3 有遗漏。完整报告：`docs/review/API契约专项审阅-二次评审.md`。
- **🔴 N1（原 R1 残留·高）授权"求值"未机器化 + 硬规则外置**：`x-required-roles` 只编码"最小角色"，完整判定（min-role OR owner-override）只活在 info.description 散文，且末尾"详见 02 文档角色边界段"把规则指向另一文档 → OpenAPI 不自包含，七端授权行为仍会漂移；与 F1 同一缺陷家族（约束在散文）。修复：内联 `x-authz:{minRole, ownerOverride:{param, ownerField}}` 或把求值规则完整写进契约、去掉"详见 02"。
- **🟠 N2（原 R3 残留·中）URL 类字段约束不一致**：`logoUrl` 有 `maxLength:512`，但 `coverImage`(Article/ArticleSummary/ArticleCreate×3) 与 `OAuthCallbackRequest.redirectUri` 仅 `type:string,nullable` 零约束；`authorName/categoryName/userName` 等反范式展示字段亦无限长。同是 URL 待遇分裂；redirectUri 无 `format:uri` 且开放重定向白名单未在契约声明。
- **🟡 N3（低）`x-required-roles` 用列表编码最小角色语义模糊** → 建议改 `x-min-role` 单字段（与 N4 合并）。
- **🟡 N4（中低）`x-owner-resource` 只标参数名未标归属字段**：如 `articleId` 未说 Article 归属字段是 `authorId`；实现端须猜/翻 02。建议 `{param, ownerField}`。
- **🟡 N5（低）限流粒度未声明**：`info.x-rate-limit` "所有公开端点 60/1m" 未说 per-endpoint 还是 per-client-global，两种实现行为差异大。
- **🟡 N6（方法学·中）双门"全绿"是作者自证非独立验证**：`check_contract.py` 为验自身修复而写，只验字段存在/语法合法，验不了取值正确/逻辑完整；N1/N2/N4 均落其盲区。冻结前应由非作者跑穿透核验或把 N1 求值、N2 字段约束纳入语义门断言。
- **冻结建议**：N1 是动摇"七端一致"承诺的硬伤，须清零；N2 建议同期清零；N3/N4/N5 设计增强可一并处理；N6 不改文档、改写验证方式。
- **二审已排除的误报/不成立疑点**：① `POST /admin/articles/{id}/status`(admin) 与 `.../approve`(editor/admin) 非矛盾，是权限分层；② "鉴权端点不设限流"仅豁免已登录的 logout/auth-me，爆破高危的 login/register/refresh/callback 均已挂 429，爆破担忧不成立。
- **🟠 F2 应急集计数不一致**：01 §13 文字「以下 33 篇」，代码块实列 35 条唯一项（脚本核验）。README、00 亦引用 33。需统一为 33 或 35，并复核三处引用。
- **🟠 F3 §三 与 N2 矛盾**：§三「过滤 | 列表支持 ?category=、?tag=、?status=、?keyword=」把 `?status=` 列为公开列表通用过滤器；但 N2 + §五 + 契约均表明公开 `GET /articles` 忽略 status（契约该端点无 status 参数，参数仅 page/pageSize/sort/category/tag/keyword）。§三 需改为「?status= 仅用于鉴权后台列表 GET /admin/articles」。
- **🟠 F4 三份核心文档版本号错位**：00/01=v1.6，02=v1.5，但 02 的 v1.5 内容正对应 00/01 的 v1.6 轮次（见上「版本号错位」）。建议冻结前统一。
- **🟡 F5 散文细节**：§3.3 笔误 `POST /articles/{id}/view}`（多余 `}`）；§2.2 User.email「用于注册与找回」但「找回」是 Non-goal(P10)，应改述；§3 命名边界举例 `Article / Member / Comment` 中 Member 非 schema（实体是 User，公开投影为 MemberProfile）；00 §十二 变更记录顺序乱（v1.4 排在 v1.6 之后）。
- **🟡 F6 语义门覆盖盲区（元发现）**：`check_contract.py` 的 D 项「死胡同状态」是子串启发式而非真可达性分析；且整脚本**完全不检查错误码**——而错误码恰是仍「只活在散文里」的约束，也是新不一致滋生处。建议加一项：扫描所有 4xx/5xx 响应，断言其 description/示例含落在「已定义错误码集合」内的 code，且 §六 表里的码在 yaml 至少出现一次。
- **🟡 F7（可选）**：49 端点已覆盖，但少数（admin reset-password、OAuth callback→M3-09、reading-history-delete→M3-10、attachment-delete→M1-18/M2-10）建议在路线图显式标注对应篇目。基本 OK，仅供参考。
- **产品 AI 二次回复（2026-08-11 晚）**：`docs/review/API契约专项审阅-二次评审-回复报告.md` 声称 N1–N6 全清零、契约 1.9.0、双门 28 断言全绿、可冻结；四文档升 v1.12。N1 通过 `x-authz` 结构化 + 第 4 铁律自包含解决（授权求值不再外置 02）；N2 URL/展示字段统一约束；N3/N4/N5 一并处理；N6 方法论盲区已通过升级语义门收窄，并登记 M1 前独立终审。修正了二审 N4 的两处误判（Attachment 归属字段实为 `userId` 非 `uploaderId`；Notification 原无归属字段，已补 `userId`）；顺带收紧 `submitArticle` 越权隐患（原 [member] 会让任意 member 凭角色提交他人草稿，现 minRole:admin + ownerOverride）。

## 待办（按顺序）

1. ✅ 规划阶段已定稿（第七轮 v1.7 冻结；第八轮 v1.8 用户复审追加 editor 角色重构 + 站点配置 + Sort 带符号，契约 1.5.0，双门校验全绿）。
2. M0-03 技术选型结论需定稿，会反向影响 M1 篇目细节
3. 支线 B 系列发布节奏（交叉发布 or 前置一批）
4. 规划冻结后，启动 M1 PRD 与 Node 后端实现（用户明确暂不启动后端实践，先打磨规划）

## 注意事项

- 用户是 FungLeo，CSDN 前端领域专家。本项目文风已在本项目章程第九节单独约定（区别于全局 BLOG_STYLE_GUIDE）。
- 文章只讲通用技术命题，不涉及具体业务内容（沿用全局脱敏规则）。
- 领域模型与 API 契约已在动工前定稿，是七端共同地基，后续实现不得偏离。
