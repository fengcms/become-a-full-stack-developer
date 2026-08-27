# node-backend

## 一句话定位

这是《成为全栈开发工程师》专栏 **M1（Node 后端）** 的素材代码——「多端文章系统」API 的**首个后端实现**（Hono + Drizzle + SQLite）。

本仓库的定位是「**文章是产品、代码是素材**」：代码服务于专栏讲解，首要目标是「可读、可讲、不炫技」，不追求生产级完备。完整的专栏定位见仓库根 `README.md`。

## 技术栈

| 维度 | 选型 |
|---|---|
| 运行时 | Node.js ≥ 20（推荐 22） |
| Web 框架 | Hono 4.x（跨 Cloudflare Workers / Node 同一份代码） |
| ORM | Drizzle（schema 即类型） |
| 数据库 | Cloudflare D1（SQLite）/ 本地 SQLite（better-sqlite3），经 `getDb()` 适配层 |
| 对象存储 | Cloudflare R2（主）/ 本地磁盘兜底（`STORAGE_DRIVER=r2\|local`） |
| 校验 | Zod（信任边界最外层） |
| 测试 | vitest + Hono `app.request()`（不引 supertest） |
| 语言 | TypeScript strict 全开（`noUncheckedIndexedAccess` / `verbatimModuleSyntax` / 零 `any`） |

**适配层（双部署基石）**：DB 访问收敛到 `getDb()`，文件存储收敛到 `StorageProvider`。业务代码不直接 `new D1Database()` 或硬编码 bucket；模块顶层零副作用（`app.ts` 仅导出工厂 `createApp`，实例在 `index.ts`/`worker.ts` 构造），因此同一份代码能在 Node 与 Cloudflare Workers 间切换。

## 目录结构

```
node-backend/
├── src/
│   ├── app.ts              # Hono 装配（仅导出 createApp 工厂）
│   ├── index.ts            # Node 入口
│   ├── worker.ts           # Cloudflare Workers 入口
│   ├── config/
│   │   └── env.ts          # readEnv()：环境变量收口（DB_FILE / JWT_SECRET / STORAGE_DRIVER …）
│   ├── db/
│   │   ├── client.ts       # getDb()/setDb()/createLocalDb()/createD1Db() —— DB 适配层（不动）
│   │   ├── schema.ts       # Drizzle schema（表名 snake_case = 契约 JSON）
│   │   └── migrate.ts      # 迁移执行（pnpm migrate）
│   ├── middleware/
│   │   ├── auth.ts         # guard 工厂（minRole + ownerOverride）
│   │   ├── cors.ts
│   │   ├── error.ts        # 统一错误 → 信封
│   │   └── validate.ts     # Zod 信任边界校验
│   ├── routes/             # 薄路由（21 文件，按资源分）
│   │   ├── articles-read.ts / articles-write.ts / articles-admin.ts / articles-me.ts
│   │   ├── comments.ts      # 评论 read+write 合并单文件
│   │   ├── categories.ts    # 分类 read+write 合并单文件
│   │   ├── users.ts / users-admin.ts / me.ts / members.ts / auth.ts
│   │   ├── tags.ts / site.ts / upload.ts / files.ts / aux.ts / health.ts
│   │   └── favorites.ts / history.ts / likes.ts / notifications.ts
│   ├── services/           # 领域服务（19 文件）：业务规则 + 全部 DB 查询
│   │   ├── article.ts / article-mutation.ts / article-tags.ts / article-backfill.ts
│   │   ├── attachment.ts / category.ts / comment.ts / comment-query.ts
│   │   ├── refresh.ts / related.ts / search.ts / stats.ts / tag.ts / user.ts
│   │   └── favorites.ts / history.ts / likes.ts / notification.ts / site.ts
│   ├── shared/             # 基础设施/纯工具（10 文件，不依赖 services）
│   │   ├── codes.ts / errors.ts / db-error.ts / auth.ts（JWT+Role）
│   │   └── pagination.ts / password.ts / response.ts / slug.ts / storage.ts / toc.ts
│   ├── types/              # 仅跨模块共享类型
│   │   ├── auth.ts         # Role / AccessToken / AuthVars
│   │   └── common.ts       # ErrorCode / BizErrorCode / Pagination / 信封类型
│   └── lib/                # 历史 lib，已下沉至 services/shared 并清空（保留空目录）
├── test/                   # setup.ts · routes/* · services/* · middleware/* · lib/* · contract/*
├── scripts/
│   ├── seed-users.ts       # 种子用户（建首个 admin，pnpm seed）
│   ├── backfill-article-tags.ts  # 存量文章标签回填（pnpm backfill）
│   └── smoke-test.sh / _smoke_json.mjs  # 冒烟测试脚手架（仅测试用）
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

### 分层职责

| 层 | 允许 | 禁止 |
|----|------|------|
| **routes/** | 输入校验（委托 `middleware/validate` + Zod）；调用**恰好一个** service；用 `shared/response` 格式化返回 | 出现 `.select/.insert/.update/.delete`、`getDb()`、业务规则、手工序列化 |
| **services/** | 领域逻辑 + 所有 DB 查询；调用 `getDb()`、`shared/*`、其它 service、`types/*` | 直接拼 HTTP 响应（返回领域对象交给 routes 格式化） |
| **shared/** | 跨领域基础设施/纯工具；可被任意层引用 | 引入领域概念、依赖 `services/*`、直接查库 |
| **types/** | 仅放被 ≥2 方引用的共享类型 | 放领域专属类型（如 `ArticleStatus` 留在 `services/article.ts`） |
| **db/ middleware/ config/** | 不变 | —— |

`routes` 严守单文件 ≤ 200 行（超则拆 read/write 或下沉 service）；`services` 仅在确属领域聚合处放宽并注释。

## 快速开始

```bash
pnpm install        # 安装依赖

pnpm dev            # 本地开发（tsx watch，热重载）
pnpm start          # 生产启动（tsx 运行 index.ts）
pnpm build          # 构建（tsc 产出 dist/）
```

环境变量经 `src/config/env.ts` 收口，示例见 `.env.example`（含 `DB_FILE` / `JWT_SECRET` / `STORAGE_DRIVER` / `CORS_ORIGINS` 等）。

## 数据库与种子

> ⚠️ **避免「无首 admin」死锁**：系统没有任何内置管理员，启动后**必须先用 `pnpm seed` 建出第一个 admin**，否则后台不可登录。严禁手写 SQL 直插库绕过。

```bash
pnpm migrate        # 执行 Drizzle 迁移，建表（D1 / 本地 SQLite 通用）

pnpm seed           # 创建初始管理员账号（scripts/seed-users.ts）
# 可选环境变量（缺省见 .env.example）：
#   SEED_ADMIN_USERNAME=admin
#   SEED_ADMIN_EMAIL=admin@example.com
#   SEED_ADMIN_PASSWORD=admin123456      # 生产务必改为强口令
#   SEED_ADMIN_NICKNAME=管理员
# 幂等：已存在 admin 则跳过；被降级残留则提升回 admin；加 --reset 可强制改密
```

种子脚本复用应用层 `hashPassword`（`@/shared/password`，bcrypt 12 轮），与登录 `verifyPassword` 100% 同源，落库 `role=admin`、`status=active`。Cloudflare D1 部署侧需把本地预生成的 bcrypt 哈希经 `wrangler d1 execute` 写入（等价 SQL 见 `scripts/seed-users.ts` 底部注释）。

```bash
pnpm backfill       # 存量文章标签回填（如需，scripts/backfill-article-tags.ts）
```

## 质量门（每批改完必跑）

```bash
pnpm typecheck      # tsc --noEmit → 0 error
pnpm lint           # biome check . → 0 问题
pnpm test           # vitest run → 当前 133 passed（18 文件）
```

契约双门（在**仓库根目录**跑，venv 含 `openapi-spec-validator`）：

```bash
VENV=/Users/fungleo/.workbuddy/binaries/python/envs/default/bin
$VENV/openapi-spec-validator docs/api/openapi.v1.yaml   # → OK
$VENV/python docs/api/check_contract.py                 # → 33 OK
```

> 注：`scripts/` 与 `test/` 不进 `tsconfig` 的 `include`，脚本类一律走 `tsx` 运行时校验（与 `backfill`/`seed` 同例）；门禁覆盖以 `src/` + `test/` 为准。

## API 契约说明

所有端点对齐**冻结契约** `docs/api/openapi.v1.yaml`（**v1.11.0**，OpenAPI 3.1），当前实现 **53 路径 / 67 操作**，100% 对齐。

- **统一信封**：成功 `{code:0, message, data, requestId, timestamp}`；错误同信封、明细放 `data`。
- **角色三角**：`member` / `editor` / `admin`；令牌角色是登录快照（提权须先改库再签发）。端点门槛以契约 `x-authz`（minRole + ownerOverride）为准。
- **契约只读**：实现缺陷回流总把控改契约，**绝不擅自改契约**；任何契约改动后须复跑上述双门（33 OK）。

## 当前状态

- **功能验收通过、结构调优完成**（routes / services / shared / types 水平分层已落地，`lib/` 已下沉清空）。
- 已实现 **53 路径 / 67 操作**，100% 对齐冻结契约；**133 测试 + 契约双门 33 OK** 全绿。
- 当前为「**功能验收通过、待调优（未冻结）**」：待 owner 视觉确认目录风格后冻结，再进入「写 M1 后端文章」（M1-01 ~ M1-30）。
- 第三方登录 `POST /auth/{provider}/callback` 第一波为 **501 占位**；邮箱验证 / 找回密码自助流程为**非目标**。

---

更多「为什么这么写」的决策与踩坑记录在 `docs/node-backend/DEV-LOG.md`，逐批交付证据见 `docs/node-backend/B0-NOTES.md` ~ `B7-NOTES.md` 与 `docs/node-backend/M1-后端交付文档.md`。
