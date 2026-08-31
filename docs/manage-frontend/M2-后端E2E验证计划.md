# M2 管理后台 · 后端接口 E2E 验证计划（契约符合性 + 真实数据）

> 触发：后台创建文章 BUG（summary/coverImage/slug null 校验）已修复发布，需回归 + 全量接口体检。
> 真相源：冻结契约 `docs/api/openapi.v1.yaml` v1.11.0（53 路径 / 67 操作）。
> 目标后端：已部署并修复的 `https://api-befull.kao9.com`。
> 日期：2026-08-31。

---

## 0. 可行性结论：可以执行

依据（四条，均可验证）：

1. **契约已冻结且为唯一真相源** —— `openapi.v1.yaml` v1.11.0 字段级定义完整（含 `nullable`、`x-allowed-transitions`、错误码数字分段），可直接做断言，不靠猜。
2. **后端已部署可直达** —— 2026-08-29 已验收 `api-befull.kao9.com` 全链路 GREEN；本次 BUG 修复已发布，可直接打真实后端。
3. **有 admin 凭证** —— 你提供 admin 账号密码，可经 `POST /auth/login` 取 Bearer token，跑全部受保护 / 管理端点。
4. **有"期望请求/响应"参照** —— 前端 `src/api/*` + `src/types/api.gen.ts`（openapi-typescript 生成）即合法 fixture 模板，能构造贴合契约的请求体，减少 4xx 误报。

约束（必须遵守，防线上污染）：脚本只建带 `[E2E]` 前缀的测试数据、用例结束即清理、凭证走 env 不落库、破坏性操作仅作用于自建数据。

---

## 1. 目标

- 以契约为真相源，**逐个**跑管理后台接口，断言：信封结构 / 错误码语义 / 分页结构 / 关键字段类型 / 权限边界 / 状态机。
- **必须带真实数据（非空列表）**，覆盖 CRUD 全链路，暴露空列表测不出的问题：
  - 本次 BUG 类：`nullable` 字段偏差（Zod `optional` ≠ OpenAPI `nullable`）。
  - 分页 `total` / `totalPages` 计算错误。
  - 外键约束（分类/标签删除被引用时是否按契约返回错误码）。
  - 文章状态机 `draft→pending→published` 转移是否严格按 `x-allowed-transitions`。
  - 公开 `GET /site/settings`（R4 历史 5000 风险）是否已修复。
- 输出可读报告 + 问题清单，作为后端回归依据与门禁补充。

---

## 2. 测试目标与环境

| 项 | 值 |
|---|---|
| 目标后端（默认） | `https://api-befull.kao9.com` |
| 备选（走 dev 代理） | `API_BASE=http://localhost:12000`（同源代理绕 CORS） |
| 凭证 | admin（你提供），经 `POST /auth/login` 取 `accessToken`；**从 env 注入，不落仓库、报告脱敏** |
| 工具 | Node 原生 `fetch` + 轻量断言；单一脚本 `manage-frontend/scripts/e2e-contract-check.mjs` |
| 执行方式 | 顺序执行，逐用例打印 `PASS/FAIL` + 实际响应摘要；失败不中断（收集后统一报告） |
| 契约读取 | 脚本启动时解析 `openapi.v1.yaml` 路径清单，确保不漏端点 |

---

## 3. 校验维度（断言规则）

- **A 信封**：成功 `{code:0, message, data, requestId, timestamp}`；失败 `code` 为 `1xxx`(认证)/`2xxx`(授权)/`3xxx`(资源)/`4xxx`(参数)/`5xxx`(服务) 数字段，含 `message` 与 `requestId`。
- **B 分页**：列表端点 `data.list` 为数组 + `data.pagination.{page,pageSize,total,totalPages}`；`total ≥ 已建测试数据量`（非空证明）。
- **C 字段类型**：抽样契约 schema 关键字段；`nullable:true` 字段允许 `null`；枚举字段值属契约枚举集。
- **D 权限边界**：admin token 跑 `/admin/*` 成功；可选 member token 断言 `401/403`（第二轮，需另注册普通用户）。
- **E 错误码语义**：用非法输入触发 `4xxx`，断言返回契约约定错误码（如 4001 参数校验、4009 资源冲突）。
- **F 状态机**：文章 `draft→pending→published` 转移符合 `Article.status.x-allowed-transitions`；非法转移应被拒。

---

## 4. 接口覆盖清单（来自契约，按域分组）

按"管理后台相关"筛选，以下为契约真实路径（脚本将逐条执行）：

**认证与身份**
- `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`
- `GET /me/profile`、`PATCH /me/profile`、`POST /me/change-password`

**文章（内容核心，含本次 BUG 回归）**
- `POST /articles`（发 `summary/coverImage/slug:null` 必须 200 —— BUG 回归）
- `GET /articles`（列表筛选）、`GET /articles/{idOrSlug}`（详情）、`PATCH /articles/{id}`、`DELETE /articles/{id}`
- `POST /articles/{id}/submit`、`GET /articles/{id}/view`（阅读量+1）
- `GET /admin/articles`（后台全状态筛选）、`POST /admin/articles/{id}/approve`、`POST /admin/articles/{id}/status`（状态机）
- `POST /articles/{id}/like`、`GET /articles/{id}/like/status`（点赞幂等）

**分类 / 标签**
- `POST /categories`、`GET /categories`、`GET /categories/tree`（无限级）、`PATCH /categories/{id}`、`DELETE /categories/{id}`
- `POST /tags`、`GET /tags`、`PATCH /tags/{id}`、`DELETE /tags/{id}`

**评论审核**
- `POST /articles/{idOrSlug}/comments`（建评论）、`GET /comments/{id}`、`POST /comments/{id}/status`
- `GET /admin/comments`（后台审核列表）、`PATCH /admin/comments/{id}`（approve/reject）、`DELETE /comments/{id}`

**用户与角色三角**
- `GET /users`、`GET /users/{id}`、`PATCH /users/{id}`（admin 升 editor）
- `POST /admin/users/{id}/reset-password`

**站点设置（R4 回归）**
- `GET /site/settings`（公开，**R4 历史 5000 须已修复**）
- `GET /admin/site/settings`、`PATCH /admin/site/settings`

**资产 / 文件**
- `POST /upload`（附件上传）、`GET /attachments/{id}`、`PATCH /attachments/{id}`、`DELETE /attachments/{id}`
- `GET /me/attachments`

**私域（通知/收藏/历史）**
- `GET /me/notifications`、`GET /me/notifications/unread-count`、`POST /me/notifications/read-all`、`PATCH /me/notifications/{id}`
- `GET /me/likes`（**裸数组 `ArticleSummary[]`，R5 钉死**）、`GET /me/favorites`、`POST /me/favorites/{articleId}`、`DELETE /me/favorites/{articleId}`
- `GET /me/history`、`DELETE /me/history/{articleId}`

**统计 / 搜索**
- `GET /stats`、`GET /categories/stats`、`GET /search`

> 说明：以上为管理后台实际触达的全部端点；纯前台只读（如 `related`/`adjacent`/`toc`/`breadcrumb`）也纳入但只做只读断言，不建数据。

---

## 5. 测试数据策略（防污染）

- 每条用例自建 fixture，`title`/`slug`/`name` 带前缀 `[E2E-<域>-<ts>]`，便于检索与批量清理。
- **依赖顺序**：建父（分类 → 标签）→ 建文章（引用父 + 测试 null 可选字段回归 BUG）→ 评论（引用文章）→ 用户/站点/文件/通知 → 读列表断言非空 → 改 → 删。
- **清理**：每域 `finally` 删除本域自建数据；提供 `cleanup` 模式按 `[E2E]` 前缀批量删残留（防中断遗留）。
- **不碰非测试数据**：`DELETE` 仅作用于前缀标记记录；`PATCH /users/{id}` 升角色只对自己的测试账号。
- **点赞/收藏幂等**：建→断言存在→删→断言消失，闭环验证。

---

## 6. 执行阶段

- **Phase A 探针**：登录取 token；跑 1 个只读列表确认后端在线且修复生效；**BUG 回归**：`POST /articles` 发 `summary/coverImage/slug:null` 期望 200（对比修复前 4001）。探针失败即停（阻碍即停铁律）。
- **Phase B 内容域**：分类树 / 标签 / 文章 CRUD + 发布状态机 + 后台筛选 + 阅读量 + 点赞幂等。
- **Phase C 治理域**：评论审核流 / 用户角色提升(editor) / 站点设置(admin + 公开 R4 回归)。
- **Phase D 资产与私域**：文件上传 / 通知 / 收藏 / 历史 / 统计 / 搜索。
- **Phase E 清理 + 报告**：删残留 → 生成可读报告 + JSON。

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 线上数据污染 | `[E2E]` 前缀 + 自动清理 + `cleanup` 兜底 |
| 限流 5001 | 顺序执行、用例间小节流、可重试失败用例 |
| 凭证泄露 | env 注入、报告脱敏、仓库不提交密码 |
| 破坏性误删 | 仅删自建 `[E2E]` 数据 |
| 后端状态不确定 | Phase A 探针先确认，失败即停 |
| 跨端所有权 | 发现问题只出报告 + BUG 文档，不擅改冻结后端 |

---

## 8. 交付物

- `manage-frontend/scripts/e2e-contract-check.mjs`（验证脚本，可重复跑）
- `docs/manage-frontend/M2-后端E2E验证-运行报告-<date>.md`（执行后产出：每用例 PASS/FAIL、实际响应摘要、问题清单）
- 发现的契约偏差 → 回填 `docs/bugs/BUG-*.md`（同本次 null 校验格式）

---

## 9. 后续

- 发现新偏差：写 BUG 报告转后端 owner（增量维护流程）。
- 可选：把"前端空值发 null""`/me/likes` 裸数组"等反向断言补进 `vitest`，固化为前端门禁防回归。

---

## 10. 需你确认的点（开工前）

1. 目标后端用 **线上 `api-befull.kao9.com`**（默认）还是 **本地 dev 代理 `http://localhost:12000`**？
2. 是否同意在线上后端创建带 `[E2E]` 前缀的测试数据并自动清理？
3. 是否要 **member 权限反向用例**（需另注册一个普通用户，验证 `401/403`）？还是本轮只跑 admin 视角？

确认后我即按 Phase A→E 执行并产出运行报告。
