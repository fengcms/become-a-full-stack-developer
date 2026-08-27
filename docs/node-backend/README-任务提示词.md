# 任务提示词 · 给后端开发 AI：为 `node-backend/` 写一份 README.md

> 以下整段是**给 M1 Node 后端专职开发 AI 的任务指令**，你可以原样复制转发给它。它只需产出文档，不修改任何代码。

---

## 角色与任务

你是本仓库 M1 Node 后端（`node-backend/`）的专职开发 AI。现在请你为这个后端目录写一份 `node-backend/README.md`，让陌生读者能快速理解它是什么、怎么跑、当前什么状态。

**只写文档，不要改动任何代码、配置或测试。** 所有事实以仓库内已有文件为准。

## 写作前必读（事实来源，不要凭记忆）

1. `docs/node-backend/04-目标目录结构.md` —— **目录结构的唯一事实源**，分层规范以此为准。
2. `docs/node-backend/M1-后端交付文档.md` —— 技术栈、批次范围、工程纪律。
3. `node-backend/package.json` —— 真实的 scripts（dev/start/build/typecheck/lint/test/migrate/seed/backfill）。
4. `docs/api/openapi.v1.yaml` 头部 —— 当前冻结版本号（v1.11.0）。
5. `node-backend/src/` 实际目录 —— 写结构时对照 `find src -maxdepth 1 -type d` 的真实分层（routes / services / shared / types / db / middleware / config；`lib/` 已迁空，可提一句"历史 lib 已下沉至 services/shared 并清空"）。

## README 必须包含的内容

1. **一句话定位**：这是《成为全栈开发工程师》专栏 M1 的素材代码——文章系统 API 的首个实现。重申"文章是产品、代码是素材"的定位（详见仓库根 `README.md`）。
2. **技术栈表**（Markdown 表格）：
   - 运行时 Node.js ≥ 20（推荐 22）
   - Web 框架 Hono 4.x（跨 Cloudflare Workers / Node）
   - ORM Drizzle（schema 即类型）
   - 数据库 Cloudflare D1（SQLite）/ 本地 SQLite（better-sqlite3），经 `getDb()` 适配层
   - 对象存储 Cloudflare R2（主）/ 本地磁盘兜底（`STORAGE_DRIVER=r2|local`）
   - 校验 Zod（信任边界最外层）
   - 测试 vitest + Hono `app.request()`
   - 语言 TypeScript strict 全开
3. **目录结构**：用字符树画出 `src/` 分层（routes 薄路由 / services 领域服务 / shared 基础设施 / types 共享类型 / db 适配层 / middleware / config），并配一张"分层职责"小表（routes 只允许 校验→调恰好一个 service→格式化；services 含全部 DB 查询；shared 不依赖 services）。
4. **快速开始**（命令块，pnpm）：
   - 安装：`pnpm install`
   - 本地开发：`pnpm dev`（tsx watch）
   - 生产启动：`pnpm start`
   - 构建：`pnpm build`（tsc）
5. **数据库与种子**（重要，避免读者踩"无首 admin"死锁）：
   - 迁移：`pnpm migrate`
   - **建首个 admin 必须走 `pnpm seed`（`scripts/seed-users.ts`）**——严禁手写 SQL 直插库绕过。说明 seed 会创建初始管理员账号。
   - 存量文章标签回填（如需）：`pnpm backfill`
6. **质量门（每批改完必跑）**：
   - `pnpm typecheck` → tsc --noEmit 0 error
   - `pnpm lint` → biome check . 0 问题
   - `pnpm test` → vitest run，当前 **126 passed**
   - 契约双门（在仓库根目录跑）：`python docs/api/check_contract.py` → 33 OK；`openapi-spec-validator docs/api/openapi.v1.yaml` → OK
7. **API 契约说明**：所有端点对齐冻结契约 `docs/api/openapi.v1.yaml`（v1.11.0，OpenAPI 3.1）。响应统一信封 `{code,message,data,requestId,timestamp}`。角色三角 `member/editor/admin`。**契约只读**：实现缺陷回流总把控改契约，不擅自改。
8. **当前状态**：功能验收通过、结构调优完成（routes/services/shared/types 分层已落地），当前为"功能验收通过、待调优（未冻结）"。已实现 **53 路径 / 67 操作**，100% 对齐冻结契约；126 测试 + 契约双门 33 OK 全绿。第三方登录 `/auth/{provider}/callback` 第一波为 501 占位；邮箱验证/找回密码自助流程为非目标。

## 文风与纪律（与专栏一致）

- 用第一人称"我"视角叙述（如"我把 DB 访问收敛到 getDb()"），但 README 偏说明性，保持克制。
- 表格 / 字符树优先，少堆截图。
- **不注水**：只写真实存在的命令、真实的目录、真实的状态；不要写"欢迎 star"之类营销话术。
- 终篇长度以"说清楚"为度，不强行凑字数。

## 交付

- 输出文件：`node-backend/README.md`（直接写在该目录）。
- 写完后自检：里面的每一条命令都能在 `package.json` 的 scripts 中找到对应项；目录树与 `src/` 实际分层一致；状态描述与 `M1-后端交付文档.md` 一致。
- 产出后向我（统筹 AI）回报：README 路径 + 一句话小结，不需要贴全文。
