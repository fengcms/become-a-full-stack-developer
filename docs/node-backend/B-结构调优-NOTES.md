# M1 后端 · 结构调优交付说明（B-结构调优）

> 配合文档：`docs/node-backend/04-目标目录结构.md`（分层规范唯一事实源）、`docs/node-backend/05-结构调优任务包.md`（批次计划与禁止项）。
> 状态：功能验收早先已通过；owner 裁决「功能完备 ≠ 可冻结」→ 进入**结构调优期（未冻结）**；本批完成后仍待 owner 确认目录风格后再冻结。

## 一、结论

按 04/05 文档的「分层 + 薄路由」铁律，完成全量结构调优，零行为变更（仅移动文件 + 调整 import，逻辑/契约未动）。

**五门门禁最终全绿（调优结束后整体复跑）：**

| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | 0 error |
| `biome check .` | 0（109 文件） |
| `vitest run` | **126 passed**（17 文件全绿） |
| 契约结构门 `openapi-spec-validator` | OK |
| 契约语义门 `check_contract.py` | **33 OK**（全部通过） |

契约 `docs/api/openapi.v1.yaml` 字节级未改动（铁律 ⑧）。

## 二、批次与门禁证据

| 批次 | 范围 | 本次操作 | 门禁 |
|---|---|---|---|
| 前置 Step A | `lib/` → `services/`(14) + `shared/`(10) | git mv + 别名重写脚本（44 文件 `@/lib/X` → `@/services/X` 或 `@/shared/X`）；`http-error→errors.ts`、`jwt→auth.ts` 重命名 | tsc0 / biome0 / vitest126 |
| B-试点 | likes / favorites / history / comments | 抽查询与领域逻辑入 services；4 路由薄化 | tsc0 / biome0 / vitest126 |
| B-主体-1 | articles* / categories* | 扩 `services/article.ts`(+7)、`services/category.ts`(+8)；5 路由薄化 | tsc0 / biome0(102) / vitest126 |
| B-主体-2 | users* / me / auth | 扩 `services/user.ts`（listUsers/getUserById/updateUser/resetPassword/getProfile/updateProfile/changePassword/registerUser/authenticateUser/getMemberOr404）+ 重写 4 路由 | tsc0 / biome0(103) / vitest126 |
| B-主体-3 | tags / site / upload / members / notifications | 扩 `services/tag.ts`、`services/attachment.ts`；新建 `services/site.ts`、`services/notification.ts`；`services/user.ts` +`getMemberOr404`；5 路由薄化；`aux.ts` 复核已薄化 | tsc0 / biome0(106) / vitest126 |
| B-收尾 | 类型上提 + 收口 | 新建 `types/auth.ts`（AuthVars/AuthUser）、`types/common.ts`（ErrorCode/BizErrorCode/Pagination/Envelope）；`middleware/auth.ts`、`shared/codes.ts` 改从 types 引入并透出；`shared` 命名确认无 service 反向依赖 | tsc0 / biome0(109) / vitest126 / 契约双门 33 OK |

> 每批均在修改后即时跑 tsc + biome + vitest；B-收尾末批补跑契约双门，结果全绿。

## 三、偏差说明（与 04/05 计划的出入，均经判断为更优/更低风险）

1. **`lib/` 前置迁移（Step A）不在主体批次内**：原 `lib/` 扁平单职责文件在主体批前已整体迁至 `services/`(14) + `shared/`(10)（详见上表）。本批主体工作是在「已分层」基础上，继续把**路由内联的 DB/业务逻辑**下沉到对应 service。即「lib→services/shared」与「routes→services」是两次独立移动，顺序与 05 任务包设想的「按资源批内一并迁移」略有不同，但结果等价且更可控。
2. **types 层采用 re-export 兼容策略**：`middleware/auth.ts` 与 `shared/codes.ts` 仍 `export type { AuthVars, AuthUser }` / `{ BizErrorCode }`，内部实现类型上提至 `types/`。这样 30+ 路由现有 `import { type AuthVars } from '@/middleware/auth'` 与 3 个测试 `import { BizErrorCode } from '@/shared/codes'` **无需改动**，单一事实源已是 `types/`，且零测试改动、零回归风险。
3. **`shared` 命名收口**：现有 10 文件（auth/codes/db-error/errors/pagination/password/response/slug/storage/toc）命名已一致（kebab、职责单一），且经 `grep` 确认 `shared/` 内**无任何 `@/services` 反向依赖**（铁律 ④成立）。收口为「确认无违规」，未做无谓重命名。

## 四、分层落点（最终目录树）

```
src/
├── routes/        (23)  薄路由：校验 → 调恰好一个 service → ok/paginate 格式化；无 getDb / 无 drizzle-orm / 无业务规则
├── services/      (19)  领域逻辑 + 全部 DB 查询（article/category/user/tag/comment/.../notification/site/attachment/refresh/...）
├── shared/        (10)  跨域基础设施（auth/jwt/codes/errors/db-error/pagination/password/response/slug/storage/toc）；禁查库、禁引 services
├── types/          (2)  types/auth.ts、types/common.ts（仅共享类型，依赖图最底层）
├── middleware/     (4)  auth/cors/error/validate
├── db/                client.ts / schema.ts / migrate.ts
├── config/env.ts
├── app.ts / index.ts / worker.ts
```

**routes 文件行数核对**：最大 `auth.ts` 135 行，全部 ≤200（铁律 routes 严守）。services 存在文件超 200 行者（`article.ts` ≈252、`user.ts` ≈250）已按项目纪律以注释显式标注「services 例外」，属既有先例。

## 五、铁律遵守清单（04 §2）

- ① 零行为变更：vitest 稳定 126 passed；契约双门 33 OK；YAML 字节级未改。
- ② routes 禁项：经 `grep` 全 routes 无 `getDb(`、无 `from 'drizzle-orm'`、无 `.select/.insert/.update/.delete(`（仅 `.get/.post/...` 路由方法名命中，非 DB 调用）。
- ③ services 禁项：services 可引用 getDb/shared/其它 service/types；不拼 HTTP 响应（ok/paginate 在 route 层）。
- ④ shared 禁项：shared 不查库、不引 services（已 grep 确认）。
- ⑤ `AuthVars` 上提 `types/auth.ts`（middleware 透出，路由无感）。
- ⑥ 按批执行 + 每批必跑门禁全绿。
- ⑦ 禁止夹带逻辑/契约改动：本批未新增/修改任何业务逻辑分支，未改 ErrCode 文案或 HTTP 映射。
- ⑧ 不改 `docs/api/openapi.v1.yaml`。

## 六、遗留可选项（非阻塞，交统筹/架构师裁定，非本批范畴）

- 评论状态机 `Comment.status` 未配 `x-allowed-transitions`：N9-2 范围本就限定 Article §2.3，评论状态机与 §2.2/§3.3 同源，归 PRD 层 TODO，不构成权威模糊（04 已登记）。
- F2 应急集 33/35 计数复核、OAuth redirect 白名单 M3-09 声明、M6-09 一致性校验增补「授权行为」断言：均属契约层/七端协调事项，不在本结构调优批内。
- owner 冻结前置条件：目录结构与组织风格需先经 owner 确认符合预期，再执行冻结（当前仍「待调优（未冻结）」）。

## 七、交付物

- 代码：`node-backend/src` 全量按 04 目标结构落位。
- 门禁证据：上表五门全绿。
- 本说明：`docs/node-backend/B-结构调优-NOTES.md`。

**建议下一步**：交统筹 AI 独立复验（git diff + 门禁复跑 + 铁律逐条核对）；复验通过后由 owner 确认目录风格 → 冻结 → 进入「写 M1 后端文章」（M1-01~M1-30）。
