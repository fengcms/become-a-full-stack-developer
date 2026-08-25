# M1 B0 · 工程基座 · 交付与 NOTES

> 批次：B0（工程基座）｜日期：2026-08-25｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / vitest 3/3 绿 ✅ / biome 绿 ✅ / 契约一致性 ✅

---

## 一、本批交付物

`node-backend/`（代码库根，与 `docs/prd` 解耦）含：

| 模块 | 文件 | 说明 |
|---|---|---|
| 工程配置 | `package.json` / `tsconfig.json` / `biome.json` / `wrangler.toml` / `drizzle.config.ts` / `.env.example` / `vitest.config.ts` | pnpm + strict TS + biome 2.5 + 双部署 |
| 配置层 | `src/config/env.ts` | zod 解析 + `setActiveEnv/getActiveEnv` 单例 |
| 核心库 | `src/lib/{codes,http-error,response,jwt,storage}.ts` | 错误码全集 / 统一错误 / 信封 / JWT / 存储适配 |
| DB 层 | `src/db/{schema,client,migrate}.ts` | users 表 / 适配层 / 单语句建表 |
| 中间件 | `src/middleware/{error,auth,validate,cors}.ts` | 错误闸门 / 鉴权守卫 / 校验 / CORS |
| 路由与入口 | `src/routes/health.ts` / `src/app.ts` / `src/index.ts` / `src/worker.ts` | health + 装配 + Node/CF 双入口 |
| 测试 | `test/setup.ts` / `test/routes/health.test.ts` | 内存库注入 + 3 用例 |

---

## 二、依赖选型理由（请总把控复核）

1. **Hono 内置 `hono/jwt` 与 `hono/cors`**：鉴权与 CORS 直接复用，不引 `jsonwebtoken` / `@hono/cors` 独立包（`@hono/cors` 本就不独立存在，内置于 `hono/cors`）。依赖更薄。
2. **better-sqlite3 而非 node:sqlite**：Node 22 内置 `node:sqlite` 仍需 `--experimental-sqlite` 启动，破坏 `dev` 脚本优雅度；better-sqlite3 有 Apple Silicon 预编译二进制，且与 Drizzle 类型最契合。
3. **bcryptjs（纯 JS）**：避免原生编译（与 better-sqlite3 不冲突），B1 密码哈希即用，已在依赖中预置。
4. **@hono/zod-validator 0.9 的 `hook` API**：0.9 已移除旧 `onError` 选项，改为 `zValidator(target, schema, (result) => result.success ? undefined : 自定义响应)`。本批用 hook 接管错误形状，保证 4001 信封与契约一致（这是踩坑点，已记入 DEV-LOG）。
5. **biome 2.5.10 + `biome migrate`**：初始按 1.9 schema 写被 2.5 拒，已用官方 `biome migrate` 迁移：`organizeImports` 移入 `assist.actions.source.organizeImports`，忽略目录改用 `files.includes` 否定式。规则 `suspicious.noExplicitAny: error` 在 2.5 仍有效（即"禁止 any"的硬门禁）。
6. **pnpm + tsx**：`dev`/`start` 用 `tsx` 直接跑 TS，免去构建步骤；`build` 走 `tsc` 仅做类型产物。

---

## 三、关键设计（供后续批次复用，详见 `DEV-LOG.md`）

- **信封构造器返回原生 `Response`**，与 Hono 解耦，lib 层零框架依赖。
- **错误双层码**：`ErrCode`（`as const`）+ `ErrorMessages`/`HttpForCode`（计算属性键）→ 契约加 code 而漏配会在编译期报错。
- **鉴权守卫 `guard(minRole, resolveOwner?)`**：实现第 4 铁律 ④(a) 角色阶梯 **OR** ④(b) 归属者放行，是 B2/B5 会员作者自改草稿的关键原语。
- **DB 适配层边界**：`getDb()` 类型锁定本地 `BetterSQLite3Database`，CF D1 入口仅一处 `as unknown as Db` 受控转换。
- **测试用 `app.request()`**，不引 supertest。

---

## 四、运行方式

```bash
cd node-backend
pnpm install          # 装依赖（better-sqlite3 会编译原生模块）
pnpm dev              # 本地起 @hono/node-server，默认 :3000
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm format           # biome check --write
```

---

## 五、待总把控留意 / 回流项

- **无契约冲突**，本批未改动 `docs/api/openapi.v1.yaml`。
- `users` 表 `created_at`/`updated_at` 用 `integer { mode: 'timestamp_ms' }`（存毫秒整数，TS 侧为 `Date`），与 02 §二"时间字段"一致；若总把控对时间格式有专门约定，请在 B1 前告知。
- B1 将引入 `refresh_tokens` 表（裁决 Q3 有状态），并落地 `POST /auth/*` 6 个端点。
- 当前 `protected-ping` 为占位受保护路由，仅供门禁 3 验证；B1 起由真实鉴权端点替换。

> 完整编码规范见 `docs/node-backend/03-开发规范与约定.md`；架构权衡见 `docs/node-backend/DEV-LOG.md`。
