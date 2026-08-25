# M1 后端 · 批次 B1：鉴权（Auth）

> 依赖 B0。本批建立"用户身份"基础，后续所有需要登录的端点都依赖这里的 JWT 与 `users` 表。

## 直接给开发 AI 的提示词（复制即可）
```
阅读 docs/prd/M1-后端实现计划.md 与 docs/prd/m1-tasks/01-auth.md，在 B0 骨架上实现鉴权批次。
实现契约 docs/api/openapi.v1.yaml 中 /api/v1/auth/* 的全部 6 个端点。
严格遵守主计划 §3.2 错误码、§3.3 鉴权模型（login/refresh 用专用 401 code；其余用通用 401）。
完成后 tsc --noEmit 绿、vitest run 绿，并逐端点核对响应与契约一致。
```

## 本批端点清单（以契约为准）
- `POST /api/v1/auth/register` → 创建 member（role 默认 member），返回 JWT
- `POST /api/v1/auth/login` → 校验密码，成功发 JWT；失败 401 `code 1001`（密码错）/ `1005`（禁用）
- `POST /api/v1/auth/refresh` → 用 refreshToken 换新 JWT；**旋转**：校验 `refresh_tokens` 表未吊销且未过期，签发新 access+refresh 并置位旧 refresh 的 `revoked_at`；失效（过期/已吊销/不存在）401 `code 1003`
- `POST /api/v1/auth/logout` → 置位当前 refresh_token 的 `revoked_at` 实现作废，返回 200 成功包络（闭环：登出即令刷新令牌失效）
- `GET  /api/v1/auth/me` → 返回当前用户（JWT 解析）
- `POST /api/v1/auth/{provider}/callback` → 第三方登录占位，**首波按契约返回 501**（路由形状保留）

## 关键行为指引
- 密码哈希：用 bcrypt 或 argon2（选型写 NOTES）。`users.passwordHash` 不对外返回。
- JWT：**access** 用无状态 JWT（payload `{ sub: userId, role }`）；**refresh 用有状态模型**——签发时写入 `refresh_tokens` 表（字段 `token_hash`、`user_id`、`expires_at`、`revoked_at` 默认 `null`），`login` 与 `refresh` 均经此表校验与旋转，`logout` 置位 `revoked_at`。这是 02 §九 P11 要求的"刷新旋转 + 登出作废"保真实现（契约保真是本项目核心卖点，故不采"无状态从简"方案）。
- **专用 401 不可动**：`login`/`refresh` 的 1001/1003/1005 是契约有意区分的鉴权错误，必须按契约返回，不得统一成通用 401。
- 注册入参 Zod 校验（用户名/邮箱/密码强度），失败 422 + 业务码。
- `role` 仅 `member` 可自注册；`editor`/`admin` 由 B5 的 admin 接口提升。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：注册成功/重复用户名冲突、登录成功/密码错(1001)/账号禁用(1005)、refresh 成功/失效(1003)、me 正确、未登录访问 me 得通用 401(1002/1004)。
3. 响应 `error.code` 与契约逐支对齐。
4. `login`/`refresh` 的专用 code 未被"统一化"破坏（grep 验收）。

## 禁止项
- 不改契约；不新增 error.code。
- 不在此批实现第三方登录真实逻辑（501 占位即可）。

## 交付物
- `src/routes/auth.ts` + 对应 schema 补充（如 refresh 存储）。
- 一个 commit：`M1 B1 鉴权端点 + 测试`。
- NOTES：哈希选型、refresh 策略、第三方登录后续方案。
