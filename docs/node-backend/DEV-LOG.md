# M1 Node 后端 · 开发思考录（DEV-LOG）

> 随手记录的架构决策、权衡、踩坑与"为什么这么写"。按批次追加，不追求成文结构。
> 目的：让"后面的我"和接手的相关 AI 能直接学到这里的判断，而不是只看最终代码。

---

## B0 · 工程基座（2026-08-25）

### 1. 信封构造器为何返回原生 `Response` 而非 `c.json()`
最初直觉是 `ok(data)` 直接 `return c.json(...)`。但这样 `response.ts` 就被 Hono 耦合，单测要起 Hono 上下文。
改成返回原生 `Response.json(...)`：`ok/paginate/created/failResponse` 都是纯函数，任意运行时（Node / CF / 测试）通用。
Hono handler 直接 `return ok(data)` 完全合法（handler 允许返回 `Response`）。**结论：lib 层零框架依赖。**

### 2. 双层错误码：HTTP 码 + 业务 code
契约要求 `code`（业务细分，如 1002/1004）+ `HttpStatus`（给网关/浏览器）。我建了一张 `HttpForCode` 映射表，
把"业务码→HTTP 状态码"集中在一处，中间件只 `throw AppError(CODE)`，HTTP 码自动查表得出。避免在每个 handler 里手写 401/403/404。
**炫技点**：`ErrCode` 用 `as const` + `as const` 推导，`ErrorMessages`/`HttpForCode` 的 key 用 `[ErrCode.XXX]` 计算属性，
一旦契约加码，漏配会立刻类型报错——把"契约一致性"前移到编译期。

### 3. 统一错误 vs 字段校验错误
- 业务异常（资源不存在、无权限…）→ `throw AppError(CODE, details?)` → 顶层 `errorHandler` 包成信封。
- 入参校验失败（4001）→ zod 校验中间件的 `onError` 直接 `return failResponse(VALIDATION, 422, { errors })`，
  `errors` 形如 `[{ field, message }]`，对齐契约 `ValidationErrorList`。
两条路径都收敛到同一个信封构造器，保证形状 100% 一致。

### 4. 鉴权守卫：第 4 铁律 ④(a) OR ④(b)
`guard(minRole, resolveOwner?)` 是核心原语：
1. 先判角色阶梯：`ROLE_RANK[user.role] >= ROLE_RANK[minRole]` → 放行（④a）。
2. 否则若传了 `resolveOwner(c)` 且资源归属 == 当前用户 → 放行（④b）。
3. 否则 2001 无权限。
**这是会员作者能提交自己草稿、editor 能改自己文章的关键**。B2/B5 直接复用，无需每端点重写。

### 5. 环境配置单例化
中间件（如 auth）需要 `JWT_SECRET`。早期想用 `c.env`（CF 有、Node 没有），会割裂。
改为 `config/env.ts` 提供 `readEnv()` + `setActiveEnv/getActiveEnv`：应用启动时装好，全局取用。
测试在 setup 里装一份 test env，干净可复用。

### 6. DB 适配层边界
本地用 better-sqlite3（Drizzle），CF 用 D1（Drizzle）。二者返回类型不同，但共享 SQLite 内核。
`getDb()` 类型锁定为本地 `BetterSQLite3Database`，CF 入口在 `createD1Db` 处做一次 `as unknown as Db` 受控转换——
只在边界出现一次，业务代码永远只认 `getDb()`。**这是"适配层"最该有的样子：脏活收敛在边界。**

### 7. 迁移不靠多语句 exec
better-sqlite3 的 `prepare` 不支持多条 SQL；`db.run(sql.raw(stmt))` 单条执行，按 `;` 拆成语句数组循环 `run`。
D1 生产迁移走 `drizzle-kit generate + migrate`（deploy 阶段），`migrate()` 仅服务本地/测试。

### 8. 测试不引 supertest
Hono 自带 `app.request(path, init)` 发真实请求并返回 `Response`，足够覆盖契约一致性。少一个依赖，快且清爽。

### 9. 选 better-sqlite3 而非 node:sqlite
Node 22 有内置 `node:sqlite`，但需 `--experimental-sqlite` 启动；`dev` 脚本带 flag 不优雅。
better-sqlite3 有预编译二进制（Apple Silicon 直接装），且与 Drizzle 文档/类型最契合。B1 起密码哈希用 `bcryptjs`（纯 JS，免编译）。

### 10. 类型纪律
- `verbatimModuleSyntax: true` → 类型导入必须 `import type`，逼出干净依赖。
- `noUncheckedIndexedAccess: true` → `ROLE_RANK[role]` 是 `number | undefined`，必须 `??`。
- 全量避免 `any`；CF 的 D1 binding 类型用 `Parameters<typeof drizzleD1>[0]` 反推，省掉 `@cloudflare/workers-types` 依赖。
