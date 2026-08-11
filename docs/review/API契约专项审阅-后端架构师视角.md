# API 契约专项审阅（后端架构师视角）

> 审阅对象：`docs/api/openapi.v1.yaml`（契约版本 **1.7.0**，OpenAPI 3.1.0，53 路径 / 67 操作 / 45 schema）、`docs/prd/02-领域模型与API契约.md`（v1.8）
> 审阅方法：① 亲手重跑两道校验门（`openapi-spec-validator` + `check_contract.py`）；② 编写深度剖析脚本，对契约做鉴权矩阵 / 错误码 / schema 约束 / 分页 / 幂等 / ownership 全量扫描；③ 交叉比对 02 文档的明文约定，定位 doc/contract 漂移。
> 审阅结论：**不可冻结**。结构合法 ≠ 逻辑无漏洞，且当前"全绿"掩盖了 RBAC 完全缺失这一级漏洞。

---

## 一、总评

契约在**结构合法性、错误码机器化、状态机闭环、分页一致性**上已经很硬，上一轮内容审阅抓出的 F1（错误码只在散文）确实已被修掉，这点必须肯定。

但本次以"七端一致复用同一份契约"为标尺重新审视，发现一处**与 F1 同类、甚至更隐蔽的系统性缺陷**：**授权（谁该调哪个端点）完全没有机器化**，而 02 文档自己在 §3.2 立下铁律要求约束下沉。此外，文档声称"已写入契约""幂等"的行为，契约层并未表达，构成 doc/contract 漂移。

> 关键判断：**`check_contract.py` 全绿是假象**——它既不查 RBAC，又用 `description` 兜底错误码落地（一段描述里提了码就算"落地"，实际无 example），因此无法发现本报告的 R1、R9。

---

## 二、已确认扎实的点（冻结信心来源）

| 项 | 证据 | 结论 |
|---|---|---|
| 双门校验全绿 | 结构门 OK；语义门 67 操作 / 45 schema / 错误码全绿 | 属实，非纸面 |
| 401/403 区分 | 401→`code 1001`（未认证）、403→`code 2001`（无权限） | 正确 |
| 错误信封统一 | 所有 4xx example 均含 `code/message/data/requestId/timestamp` | 一致 |
| 409 冲突覆盖 | slug 重复、分类成环、标签/分类/文章引用占用均 409/`3002` | 全面 |
| 分页一致 | `ArticlePage/UserPage/...` 统一引用 `Pagination{page,pageSize,total,totalPages}` | 一致 |
| refresh 旋转 | `POST /auth/refresh` 每次旋转 + 重放作废令牌家族 + 禁用账号拒绝 | 设计优秀 |
| 公开可见性铁律 N2 | `GET /articles` 为 `security:[]`（公开）、`GET /articles/{idOrSlug}` 可选鉴权、匿名草稿 404 | 契约层正确 |

---

## 三、实质性漏洞（按严重度）

### 🔴 R1（致命）RBAC 角色约束未机器化，且违反 02 文档自身 §3.2 铁律

**现象**
- `components.securitySchemes` 只有 `bearerAuth`（`http/bearer/JWT`），**0 个 scope**；全文 `scope` 出现 **0 次**。
- 所有 admin/editor 端点一律 `security: [{'bearerAuth': []}]`（继承全局鉴权），契约**无法表达"本端点需 admin 角色"**。例如：
  - `GET /api/v1/admin/articles`（仅 admin）
  - `GET /api/v1/users`、`PATCH /api/v1/users/{id}`（角色晋升，仅 admin）
  - `DELETE /api/v1/categories/{id}`、`POST /api/v1/tags`（editor+admin）
  - `POST /api/v1/articles`、`PUT /api/v1/articles/{id}`（member/editor/admin）
- 契约对"调用者需具备什么角色"只字未提。

**与文档的直接矛盾（漂移）**
- 02 文档 **line 96–99** 精确定义三角色权限边界（member/editor/admin，且 `editor` 调用户管理端点吃 403）。
- 02 文档 **line 313** 称"该约束写入契约，前端无需自行拦截，生成代码即知"。
- 02 文档 **line 479–497（§3.2 机器强制约束清单）** 明文："凡是白名单/取值/匹配口径类约束，**不允许只写在 description 散文里**——散文对代码生成器不可见，等于契约对实现无约束，七个端必然走形。"
- **结论**：文档用 §3.2 要求约束机器化，却对最关键的"角色"约束网开一面，只留在散文描述里。这正是 F1（错误码只在散文）的同类缺陷，且更致命——因为它决定"谁能干什么"。

**影响**
1. Node 与 Go 两后端只能从路径前缀 `/admin/` 或散文反推角色 → **必然分歧**；
2. `GET /users/{id}` 这类端点，member A 能否读 member B 的资料，契约不禁止也不要求 → 实现随意；
3. M6-09 契约一致性校验只验结构、验不了角色行为 → **结构相同、行为不同，对照测试查不出**；
4. M3 前端无法从契约得知该隐藏哪些管理按钮，只能硬编码反向推断。

**修复建议**
- 方案 A（推荐）：`securitySchemes` 引入 `oauth2` + `scopes: [admin, editor, member]`，每个受角色限制的端点用 `security: [{ bearerAuth: [admin] }]` 显式声明；
- 方案 B（轻量）：`bearerAuth` 保留，端点加 `x-required-roles: [admin]` 扩展字段；
- `check_contract.py` 增加断言：**所有 `/admin/` 路径端点必须声明角色要求**，否则 FAIL。

---

### 🔴 R2（致命/高）点赞/收藏幂等：文档声称幂等，契约未表达

**现象**
- 02 文档 **line 589–590**：`POST /articles/:id/like` 标注"点赞（幂等，重复点赞返回当前态）"；取消点赞"未点赞返回 `liked=false`"。
- 但契约 `POST /api/v1/articles/{id}/like` 响应仅 `200 / 401 / 404`，**无 409、无"重复点赞返回当前态"示例**；
- `POST /api/v1/me/favorites` 响应仅 `200 / 404`（重复收藏未定义）；
- 形如"重复操作返回什么"在契约里完全沉默。

**影响**：文档说幂等、契约沉默 → 一个实现返回 409、另一个返回 200，M6-09 结构层查不出。属典型 doc/contract 漂移。

**修复建议**：在契约 200 example 中明确返回"当前态"（如 `{liked:true, likeCount:N}`），并补一句"重复点赞返回当前态、不报错"；或显式定义 409。语义门加"幂等写端点必须声明重复操作行为"。

---

### 🟠 R3（高）85 个字符串字段零约束（email/password/slug/title 无 format/maxLength/pattern）

**现象**：脚本扫描出 **85 个字符串字段**既无 `enum`、无 `format`、无 `maxLength`、无 `minLength`，其中包括：
- `User.email` / `RegisterRequest.email` / `ProfileUpdateRequest.email` —— 无 `format: email`、无 `maxLength`；
- `LoginRequest.password` / `RegisterRequest.password` / `ChangePasswordRequest.newPassword` —— 无 `minLength`、无复杂度规则（契约允许 1 位密码）；
- `Article.slug` / `Category.slug` / `Tag.slug` —— 无 URL 安全 `pattern`、无 `maxLength`；
- `Article.title` / `Article.content` —— 无 `maxLength`（与 DB 列宽脱钩）。

**影响**：两实现各自发明校验上限 → 分歧；客户端无法预校验；DB 层与契约层约束错位（如 slug 超长/含非法字符破坏路由）。与 §3.2 精神一致（约束应下沉），但文档未把字段长度纳入"机器强制清单"——建议补。

**修复建议**：至少对 `email`（`format: email` + `maxLength:255`）、`password`（`minLength:8`）、`slug`（`pattern: ^[a-z0-9-]{1,64}$` + `maxLength:64`）、各 `name/title`（`maxLength`）落地。这些会直接生成到客户端与服务端校验，是"七端一致"的硬保障。

---

### 🟠 R4（高）上传端点无任何文件约束（大小 / 类型）

**现象**：`POST /upload` 的 `file` 为 `type: string, format: binary`，无最大尺寸、无 `mimeType` 白名单；`Attachment.mimeType` / `size` 也无约束/枚举。

**影响**：契约允许任意大小、任意类型文件上传（如 2GB 可执行文件），两实现各自在服务端补限制 → 客户端不知上限、实现分歧；也是安全隐患（恶意文件落地）。

**修复建议**：定义 `UploadRequest` 约束（或新参数 `maxSize`）+ `Attachment.mimeType` 枚举白名单（如 `image/*, application/pdf`）；前端据此限制。

---

### 🟠 R5（高）契约完全无 429 / 限流表达

**现象**：全文 `429` 出现 **0 次**；无 `Retry-After` 头。公开端点（文章列表/详情/评论）直面匿名流量，缺防御性限流。

**影响**：公开 API 无契约级限流约定，两实现限流策略（阈值/返回形态）必然不一致；客户端无法优雅处理 429。

**修复建议**：在公开端点补 `429` 响应（带业务 `code`，建议复用 5xxx 段或新增 `5001`）+ `Retry-After`；若限流放在网关层，也应在契约标注 `x-rate-limited: true`，保证七端一致认识 429。

---

### 🟡 R6（中）资源归属（ownership）与状态副作用只在散文

**现象**
- `PUT /articles/{id}` 描述"仅作者本人或 admin"；且"member 编辑已 published 的文章 → 自动退回 pending"——这是**有状态副作用**，契约无法表达"owner-or-admin"授权，也无法表达"自动状态回退"。
- `DELETE /comments/{id}`（作者或 admin）、`PATCH /users/{id}`（仅 admin 角色晋升）、`GET /users/{id}`（admin 还是本人？）归属规则全在散文。

**影响**：`member A` 改 `member B` 的文章，契约不禁止 → 一实现拦、一实现不拦；状态回退行为只能靠两实现各自实现，M6-09 验不出。

**修复建议**：用 `x-owner-resource: articleId` 之类扩展标注归属资源字段；状态副作用（publish→pending 回退）写入语义门断言，或在 02 明确"此行为由 M6-09 行为测试覆盖"。

---

### 🟡 R7（中）删除级联语义未契约化

**现象**：`DELETE /articles/{id}`（软删除）对其 comments / attachments / likes / favorites 的影响未定义；comment 删除级联子回复（项目记忆 N21）只在散文。

**影响**：orphaned 数据或级联差异（一个实现级联删、一个留孤儿）。

**修复建议**：在契约 description 或 `x-cascade` 显式声明级联/保留策略。

---

### 🟡 R8（中）`GET /users/{id}` 与 `GET /me/profile` 权限边界模糊

**现象**：任意登录用户能否查他人资料？文档未明确；契约统一 `bearerAuth`。若允许 → 隐私问题；若不允许（仅 admin/本人）→ 契约应区分。

**修复建议**：明确端点语义（建议：仅 admin 或本人；公开资料走 `GET /members/{id}`，该端点已存在且应为公开）。

---

### 🟡 R9（低/中）ErrorCode 1004 / 1005 缺具体示例，且校验门兜底过松

**现象**：枚举 12 码中仅 9 个有 example；`1004`（缺少访问令牌）、`1005`（账号禁用）仅在 description 出现。`check_contract.py` 的 F 段用 `description` 兜底算"落地"——一段描述提了码就 PASS，实际无 example。

**影响**：生成客户端/文档看不到这两个码的真实响应形态；且兜底降低了约束强度，§六 表与契约仍可能漂移。

**修复建议**：给 1004/1005 各补真实 401 example；F 段改为"枚举非零码必须在 example 中落地"（去掉 description 兜底）。

---

### 🟡 R10（低）分类无最大深度 / 层级约束

**现象**：`Category.parentId` 自关联，无 `depth` 上限字段；无限深度在树渲染时有性能/UI 风险。

**修复建议**：在 doc/契约声明最大层级（如 4 级），或在建树时限制。

---

### 🟡 R11（低）版本 / 废弃策略缺失

**现象**：`/api/v1` 硬编码，无 `Deprecation` / `Sunset` 头或演进规划。

**修复建议**：早期可忽略，但建议预留废弃机制，避免 v2 时破坏性升级。

---

## 四、与历史审阅的承接

| 历史项 | 状态 |
|---|---|
| 内容审阅 F1（错误码只在散文） | **已修复**——错误码已机器化，本报告确认 |
| 内容审阅 F2（应急集 33/35 不符） | 须复核——本次未作为重点，但 01 §13 计数若仍不一致建议一并清 |
| 内容审阅 F3（§三 `?status=` 与 N2 矛盾） | **已修复**——02 文档 §三 已改为"status 仅用于后台列表"，本次核验一致 |
| 内容审阅 F4（版本号错位） | 须复核 00/01/02 版本号是否统一为同轮 |
| **本报告 R1–R11** | **新增**，聚焦接口契约的授权/约束/幂等/限流/归属 |

---

## 五、冻结建议

**不建议冻结**。建议清零以下后方可冻结：

- **必须（阻塞）**：R1（RBAC 机器化）、R2（点赞幂等落地）、R3（核心字段约束）、R4（上传约束）、R5（429 限流）。
- **建议（高优先）**：R6（ownership 扩展）、R7（级联语义）、R8（用户查询边界）。
- **可延后（低优先）**：R9（错误码示例补全 + 校验门收紧）、R10、R11。

**一句话总结**：错误码机器化修好了，但"谁能调、字段多长、重复操作怎么办、流量怎么限"这些决定七端是否真一致的约束，依然大量停留在散文里——这正是 F1 没修干净的那一半。把它补齐，契约才配得上"七端共享唯一地基"的定位。
