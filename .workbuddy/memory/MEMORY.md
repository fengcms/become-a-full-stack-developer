# 项目长期记忆 ·《成为一个全栈开发工程师》

## 项目性质
用真实多端文章系统作素材载体写全栈技术专栏。核心定位：**文章是产品，代码是素材**；文章优先，每切片成文即停，不追求生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）。
用户 FungLeo，CSDN 前端专家。文风以项目章程第九节为准（克制结构化），动笔前仍读全局脱敏规则。

## 关键决策（不可随意变更）
- 技术栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（须写适配层）。
- 角色三角 `member/editor/admin`：注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管全站内容不管用户/角色/站点配置。
- 文章三态 `draft/pending/published`（会员投稿默认 pending）；评论三态 `approved/rejected/reviewing`。
- 分类无限级树（`GET /categories/tree`）；阅读量防刷（去重+24h 冷却+计数写分离）；附件 R2 主/本地兜底（`STORAGE_DRIVER`）。
- **公开可见性铁律**：公开 `GET /articles` 只返 published；未发布详情/评论对匿名 404；后台筛选走 `GET /admin/articles`。
- 领域模型+API 契约是七端共同地基，实现不得偏离；变更先改 OpenAPI 再改实现。

## 契约基线（v1.14 / openapi 1.11.0，已冻结）
- 经「内容审阅→四轮架构评审（R1–R11 / N1–N6 / N7–N9 / N10+N9-2）→终评结案」六轮，**2026-08-11 评审终结、契约冻结**，无第五轮。
- 双门全绿：结构门 OK；语义门 `check_contract.py` **33 OK**（53 路径 / 67 操作 / 45 schema / 46 x-authz）。
- 机器化约束：`x-authz`（minRole+ownerOverride）自包含；`Article.status.x-allowed-transitions` 状态转移矩阵；错误码数字分段（1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务，5001=限流）。
- 改契约后必复跑双门（venv `/Users/fungleo/.workbuddy/binaries/python/envs/default`）。
- 非阻塞 TODO：§2.2 树环检测 / §3.3 阅读去重 / Comment 状态机未机器化（刻意留 PRD 层）；F2 应急集 33/35 计数复核；OAuth redirect 白名单（M3-09）；`GET /me/likes` 契约内部矛盾（裸数组 vs page/pageSize）待整改。

## 文章编号体系
M0 开篇 / M1 Node / M2 React / M3 Next / M4 Flutter / M5 Taro / M6 Go / M7 Vue3 / M8 收官 / B 支线。主线 115 + 支线 15 = 130 篇（最小可交付 41 篇），周更 2 篇。
**git tag 里程碑式**：契约/各端冻结时打 `contract-v1.11.0`、`node-backend-v1.0` 等；M0 产品侧不打 tag；废止 per-article tag。根 `ARTICLES.md` 做「标题 ↔ 代码里程碑 ↔ URL」对照。

## 协作约定
- **blog AI 链接/发布**：blog AI 工作目录 `/Users/fungleo/Documents/Blogs`，`csdn_backup.py` 公开抓取，`links` 命令生成 `materials/csdn-已发布链接.md`（单一真相源）；统筹 AI 只读消费并镜像进根 `ARTICLES.md`。内链占位 `{{LINK:Mx-yy}}`，某里程碑全发完后一次性注入。详见 `docs/链接与发布协作约定.md`。
- **写作分工（A 计划）**：文章写作归统筹 AI（M0 已写、M1~M8 续写）；发布维护 M0 由统筹 AI 顺手做，M1 起委派独立「发布维护 Agent」（`docs/发布维护-agent-岗位说明书.md`）。

## 文档位置
- 00-项目章程（v1.14）/ 02-领域模型与API契约（v1.14）/ 01-内容路线图（v1.15）
- 契约 `docs/api/openapi.v1.yaml`（1.11.0）；语义自查 `docs/api/check_contract.py`
- M1 计划 `docs/prd/M1-后端实现计划.md` + 批次任务包 `docs/prd/m1-tasks/00~07`；`docs/prd/README.md` 索引

## 当前进度
- **M0 产品篇：8 篇全量收官**（2026-08-29，全发 CSDN + 内链穿插 + `ARTICLES.md` 回填 URL）。
- **M1 Node 后端：已冻结**（tag `node-backend-v1.0`，2026-08-27）。冻结证据：tsc 0 / biome 0 / vitest 133 passed / 契约双门 33 OK / yaml 字节未改。交付 `docs/node-backend/M1-后端交付文档.md`。后续 BUG 走增量维护（fix→门禁复绿→commit→必要时 bump patch tag），不热改主干。
  - **已部署 Cloudflare 全链路 GREEN**（2026-08-29）：Worker 启动 / D1 查询 / CORS / admin 登录（bcryptjs rounds=12 同源）/ R2 读写全部线上实测通过；自定义域名 `api-befull.kao9.com`。部署指南 `docs/node-backend/部署到Cloudflare指南.md`，验收报告 `docs/node-backend/M1-后端部署到Cloudflare-验收报告.md`。
  - 部署 FAQ 四坑：① R2 binding 名须对齐 `env.ts` 的 `R2_BUCKET`；② D1 改密码须 bcryptjs(12) 同源且含 `$` 用 heredoc；③ curl `-F file=@` 的 `~` 不展开；④ **`GET /files/<key>` 挂在根路径不带 `/api/v1`**（策略 A 中转）。
- **下一步**：M1 冻结后写「M1 后端文章」（M1-01~M1-31，31 篇）；M2 前端按「契约→主计划→批次任务包」推进。

## M2 前端（React 管理后台）
- 目录 `manage-frontend/`（已建）。栈：Vite8 + React19 + TS6 + Tailwind4 + shadcn/ui + TanStack Query5 + Zustand5（仅鉴权）+ RHF7+Zod4 + Biome2.5；已开 `strict`。dev 端口 12000。
- 文档：`docs/manage-frontend/开发规范.md`（箭头函数/文件头 TSDoc/单文件≤200 行；豁免 `components/ui/*`、`api.gen.ts`）+ `M2-开发计划.md` + `review/` 审阅报告与回复。
- **契约差异（请求层已适配）**：信封 `{code,message,data,requestId,timestamp}`，`code:0` 成功；base `/api/v1`；错误码数字分段；accessToken 内存不落 localStorage；登录取 `data.accessToken`。
- **取数铁律**：分页一律 `data.list` + `data.pagination.{page,pageSize,total,totalPages}`（**不是**参考项目的 `{items,total}`，YAML 里的 `items` 是 OpenAPI 数组元素保留字）。已由 `src/api/articles.test.ts` 反向断言守卫。
- **附件 URL**：`ORIGIN + /files/<key>`，**不带 `/api/v1`**（否则 404），由 `fileUrl()` 处理。
- **CORS 方案 B（owner 暂定决策）**：dev 走 Vite 同源代理绕开 CORS，代价是 `core.ts`「空体→HttpOnly Cookie」分支 dev 无实测，上线前须明确验证方式。
- **构建**：`vite.config.ts` 用 `manualChunks` 把编辑器生态独立成 chunk；并 alias `refractor/all` → `build/refractor-languages.ts`（41 种语言，替换默认 297 种全量）。注意官方 common 集**无 jsx/tsx**，需补。
- **第一轮审阅已收口**（2026-08-29，综合 83/100）：A-P2-2 开 strict（0 错）、P3-1 移除死依赖、P3-2 chunk -47%、P3-3 状态色语义令牌、P3-4 清 `_tmp_*`、P3-5 补 28 测试 + CI。回复 `docs/manage-frontend/review/M2-第一轮审阅回复.md`。
- **owner 已裁决三项（无阻塞）**：① md-editor 563 kB 超 500 kB 告警线**接受不改**（文章系统须含优质编辑器，属主动取舍；懒加载仅编辑页一次）；② 高亮语言集 297→41 目视通过；③ Cookie 刷新分支验证延至上线前。可选未做：调 `chunkSizeWarningLimit` 至 700 消除告警噪音（须附注释说明，等 owner 点头）。
- 下一步：Phase 2 评论审核。

## 通用工作铁律
- **评审角色铁律（2026-08-26）**：BackendArchitect 只审查、给结论、写审阅报告与复审批复；**不写代码、不修 BUG、不代写回复文档**（那是开发 AI 的活）。收到越界指令先判断是否误发。
- **阻碍即停铁律（2026-08-27）**：遇阻断性卡点必须立刻停下报 owner，不得自行绕过或自造 workaround 后继续。
- **不采信自陈**：所有结论附实测证据（门禁输出、grep 取证、哨兵验证）；改配置后验证是否真生效，而非只看"没报错"。
- 用户自管 git commit，AI 不自动提交。门禁：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`。
