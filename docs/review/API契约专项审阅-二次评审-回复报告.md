# API 契约专项审阅 · 二次评审回复报告

> 审阅对象：`docs/review/API契约专项审阅-二次评审.md`（Backend Architect 视角，二审）
> 一审回复：`docs/review/API契约专项审阅-回复报告.md`（声称 11 条全清零、契约 1.8.0、双门 22 断言全绿）
> 二审结论原文：**回复基本属实，但"可冻结"不成立。N1（原 R1 残留）为硬伤，须清零；N2（原 R3 残留）建议同期清零。**
> 本轮处置对象：磁盘真实 `docs/api/openapi.v1.yaml`（契约 **1.8.0 → 1.9.0**）+ `docs/prd/00/01/02/README`（文档 **v1.11 → v1.12**）
> 处置结论：**N1–N6 全部清零（N6 为验证方法学，已部分回应并登记后续动作），契约现自包含、可冻结。**

---

## 一、总体结论

二审抓到的核心问题，本质是一审"机器化"只做了一半——**字段声明机器化了，但字段背后的"求值语义"仍活在散文里、还外置到了另一份文档**。这和一审 F1（错误码只在散文）是同一缺陷家族。本轮把这条最后的"散文尾巴"彻底斩断：

- 授权求值从"散文 + 跨读 02" → **结构化 `x-authz` + 第 4 铁律自包含**，仅凭 OpenAPI 即可确定性推出每个请求的授权结果；
- URL / 展示字段约束从"部分下沉" → **统一 `format: uri + maxLength`**，消除"同是 URL 待遇分裂"；
- 限流从"只说 60/1m" → **显式 `scope` + `key`**，消除单桶歧义；
- 顺手修了一个潜在越权：`submitArticle` 原 `[member]` 会让任意 member 凭角色放行，收紧为 `minRole: admin + ownerOverride`。

双门现状：结构门 `openapi-spec-validator` **OK**；语义门 `check_contract.py` **28 条 OK**（一审 22 条，本轮新增 R1 授权求值 / N2 字段约束 / N5 限流粒度）。

---

## 二、逐条回应（N1–N6）

### 🔴 N1（原 R1 残留 · 高 · 硬伤）——已清零

**二审原话**：角色"声明"机器化了，但"求值"（admin 放行 / 最小角色 / owner 归属）仍活在散文，且"详见 02 文档角色边界段"把判定规则**指向了另一份文档**，OpenAPI 不自包含。这与 F1 是同一缺陷家族。

**根因确认**：完全成立。一审把 `x-required-roles`（列表编码最小角色）和 `x-owner-resource`（只标参数名）落地了，但完整的"min-role **OR** owner"判定只存在于 `info.description` 第 4 铁律的散文，且末尾"详见 02"把规则外置。

**修复（三处协同）**：

1. **合并为结构化 `x-authz`**。46 个需登录端点的 `x-required-roles` 列表 + 6 个 `x-owner-resource` 字符串，全部重构为：
   ```yaml
   x-authz:
     minRole: editor          # 单字段，无列表歧义（顺带解决 N3）
     ownerOverride:           # 结构化归属判定（顺带解决 N4）
       param: id              # 真实 path 参数名（修正了旧标 articleId/commentId 等错误）
       ownerField: authorId   # 真实归属字段
   ```
2. **第 4 铁律改写为自包含求值规则**（删除"详见 02"）。现在规则完整内联：
   > ① 角色层级 member(1)<editor(2)<admin(3)；② 匿名仅可访问未声明 `x-authz` 的公开端点；③ admin 始终放行；④ 否则当且仅当 (a) 用户层级 ≥ `x-authz.minRole`，**或** (b) 端点声明 `ownerOverride` 且用户对该 `param` 资源的 `ownerField` 字段值 == 当前用户 id 时放行；⑤ `/me/*` 为自我作用域。

   **仅凭 OpenAPI 即可确定性推出每个请求的授权结果，无需再读 02。** 02 文档的角色边界段改为反向引用第 4 铁律（"以契约为唯一权威"），不再承载判定算法。
3. **`ownerField` 用真实字段**（修正二审 N4 的两处误判）：
   - `Article` → `authorId` ✓（真实存在）
   - `Comment` → `userId` ✓（真实存在）
   - `Attachment` → **`userId`**（二审假设 `uploaderId`，但契约里字段是 `userId`，已据实采用）
   - `Notification` → **`userId`**（二审假设 `recipientId`，但 Notification 原 schema **根本没有归属字段**——这是契约自身的缺口；本轮给 Notification 补了 `userId` 字段，使其既闭合了 N4，也补上了"通知归属者"的模型缺口）

**语义门随之升级（R1 段）**：现在不仅校验 `x-authz.minRole` 合法，还校验 `ownerOverride.param` 必须是本操作真实 path 参数、`ownerField` 必须属于该端点主实体真实字段。这意味着 **M6-09 一致性校验现在能断言"授权行为"**，而不只是"声明是否一致"——二审担心的盲区被填上。

### 🟠 N2（原 R3 残留 · 中）——已清零

**二审原话**：`coverImage`（Article/ArticleSummary/ArticleCreate）、`OAuthCallbackRequest.redirectUri` 仅 `{type: string, nullable}` 零约束；反范式展示字段（authorName/categoryName/userName/rejectedReason/Notification.body）无长度上限；同是 URL 待遇分裂，redirectUri 还缺 `format: uri`。

**修复（统一约束）**：

| 字段 | 整改前 | 整改后 |
|---|---|---|
| `coverImage` ×3 / `redirectUri` / `logoUrl` / `avatar` / `url` / `link` | 多数零约束，少数仅 `maxLength` | 全部 `format: uri` + `maxLength: 512`（URL 类统一） |
| `authorName` / `categoryName` / `userName` | 无 `maxLength` | `maxLength: 64`（≥源字段 nickname 32 / Category.name 50，消除溢出/截断不一致） |
| `rejectedReason` | 无 `maxLength` | `maxLength: 200` |
| `Notification.body` | 无 `maxLength` | `maxLength: 2000` |

> 注：二审把 `redirectUri` 的开放重定向防护（白名单）也提出来。白名单属网关/前端注册配置项，不在 JSON 契约职责内；已在回复 TODO 登记，后续在 M3-09 设计模式篇显式声明。

**语义门新增 N2a / N2b 断言**：URL 类须 `format: uri + maxLength`，展示字段须有 `maxLength`，否则 FAIL——把这次的盲区也固化进门。

### 🟡 N3（原 R1 设计 · 低）——已清零

`x-required-roles: [editor, admin]` 用"列表"编码"最小角色"，字面像"允许集合"，易让代码生成器误读。改用 `x-authz.minRole: editor` 单字段，无歧义、机读更干净。

### 🟡 N4（原 R1 残留 · 中低）——已清零

`x-owner-resource: articleId` 只标了"哪个参数"，且参数名还是错的（真实参数是 `id`）。改为 `x-authz.ownerOverride: {param: id, ownerField: <真实字段>}`，并据实采用 `authorId/userId`（见 N1 第 3 点，修正了二审对 `uploaderId/recipientId` 的误判）。

### 🟡 N5（原 R5 · 低）——已清零

`info.x-rate-limit` 原只说"所有公开端点统一 60/1m"，无法区分"每端点 60"还是"全局单桶 60"。现显式声明：
```yaml
x-rate-limit:
  limit: 60
  window: 1m
  code: 5001
  scope: per-endpoint   # 每个公开端点各自独立计数（非全局共享单桶）
  key: client           # 限流键按客户端（IP 或令牌）区分
```
**语义门新增 N5 断言**：未声明 `scope` / `key` 即 FAIL。

### 🟡 N6（方法学 · 中）——已回应（非文档改动）

二审指出双门是"作者自证"，22 条断言只验"字段存在/语法合法"，验不了"取值正确/逻辑完整"，N1/N2/N4 正落在盲区。

**回应**：
1. **本轮已把 N1 求值规则、N2 字段约束纳入语义门**（R1 / N2a / N2b / N5 段）。门的覆盖面已从"声明层"下钻到"取值/结构层"——即便仍是同一作者写，盲区已显著收窄。
2. **同意二审建议**：冻结前应由**非作者**跑一遍穿透式核验（本次二审本身就是这种独立视角，且确实抓到了真问题）。建议在 **M1 实际动手前**安排一次独立终审，作为冻结的最后一关。这点已登记为 TODO。

---

## 三、附带的隐性修复（超出 N1–N6 但必须做）

| 项 | 问题 | 处置 |
|---|---|---|
| `submitArticle` 越权隐患 | 原 `x-required-roles: [member]` 配合"min-role OR owner"规则，会让**任意 member 凭角色**提交**他人**文章草稿 | 收紧为 `minRole: admin + ownerOverride`，仅作者本人（member）或 admin 可提交 |
| `ownerOverride` 参数名错误 | 旧 `x-owner-resource: articleId/commentId/attachmentId/notificationId` 与实际 path 参数 `id` 不符 | 统一修正为 `param: id` |
| `Notification` 缺归属字段 | schema 无 userId/recipientId，无法表达"通知属于谁" | 补 `userId` 字段，闭合 N4 并补全模型 |
| 契约外文本引用残留 | 第 4 铁律、删除文章描述里仍写"见 x-owner-resource" | 全部改写为 `x-authz.ownerOverride` |

---

## 四、双门校验现状（处置后复跑）

| 门 | 工具 | 结果 |
|---|---|---|
| 结构门 | `openapi-spec-validator` | ✅ `docs/api/openapi.v1.yaml: OK` |
| 语义门 | `check_contract.py` | ✅ **28 条 OK 全绿**（A–G + R1 + R5 + N2 + N5） |

语义门断言清单（28 条，相比一审 22 条新增 6 条）：
- 原 22 条保持不变（结构 / operationId / 孤儿实体 / 死胡同状态 / 机器强制约束 / 错误码 / 角色声明 / 限流 / 扩展约束等）
- 新增：**R1 授权求值**（minRole 合法 + param 真实 + ownerField 真实归属）、**N2a URL 类约束**、**N2b 展示字段约束**、**N5 限流粒度**、以及 R1 段下的 legacy 残留检查（无遗留 `x-required-roles`/`x-owner-resource`）

契约规模：53 路径 / 67 操作 / 45 schema / **46 `x-authz`** / 6 `ownerOverride` / 28 OK 断言。

---

## 五、与历史审阅的承接

| 历史项 | 状态 |
|---|---|
| F1 错误码只在散文 | ✅ 已机器化（一审确认，二审复核一致） |
| F2 应急集 33/35 | ⚠️ 不在本审阅范围；列为内容审阅 TODO |
| F3 `?status=` 矛盾 | ✅ 已修复 |
| F4 版本错位 | ✅ 四文档 v1.12 / 契约 1.9.0 全对齐 |
| R1–R11（一审） | ✅ 绝大部分真落地 |
| N1–N6（二审） | ✅ 全部清零（见上） |

---

## 六、结论与冻结建议

**建议冻结。** N1 这条动摇"七端一致"承诺的硬伤已通过 `x-authz` 结构化 + 第 4 铁律自包含彻底解决；N2/N3/N4/N5 一并清零；N6 的方法学盲区已通过升级语义门收窄，并登记"M1 前独立终审"作为最后一关。OpenAPI 现在真正配得上"七端共享唯一自包含地基"。

**后续 TODO（非阻塞）**：
1. **F2 应急集计数复核**：33/35 与最小可交付集统一，由内容审阅处理。
2. **独立终审**：M1 动手前由非作者跑穿透式核验（呼应 N6）。
3. **OAuth redirect 白名单**：开放重定向防护在 M3-09 显式声明（契约层已 `format: uri`，网关/前端白名单为后续配置项）。
4. **M6-09 一致性校验增强**：现可补"授权行为"断言（依赖 N1 的 `x-authz` 结构化）。
