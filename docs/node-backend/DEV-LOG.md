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

---

## B0 审阅修复（2026-08-25 晚）

> 背景：审阅专员出具 `review/B0-后端代码审阅报告.md`，指出 1×P0 + 5×P1 + 5×P2。本批次清零全部 P0/P1，并借机把"契约一致性"落成可回归测试。

### R1. "门禁全绿" 不等于 "正确"
自陈的 tsc/biome/vitest 只验"能编译 / 能跑 / 格式对"，验不了"逻辑/契约对不对"。本次 4001 被写成 422、ACCOUNT_DISABLED 被写成 403，三道门禁全过却都与契约相悖。
**教训**：涉及契约的项目，必须有一道"脚本化比对契约"的门禁（见 R3），人工审阅也会漏（本次审阅同样漏了 1005）。

### R2. `@/` 路径别名在 TypeScript 7 的坑
`baseUrl` 在 TS 7 被彻底移除，配 `paths` 会直接报错 `TS5102`。
**正确做法**：删掉 `baseUrl`，仅留 `paths: { "@/*": ["./src/*"] }`（paths 相对 tsconfig 解析）。vitest 侧用 `resolve.alias['@']` 指向 `./src` 对齐。
**价值**：全仓零 `../` 引用，重构/移动文件不再牵一发动全身；IDE 跳转稳定。约束：相对引用只允许 `./` 同目录，跨目录一律 `@/`。

### R3. 契约一致性测试是 B0 最值钱的新增
`test/contract/error-codes.test.ts` 用 `yaml` 解析 `openapi.v1.yaml`，抽取每个响应的 `example.code` 与 HTTP 状态，断言与 `HttpForCode` 完全一致。
它**一次性揪出 2 个此前所有关卡都漏掉的缺陷**：
1. **契约自身缺陷**：`POST /auth/{provider}/callback` 的 `501` 占位响应 `example.code` 误写 `5000`（应为 500），契约内自相矛盾且无 501 码。修正契约 `501 → 500`。
2. **本方代码缺陷**：`ACCOUNT_DISABLED`(1005) 误映射 `403`，但契约明文"禁用账号登录/刷新返回 401/1005（故意不用 403 以免暴露账号存在性）"。修正 `codes.ts` 1005→401。
**方向判断**：缺陷 1 改契约、缺陷 2 改代码——恰好说明"以契约为准"要在契约*自洽*前提下才有意义；契约若自相矛盾，先让契约自洽再谈代码对齐。

### R4. 双部署断裂的根因（B02）
`app.ts` 顶层 `export const app = createApp(readEnv(process.env))` 会在模块求值即读 `process.env`。Cloudflare Workers 不保证 `process.env`（需 `nodejs_compat`），导入 `app.ts` 即崩。
**修法**：`app.ts` 只导出工厂 `createApp`；默认实例下沉到 `index.ts`（Node）与 `worker.ts`（CF）各自构造。模块顶层零副作用，双部署才稳。

### R5. 路径遍历防御（B04）
`LocalStorage.get/delete(key)` 若 `key` 直接 `join(root, key)`，攻击者可传 `../../etc/passwd`。`put` 生成的 `key=randomUUID()` 天然安全，但**读/删入参必须校验**。
**修法**：`resolveKey` 仅放行 `^[A-Za-z0-9._-]+$`，非法即抛错。即便将来 `key` 来自请求参数也安全。

### R6. CORS 的规范红线（B05）
规范禁止 `Access-Control-Allow-Origin: *` 与 `Access-Control-Allow-Credentials: true` 同时出现，否则浏览器拦截凭据请求。
**修法**：dev → `*` + 无凭据；非 dev → 白名单 + 凭据；**留空/`*` 视为未配置，不返回任何 CORS 头（拒绝跨域）**。凭据请求的安全姿态是"明确白名单"，不是"放开 `*`"。

### R7. 角色类型收紧（B11）
`jwt.ts` 原 `role: string` 宽松，存在 role 注入隐患。`AccessToken.role` / `AuthUser.role` 收敛为 `Role` 字面量联合，签发时即断言 `ROLES.includes(role)`。
`ROLE_RANK` 内部 0-based（member=0/editor=1/admin=2），对应契约文档的 1/2/3，注释标明以免接手 AI 混淆。

### R8. 文件组织约定（重申）
- 每个文件头有说明块；每个函数 TSDoc；单文件 ≤200 行（最长 91 行）。
- pnpm + 箭头函数，零 `function` 声明。
- biome 全开含 `noExplicitAny`；`verbatimModuleSyntax` 强制类型导入 `import type`。

