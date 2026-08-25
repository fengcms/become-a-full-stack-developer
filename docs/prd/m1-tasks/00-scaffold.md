# M1 后端 · 批次 B0：工程基座（Scaffold）

> 本批次只搭骨架，不实现业务端点（仅一个 `GET /api/v1/health` 验证装配）。后续批次在此之上长出血肉。

## 直接给开发 AI 的提示词（复制即可）
```
请阅读 docs/prd/M1-后端实现计划.md（主计划，已含技术栈/工程结构/全局约定/门禁），
并按本文件 docs/prd/m1-tasks/00-scaffold.md 落地 B0 工程基座。

任务：在仓库根 node-backend/ 下搭建 Hono + Drizzle + TypeScript(strict) 工程，
实现 §二 的目录结构、§三 的全局约定骨架（统一响应/错误码/JWT 鉴权中间件/Zod 校验），
以及 DB 适配层与存储适配层。仅实现一个 GET /api/v1/health 端点用于验证装配。
不实现任何业务端点。完成后 tsc --noEmit 绿、vitest run 绿（至少 health 测试）。
```

## 本批范围
- `GET /api/v1/health` → `{ "data": { "status": "ok" } }`
- 工程骨架（见主计划 §二 目录树），含：
  - `package.json` 脚本：`dev` / `build` / `typecheck`(tsc --noEmit) / `test`(vitest run) / `migrate`
  - `tsconfig.json`：`strict: true`，`noUncheckedIndexedAccess` 建议开
  - `src/app.ts`：Hono 实例 + 中间件装配（error → auth → validate → routes）
  - `src/db/client.ts`：`getDb()` 适配层（本地 SQLite 开发；预留 D1 binding 分支）
  - `src/db/schema.ts`：先建 `users` 表（供 B1 用），其余表后续批次增量添加
  - `src/db/migrate.ts`：本地 sqlite 建表执行器（D1 用 `drizzle-kit` 的 migrate 另行预留）
  - `src/middleware/error.ts`：捕获异常 → 统一错误包络（主计划 §3.1）
  - `src/middleware/auth.ts`：解析 JWT → `c.set('user', {id, role})`；无效/缺失按通用 401
  - `src/middleware/validate.ts`：Zod 校验辅助（包一层 `@hono/zod-validator`）
  - `src/lib/response.ts`：`ok(data)` / `paginate(data, pagination)` / `fail(code, message)` 构造器
  - `src/lib/jwt.ts`：签发/校验（payload `{ sub: userId, role }`）
  - `src/lib/storage.ts`：`StorageProvider` 接口 + `local` 实现（`STORAGE_DRIVER` 读环境变量）
  - `src/lib/codes.ts`：契约错误码常量
  - `src/middleware/cors.ts`：`@hono/cors` 装配（dev：`origin: '*'` + `credentials: true`；prod：从环境变量读白名单来源）；供 M2/M3/M7 跨域调用
  - `test/setup.ts`：测试前初始化内存/临时 SQLite + 注入 app

## 关键行为指引
- DB 适配层：`getDb()` 返回 Drizzle 实例；开发/测试用 `better-sqlite3` 或 `node:sqlite`，**不依赖云账号**。
- `users` 表字段对齐 02 §二（id 自增、username、passwordHash、role 默认 'member'、email、displayName、createdAt 等）。**注意**：底层实体名为 `User`，契约路径 `GET /members/{id}` 仅是公开资料视图别名（路由层映射到 users 表并脱敏），**不要建 `members` 表**。
- JWT 密钥从环境变量读（如 `JWT_SECRET`），提供 `.env.example`。
- 统一响应构造器是后续所有批次的基础，务必稳定（信封以契约为准，见主计划 §3.1）。
- **限流 429**：契约标注"网关层施加"。Node 应用**不实现真实限流**，仅需保证错误包络结构正确（触发时返回 429 + `code 5001`）；真实限流由网关/CF 做。
- **双部署入口（Q5 裁决）**：除适配层外，额外提供 `wrangler.toml` + `src/worker.ts`（`export default { fetch }` 入口，复用 `app.fetch`），使代码真正可部署 Cloudflare Workers。日常 dev/test 仍在 Node；**CF 实机部署测试为 best-effort（无云账号时跳过，无需阻塞）**。

## 验收门禁
1. `npm run typecheck` 绿。
2. `npm test` 绿：`health` 返回 200 + 正确包络。
3. 中间件装配正确：未带 token 访问一个受保护占位路由（可临时挂一个测试路由）应得通用 401 包络。
4. CORS 中间件装配：带 `Origin` 的预检 `OPTIONS` 请求应得 `Access-Control-Allow-*` 头（dev 放开凭证）。
5. 目录结构与主计划 §二 一致；`wrangler.toml` + `src/worker.ts` 存在（CF 实机测试可后置）。

## 禁止项
- 不实现业务端点（文章/分类等留待后续批次）。
- 不改契约文件。
- 不引入主计划技术栈之外的重依赖（如换框架、加 GraphQL）。

## 交付物
- `node-backend/` 完整骨架 + `package.json` + 配置。
- 一个 commit：`M1 B0 工程基座`。
- 简短 NOTES：依赖选型理由（如 bcrypt 还是 argon2、sqlite 驱动选择）。
