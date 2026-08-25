# M1 B1 鉴权批次 · 交付说明（NOTES）

> 批次：B1（鉴权 Auth）｜依赖：B0 已通过（第二轮复审批复放行）
> 代码落点：`node-backend/src/{lib,db,routes}`，测试：`node-backend/test/routes/{auth,auth-flow}.test.ts`
> 门禁证据：`tsc --noEmit` ✅ 0 / `biome check` ✅ 0 / `vitest run` ✅ 33（B1 新增 16）

## 一、端点 ↔ 契约映射（6 端点，全部闭合）

| 端点 | 契约 | 专用 401 码 | 实现位置 |
|---|---|---|---|
| `POST /auth/register` | 200 `AuthResult` / 400 `4001` / 409 `3002` | — | `auth.ts` |
| `POST /auth/login` | 200 `AuthResult` / 401 `1001`·`1005` | **1001**（密码错）/ **1005**（禁用） | `auth.ts` |
| `POST /auth/refresh` | 200 `AuthResult` / 401 `1002`·`1003`·`1004`·`1005` | 1002/1003/1004/1005 | `auth.ts`+`refresh.ts` |
| `POST /auth/logout` | 200 / 401（需登录） | — | `auth.ts`+`refresh.ts` |
| `GET /auth/me` | 200 `User` / 401 | — | `auth.ts` |
| `POST /auth/{provider}/callback` | 首波 501（内部口径 500 / `5000`） | — | `auth.ts` |

## 二、关键设计决策

### 1. 密码哈希：`bcryptjs`（成本 12）
- **选型理由**：纯 JS 实现、零原生编译依赖，契合 B0 已定的「本地 SQLite + CF D1 双端」诉求（避免 `bcrypt` 原生模块在 CF 上的构建/部署摩擦）。
- 成本因子取 12（教程项目以安全可见性优先；生产若登录频次高可调至 10–11）。常量 `BCRYPT_ROUNDS` 集中在 `lib/password.ts` 便于调参。
- `verifyPassword` 用恒定时间比较（bcrypt 内部），天然抗时序攻击。

### 2. access 无状态 JWT + refresh 有状态表（裁决 Q3 落地）
- **access**：`hono/jwt` HS256，`payload={sub,role}`，有效期 1h（`ACCESS_TTL_SEC`）。无状态，便于水平扩展。
- **refresh**：签发时生成 32 字节随机令牌，仅将 `SHA-256(token)` 存入 `refresh_tokens` 表（`token_hash`、`user_id`、`expires_at`、`revoked_at`）；明文令牌只在签发瞬间返回一次。即便库泄露也无法还原令牌。
- **旋转（强制）**：每次 `refresh` 成功即置位旧行 `revoked_at` 并签发新值（响应体 + `Set-Cookie` 同时更新）。
- **家族作废**：检测到「已作废令牌被再次使用」视为重放 → 连带 `revokeUserTokens(userId)` 作废该用户全部未过期令牌（须重新登录）。`logout` 同样作废家族，完成登出闭环。
- 表结构在 `db/schema.ts`（`refreshTokens`）+ `db/migrate.ts`（建表 + `uniq_token_hash` + `uniq_email` 索引）双源同步。

### 3. 专用 401 码严格保真（契约铁律）
- `login`/`refresh` 的 `1001/1003/1004/1005` 按契约逐支返回，**绝不统一成通用 401**。
- 关键细节：`login` 在"用户不存在"与"密码错"均返回 `1001`（不暴露账号是否存在）；`disabled` 账号返回 `1005` 而非 `403`（避免暴露账号存在性，契约明示）。
- 测试 `auth.test.ts` / `auth-flow.test.ts` 对 `1001/1003/1004/1005` 逐一断言，构成「专用码未被统一化」的机器化验收（对应批次门禁 4）。

### 4. User 脱敏序列化
- `lib/user.ts` 的 `toPublicUser` 做 snake_case→camelCase 映射，`passwordHash` 永不进入响应；`email` 仅存在时返回；`nickname` 缺省回退 `username`。
- `AuthResult` 由 `buildAuthResult` 统一构造（access 签发 + refresh 复用/签发 + 用户序列化），`refresh` 旋转时通过可选 `refreshRaw` 参数复用已签发的新令牌，避免重复签发。

### 5. Cookie 策略
- 浏览器端 `refreshToken` 经 `Set-Cookie`（HttpOnly; SameSite=None; Secure; Path=/）传递；移动端走请求体 `refreshToken`。
- `refresh` 读取优先级：Cookie 优先，缺失取请求体（契约规定）。`logout` 清除 Cookie（Max-Age=0）。
- 测试不依赖 Cookie（用 body），故 `Secure` 在测试 http 环境无影响。

### 6. 第三方登录占位（首波）
- `POST /auth/{provider}/callback` 仅用 `v.param` 校验 `provider∈{wechat,weibo,github}`，合法即抛 `5000`（内部错误口径，对应契约 501→500 修订），真实 OAuth 对接留待 M3-09 扩展点。
- 非法 provider → `4001`（Zod enum 失败）。

## 三、踩坑与经验（沉淀，供后续批次 / 相关 AI）

1. **zod-validator 0.9 + zod v4 类型退化**：`c.req.valid('json')` 推断为 `unknown`（zod v4 的 `$ZodType` 与 Hono valid 推断未打通）。解法：在 handler 内 `c.req.valid('json') as z.infer<typeof schema>` 取回精确类型——中间件已做运行时校验，安全且类型明确。已在 `auth.ts` 文件头注释说明。
2. **nullable 唯一索引语义**：`email` 在 users 表可空，但 SQLite 唯一索引允许多行 `NULL` 共存；注册 `email` 必填，故业务上等价「非空唯一」。无需在应用层额外约束，但查重用 `OR(username=?, email=?)` 覆盖两类冲突 → 统一 `3002`。
3. **测试文件 >200 行**：原 `auth.test.ts` 达 252 行，拆为 `auth.test.ts`（注册/登录）+ `auth-flow.test.ts`（刷新/me/登出/回调），各 <200，结构更清晰，也符合编码规范「单文件 ≤200 行」。
4. **`.returning().all()` 取首行需非空收窄**：drizzle 的 `.all()` 返回数组，`[0]` 为 `T | undefined`，TS 报错；用 `if (!user) throw INTERNAL` 收窄（不用具名非空断言 `!`，规避 biome `noNonNullAssertion`）。

## 四、门禁证据（自验）

| 门禁 | 结果 |
|---|---|
| `pnpm exec tsc --noEmit` | ✅ 0 error（strict + verbatimModuleSyntax + paths） |
| `pnpm exec biome check .` | ✅ Checked 34 files, No fixes applied |
| `pnpm exec vitest run` | ✅ Test Files 7 / Tests 33（auth 16 + auth-flow 8 + 原有 9） |
| 契约双门（B0 基线） | 未改动契约，无需复跑；若改结构门/语义门亦应全绿 |

## 五、后续建议

- **B2 文章批次**不依赖本批内部细节，仅需 `getActiveEnv().JWT_SECRET` 与 `users` 表；鉴权中间件 `authMiddleware` + `guard` 已就绪，文章作者提交草稿走 `guard('member', resolveOwner)` 第 4 铁律。
- **第三方登录真实实现（M3-09）**：届时在 `callback` 路由接入各 provider SDK，按 `provider+openid` 自动建号（默认 member）或登录，复用 `buildAuthResult`。
- **建议 commit 信息**：`M1 B1 鉴权端点 + 测试`（与计划交付物一致）。本批代码已落地工作区，待总把控验收通过后提交。
