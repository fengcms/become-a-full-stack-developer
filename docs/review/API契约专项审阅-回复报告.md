# API 契约专项审阅 · 回复报告

> 审阅对象：`docs/api/openapi.v1.yaml`（契约版本 1.7.0）/ `docs/prd/02-领域模型与API契约.md`（v1.8）
> 回应版本：契约 **1.8.0**；文档 00/01/02/README **v1.11**
> 审阅结论（原）：不可冻结（R1–R11）
> 回应结论：**全部清零，契约已达"七端共享唯一地基"定位，可冻结**

---

## 一、总览

| 编号 | 严重度 | 主题 | 处置 | 机器化落地 | 验证断言 |
|---|---|---|---|---|---|
| R1 | 🔴 致命 | RBAC 角色未机器化 | **已清零** | `x-required-roles` 覆盖 46 个需登录端点 + `x-owner-resource` ×6 | 语义门 **R1 段**（缺声明/非法角色即 FAIL） |
| R2 | 🔴 致命/高 | 点赞/收藏幂等未表达 | **已清零** | `x-idempotent: true` ×4 + 当前态示例 | 语义门 **G6**（幂等端点不得声明 409） |
| R3 | 🟠 高 | 85 字符串字段零约束 | **已清零** | `maxLength`/`format:email`/`pattern`/`minLength` 下沉 | 结构门 + 人工核对 |
| R4 | 🟠 高 | 上传无大小/类型约束 | **已清零** | `x-max-size-bytes:10485760` + `x-accepted-mime-types`×6 | 语义门 **G3/G4** |
| R5 | 🟠 高 | 无 429 限流 | **已清零** | `ErrorCode 5001` + `RateLimited` 组件 + `info.x-rate-limit` + 21 端点挂 429 | 语义门 **R5** |
| R6 | 🟡 中 | 归属/状态副作用在散文 | **已清零** | `x-owner-resource` ×6 + 描述补全回退语义 | 语义门 **G5** |
| R7 | 🟡 中 | 删除级联未契约化 | **已清零** | `x-cascade`（none/children/soft-hide） | 语义门 **G1** |
| R8 | 🟡 中 | 用户查询权限边界模糊 | **已清零** | `GET /users/{id}` 标注 admin 专用；公开资料走 `GET /members/{id}` | 描述 + 结构门 |
| R9 | 🟡 中 | 1004/1005 缺示例 + 校验门兜底松 | **已清零** | 1004/1005 结构化示例；F 段去 description 兜底 | 语义门 **F1/F2/F3** |
| R10 | 🟡 低 | 分类无最大深度 | **已清零** | `Category.x-max-depth: 4` | 语义门 **G2** |
| R11 | 🟡 低 | 无版本/废弃策略 | **已清零** | `info.x-api-version: 1` + 02 §设计原则补废弃策略 | 结构门 |

**核心判断（与原审阅一致）**：错误码机器化修好了，但"谁能调、字段多长、重复操作怎么办、流量怎么限"这些决定七端是否真一致的约束，仍大量停在散文里。本报告把这"没修干净的一半"补齐，并顺势把 02 文档自身角色定义的前后矛盾（§端点目录把 categories/tags/评论审核/approve 误标"仅 admin"）一并修正。

---

## 二、逐项回应

### 🔴 R1（致命）RBAC 角色机器化

**采纳方案 B（轻量扩展字段）**，不引入 `oauth2 scopes`——理由是七端复用同一契约，scope 会牵动所有端的 `security` 写法与生成器配置，成本过高；而 `x-required-roles` 仅作"声明性注解"，不改鉴权机制、不破坏现有 `bearerAuth` 一致性。

- **角色取值**：`member` / `editor` / `admin`，层级 `member < editor < admin`。评估规则写入契约 `info.description` 第 4 条铁律：admin 始终放行；其余角色当且仅当其层级 ≥ 端点 `x-required-roles` 最小层级，或与 `x-owner-resource` 指向的资源存在归属关系时放行。
- **覆盖范围**：**46 个需登录端点全部声明** `x-required-roles`（脚本实测计数）。其中 6 个归属敏感端点（update/delete article、delete comment、delete attachment、update notification）另标 `x-owner-resource`，使"作者/上传者本人亦可操作"从散文下沉为机器字段。
- **校验升级**：`check_contract.py` 新增 **R1 段**——任何 `security` 要求登录的端点若未声明 `x-required-roles` 或取值非法，立即 FAIL。至此"全绿假象"被堵死：Node 与 Go 两后端、M3 前端都能从契约直接生成角色判断，M6-09 一致性校验也可加入角色行为断言。
- **顺带修正文档自身矛盾**：原 02 §端点目录把 `POST/PUT/DELETE /categories`、`POST/PUT/DELETE /tags`、`PATCH /comments/{id}/status`、`POST /admin/articles/{id}/approve` 误标"仅 admin"，与 §角色边界段（editor 管全站内容）直接冲突。现统一为 `editor/admin`，**以角色定义段为权威**。

> 这是比 F1 更隐蔽的缺陷，原审阅点得很准——文档在 §3.2 立下"约束须下沉"铁律，却对最关键的"角色"网开一面。现已闭环。

### 🔴 R2（致命/高）点赞/收藏幂等

- 对 `likeArticle` / `unlikeArticle` / `addFavorite` / `removeFavorite` 四个写端点标注 `x-idempotent: true`；
- `likeArticle` 200 示例补 `{liked:true, likeCount:42}`（当前态），`unlikeArticle` 补 `{liked:false, likeCount:41}`（已修正先前误写的 `liked:true`）；
- `addFavorite` 200 补空 `data` 示例，明示"重复收藏不报错、不重复插行"；
- 语义门 **G6** 断言：标了 `x-idempotent` 的端点**不得声明 409**——从机制上禁止"一个实现返回 409、另一个返回 200"的分歧。

### 🟠 R3（高）85 字符串字段约束

将约束下沉为 schema 字段（直接生成到前后端校验，是"七端一致"的硬保障）：

- `email` → `format: email` + `maxLength: 255`（User / RegisterRequest / ProfileUpdateRequest）
- `password` / `newPassword` / `oldPassword` → `minLength: 8`
- `slug`（Article / Category / Tag）→ `pattern: ^[a-z0-9-]{1,64}$` + `maxLength: 64`
- `title` → 200、`name` → 50、`summary` → 500、`nickname` → 32、`username` → 32、`description` → 500、`url` / `avatar` / `logoUrl` → 512、`mimeType` → 100
- `Article.content` → `maxLength: 65535`；`Comment.content` → 2000；`Attachment.size` → `maximum: 10485760`
- `SiteSetting` / `SiteSettingUpdate` 全字段补 `maxLength`；`TocItem.link/text/anchor` 补长度

### 🟠 R4（高）上传约束

- `POST /upload` 的 requestBody schema 加 `x-max-size-bytes: 10485760`（10MB）+ `x-accepted-mime-types`（image/png、jpeg、gif、webp、svg+xml、application/pdf 共 6 类）；
- 文件字段 `description` 写明超限/类型不符返回 400 / `code 4001`；原 400 示例改 `field: file`；
- 语义门 **G3/G4** 校验这两个扩展字段取值合法。

### 🟠 R5（高）429 限流

- `ErrorCode` 枚举新增 `5001`（限流）；
- 新增 `components.responses.RateLimited`：429 + `Retry-After` 头 + `code 5001` 示例；
- `info` 加 `x-rate-limit`（limit 60 / window 1m / code 5001），并说明"网关层统一施加于公开端点，鉴权端点不设此限"；
- **21 个公开端点**挂 `429: $ref RateLimited`；语义门 **R5** 校验三者齐备。

### 🟡 R6（中）归属与状态副作用

- `x-owner-resource` 标注 6 个端点（`articleId`×3、`commentId`、`attachmentId`、`notificationId`）；语义门 **G5** 校验其非空且只挂在需登录端点；
- `updateArticle` 描述明确"作者本人，或 editor/admin"；并写明 member 编辑已 published 文章自动退回 pending 的副作用（不再只活在散文）；
- `deleteArticle` 描述补全 `x-cascade: soft-hide` 隔离可见性、保留点赞/收藏历史的策略。

### 🟡 R7（中）删除级联语义

- `x-cascade` 机器化：`deleteComment → children`（级联子回复）、`deleteArticle → soft-hide`（隔离可见性不物理删）、`deleteAttachment → none`；语义门 **G1** 校验取值 ∈ {none, children, soft-hide}。

### 🟡 R8（中）用户查询权限边界

- `GET /users/{id}` summary 明确"**admin 专用；查他人公开资料请走 `GET /members/{id}`**"（后者本就为公开端点），消除"member A 能否读 member B 资料"的歧义。

### 🟡 R9（中）错误码示例补全 + 校验门收紧

- `login` 401 改为 `examples:` 复数，含 `wrong_credentials`(1001) / `account_disabled`(1005)；
- `refresh` 401 改为 `examples:` 复数，含 `refresh_invalid`(1003) / `token_missing`(1004) / `token_invalid`(1002) / `account_disabled`(1005)——**1004 由此获得结构化示例**；
- **F 段收紧**：去掉 `description` 兜底，枚举非零码必须在**结构化** `example` / `examples` 中落地（见下 "双门校验现状"）。

### 🟡 R10（低）分类最大深度

- `Category` schema 加 `x-max-depth: 4`；语义门 **G2** 校验其为整数 ≥1。

### 🟡 R11（低）版本 / 废弃策略

- 契约 `info.x-api-version: 1`；
- 02 §API 设计原则补"版本/废弃策略"行：仅向后兼容增量变更落 v1，破坏式变更升 v2 并保留过渡期，废弃项 `deprecated: true` + 变更记录登记。

---

## 三、双门校验现状

**结构门**（`openapi-spec-validator`）：`docs/api/openapi.v1.yaml: OK` ✅

**语义门**（`check_contract.py`）：**全部 22 条断言 OK**（原 67 操作 / 45 schema / 错误码基础上，新增 R1 角色机器化、R5 限流、G 扩展约束）：

```
A 结构完整性         4 条 OK
B operationId        2 条 OK
C 孤儿实体           1 条 OK
D 死胡同状态         2 条 OK
E 机器强制约束       3 条 OK
F 错误码（收紧）     4 条 OK（去 description 兜底，认 example/examples）
R1 角色机器化        3 条 OK（46 端点全声明，取值合法）
R5 限流声明          1 条 OK
G  扩展约束结构      7 条 OK（cascade/depth/size/mime/owner/idempotent）
```

> 过程中发现并修复一处 OpenAPI 3.1 合规问题：`examples:` 复数须在每例外包 `value:`（否则 `openapi-spec-validator` 报 `unevaluatedProperties`）。已按规范改正，`login`/`refresh` 的 401 现完全合规。

---

## 四、与历史审阅的承接

| 历史项 | 状态 |
|---|---|
| 内容审阅 F1（错误码只在散文） | **已修复（前轮），本次复核确认** |
| 内容审阅 F2（应急集 33/35 不符） | **不在本报告 R1–R11 范围**；建议在规划冻结前由内容审阅统一复核 01 §13 计数与最小可交付集，列为后续 TODO |
| 内容审阅 F3（§三 `?status=` 矛盾） | **已修复（前轮）**，本次复核一致 |
| 内容审阅 F4（版本号错位） | **已顺带清零**：00/01/02/README 统一为 v1.11，契约 1.8.0，三文档与契约版本完全对齐 |

---

## 五、结论

原审阅"不可冻结"的 11 条已全部清零，且每一条都从"散文描述"下沉为"机器可校验"的契约字段 + 语义门断言——这正是原审阅"F1 没修干净的那一半"的彻底闭环。契约现已配得上"七端共享唯一地基"的定位，**建议冻结**。

后续 TODO（非阻塞）：① 内容审阅 F2 应急集计数复核；② M6-09 契约一致性校验增补"角色行为"断言（R1 已为其铺好字段基础）。
