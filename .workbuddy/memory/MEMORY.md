# 项目长期记忆 ·《成为一个全栈开发工程师》

## 项目性质
用真实多端文章系统作素材载体，写全栈技术专栏。核心定位：文章是产品，代码是素材。文章优先，每切片成文即停，不追求生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）；Next.js 站仅演示，不做商业化。

## 关键决策（不可随意变更）
- 技术栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（须写适配层，高价值题材 M0-03/M1-24）。
- 角色三角：member/editor/admin。注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管全站内容不管用户/角色/站点配置；`level` 仅展示。
- 文章三态 draft/pending/published；会员投稿默认 pending。评论三态 approved/rejected/reviewing（reviewing 为管理员兜底态）。
- slug 可选（id 为主）；分类无限级树（`GET /categories/tree`）；阅读量防刷（去重+24h 冷却+计数写分离）；评论敏感词过滤；附件 R2 主/本地兜底（`STORAGE_DRIVER` 驱动）。
- 阅读历史唯写路径 `POST /me/history`（upsert）；`view` 只增计数。第三方登录预留 `POST /auth/{provider}/callback`（首波 501）。
- `SiteSetting` 字段：siteName/siteTitle/siteDescription/siteKeywords/logoUrl/copyright/updatedAt；端点 `GET /site/settings`（公开）+ `GET/PATCH /admin/site/settings`（admin）。
- 辅助接口（v1.10）：adjacent/related/toc/breadcrumb/categories-stats/stats/search + like(`Like`)/notifications(`Notification`)；标签云计数已由 `GET /tags` 的 `Tag.articleCount` 覆盖；RSS/sitemap/robots 不进 JSON 契约。
- 公开可见性铁律：公开 `GET /articles` 忽略 status 只返 published；未发布详情/评论对匿名 404；后台筛选走 `GET /admin/articles`。

## 文章编号体系
M0 开篇/M1 Node/M2 React/M3 Next(含会员中心)/M4 Flutter/M5 Taro/M6 Go/M7 Vue3/M8 收官/B 支线。每篇对应 git tag `article/M1-15`。仓库根 `ARTICLES.md` 做对照。

## 协作约定（统筹 AI ↔ blog AI · 链接/发布）
- **模式**：消费 blog AI 索引 + 自服务兜底（2026-08-27 确认）。
- blog AI 工作目录 `/Users/fungleo/Documents/Blogs`，`csdn_backup.py` 公开抓取无需登录；`links` 命令生成 `materials/csdn-已发布链接.md`（全站标题→URL 索引，单一真相源）。
- 统筹 AI 只读消费该索引，把本系列 URL 镜像进根 `ARTICLES.md` 的「CSDN 链接」列；索引过期时可自跑同款脚本兜底刷新（owner 已授权）。
- 内链占位 `{{LINK:Mx-yy}}` + 发布后一次性注入真实 URL。详细见 `docs/链接与发布协作约定.md`。

## 规模
主线 115 + 支线 15 = 130 篇（最小可交付 41 篇）；周更 2 篇，全量约 15 个月。

## 文档位置（00/02 为 v1.14；01 内容路线图 v1.15）
- 00-项目章程（v1.14）/ 02-领域模型与API契约（v1.14）/ 01-内容路线图（**v1.15**，2026-08-12 成长弧打磨）
- 契约 `docs/api/openapi.v1.yaml`（**1.11.0**，OpenAPI 3.1）
- 语义自查 `docs/api/check_contract.py`（双门之一）
- **M1 后端实现计划** `docs/prd/M1-后端实现计划.md`（v1.0，2026-08-25）+ 8 个自包含批次任务包 `docs/prd/m1-tasks/00~07`（含复制即用提示词）。开发 AI 据此施工，总把控验门禁证据，不读每一行代码。
- `docs/prd/README.md` 索引

## 当前进度里程碑（2026-08-26）
- **M0 八篇产品侧文章已全部成文**（暂存 `articles/` 草稿，`ARTICLES.md` 已建对照骨架，待发 CSDN 后回填链接+打 tag）。
- **M1 Node 后端：开发完成 + 总把控独立复验通过 + 门禁全绿，但冻结暂缓**（代码库 `node-backend/`，根目录；文档在 `docs/node-backend/`）。
  - 复验证据：tsc 0 error / biome 96 文件 0 问题 / vitest **126 passed** / 契约双门 33 OK / 契约字节级未改。
  - 穿透确认零假修复：`refresh_tokens` 有状态表真存在（落实 Q3-A）、扁平信封真执行（落实 Q1）。
  - 交付文档 `docs/node-backend/M1-后端交付文档.md`；复审批复 `docs/node-backend/03-统筹AI复审批复.md`（**已统一为「功能验收通过、冻结暂缓、待调优（未冻结）」口径**）。
  - 用户经独立架构师 AI 讨论产出 `docs/node-backend/04-目标目录结构.md`（**采用水平分层：routes/services/shared/types，零行为变更重构规范**）；统筹据此起草 `docs/node-backend/05-结构调优任务包.md` 交开发 AI 执行。
  - 两处非阻塞遗留待统筹跟进：① `GET /me/likes` 契约内部矛盾（裸数组 vs page/pageSize）→ 排「契约维护批次」整改，与 F2 计数复核并轨；② nullable 唯一索引「假唯一」→ 记入 Go/Python 跨端协调清单。
  - **结构调优执行完成 + 后端架构师独立复审通过（5 项 P3 非阻塞）**：分层重构 `04-目标目录结构.md`（routes/services/shared/types 水平分层）已落地，五门门禁全绿（tsc0/biome0/vitest126/契约双门33 OK），routes 21 文件均≤200、`categories/comments` 分拆已合并回单文件。P3 文档修订已落实（services 例外注释补 3 处、NOTES §四真实行数、`types` 措辞精确化）。审阅报告：`docs/node-backend/review/B-结构调优-后端代码审阅报告.md`。
  - **当前状态：待调优（未冻结）**——用户(owner)裁决「功能完备≠可冻结」，目录结构与组织风格需先经 owner 视觉确认符合预期再冻结。
- **下一步**：先完成 M1 结构调优（用户预期对齐 → 重构 → 门禁复绿 → 用户确认 → 再冻结）；冻结后再进入「写 M1 后端文章」（M1-01~M1-30）。M2/M3/M4/M6/M7 五端复用「契约→主计划→批次任务包」工作流。

## 契约演进与评审时间线（截止 2026-08-11）
| 轮 | 契约 | 范围 | 语义门 |
|---|---|---|---|
| v1.7 冻结 | 1.4.0 | F1–F4 错误码机器化 | 13 OK |
| v1.8 | 1.5.0 | editor 角色 + 站点配置 + Sort 带符号 | 全绿 |
| v1.10 | 1.7.0 | 辅助接口 + like/notification | 全绿 |
| 一审（后端架构师） | — | R1–R11（RBAC/幂等/字段/限流） | 不可冻结 |
| v1.11 | 1.8.0 | R1–R11 整改 | 22 OK |
| 二审 | — | N1–N6（授权求值/字段/限流） | 不可冻结 |
| v1.12 | 1.9.0 | N1–N6 整改（x-authz 自包含） | 28 OK |
| 三审 | — | N7/N8/N9（401 完整性/ownerOverride 一致/02 措辞） | 不可冻结 |
| **v1.13** | **1.10.0** | **N7/N8/N9 整改 + 语义门硬化** | **31 OK** |
| 四审（后端架构师） | 1.10.0 | N7/N8/N9 复验 + 盲区穿透 | **可冻结（N10 + N9 尾非阻塞）** |
| **v1.14** | **1.11.0** | **N10 清零 + N9-2 状态转移机器化 + 语义门硬化** | **33 OK** |

## 当前基线（v1.14 / 契约 1.11.0）
- **双门全绿**：结构门 `openapi-spec-validator` → OK；语义门 `check_contract.py` → **33 OK**（53 路径 / 67 操作 / 45 schema / 46 x-authz / 21 公开 429 / 13 值错误码）。
- **机器化约束**：`x-authz`（minRole+ownerOverride）授权求值自包含（第 4 铁律，02 反向引用闭环）；`Unauthorized`(401)+`RateLimited`(429) 共享组件；`x-idempotent`/`x-cascade`/`x-max-depth`/上传约束/限流粒度均机器字段；N2 URL/展示字段约束；N7 401/403 完整性；N8 ownerOverride 一致性；N9-2 `Article.status.x-allowed-transitions` 状态转移矩阵；N10 401 code 集合一致性。语义门已覆盖 N7a/N7b/N8/N10/N9-2 与 `$ref` 响应错误码解析。
- **N1–N10 全部清零，契约可冻结作为 M1 基线**：四审独立复验确认 N1–N9 真清零；v1.14 进一步清零 N10（7 内联 401 → `$ref Unauthorized`，code 含 1002/1004）并机器化 N9-2（Article.status.x-allowed-transitions 覆盖 §2.3 六条转移）。§2.2 树环检测 / §3.3 阅读去重两处实现细节刻意留契约外（登记为 TODO，由对应后端篇目 PRD 层落地）。

## 非阻塞 TODO（N10/N9-2 已于 v1.14 清零）
1. **§2.2 树环检测 / §3.3 阅读去重**：两处行为约束（分类环检测、阅读量去重算法）刻意留契约外，由其对应后端篇目 PRD 层落地（避免过度下沉算法实现，契合"文章是产品、代码是素材"铁律）。
2. F2：应急集 33/35 计数复核（三处引用对齐）。
3. M1 动手前由非作者跑穿透式独立终审（呼应 N6 方法学，双门已硬但人工终审补漏）。
4. OAuth redirect 白名单 M3-09 显式声明。
5. M6-09 一致性校验增补「授权行为」断言。
6. **（可选一致性观察，非缺陷）Comment 状态机未机器化**：`Comment.status`（approved/rejected/reviewing）未配 `x-allowed-transitions`，N9-2 范围本就限定 Article §2.3；评论状态机与 §2.2/§3.3 同源，可一并归入 TODO 1 的 PRD 层处理，不构成权威模糊。

> **【评审终结裁定 · 2026-08-11 晚】** 历经「内容审阅→后端架构师一审(R1–R11)→二审(N1–N6)→三审(N7–N9)→四审(N10/N9-2)→终评结案」六轮，F1 一脉（错误码→授权求值→线协议→状态机）五层约束已全部机器化且经双门（33 OK）硬校验。第四轮回复经独立穿透脚本复验**属实、无假修复、未引入新高危缺陷**，**评审正式终结，契约冻结为 M1 动手前基线（v1.11.0 / 文档 v1.14）**，无需第五轮评审。

## 注意事项
- 用户 FungLeo，CSDN 前端专家。文风以本项目章程第九节为准（克制结构化，区别于全局 BLOG_STYLE_GUIDE），动笔前仍读全局脱敏规则。
- 领域模型+API 契约是七端共同地基，实现不得偏离；变更先改 OpenAPI 再改实现。
- 双门校验为唯一硬地基，任何契约改动后须复跑（venv：`/Users/fungleo/.workbuddy/binaries/python/envs/default` 含 pyyaml + openapi-spec-validator）。
- **评审角色铁律（2026-08-26 用户明确）**：后端架构师专家（BackendArchitect）**只做审查、给结论、写审阅报告与复审批复**；**不编写代码、不修复 BUG、不代写开发 AI 的回复文档**——这些全是开发 AI 的活。若收到「去把报告里的问题修了 + 写回复文档」类指令，须**先判断是不是用户发错了**（正确流向：报告交回开发 AI 整改 → 开发 AI 给回复文档 → 我复批）。用户已确认上一条「解决报告问题并写回复文档」属误发，越界未执行任何代码改动。
- **阻碍即停铁律（2026-08-27 用户明确）**：遇到**阻碍性质的问题**（阻断性卡点，如「无首 admin」这类死锁），**必须立即停下与 owner 交流，不得自行绕过或自造 workaround 后继续**。本次曾未请示就造 `bootstrap-admin.mjs` 直插库绕过死锁，被指正后删除、改为走开发 AI 的正式 `seed-users.ts`。正确流向：发现阻塞 → 立刻报告 owner → 等裁决再动。
