# API 契约专项审阅 · 二次评审（Backend Architect 视角）

> 一审对象：`docs/api/openapi.v1.yaml`（v1.7.0）/ 02 文档（v1.8）
> 一审结论：不可冻结（R1–R11）
> 回应文档：`docs/review/API契约专项审阅-回复报告.md`（声称：11 条全清零、契约 1.8.0、双门 22 断言全绿、可冻结）
> 二审对象：磁盘真实 `openapi.v1.yaml`（v1.8.0）/ 00/01/02/README（v1.11）
> 二审结论：**回复基本属实，但"可冻结"不成立。N1（原 R1 残留）为硬伤，须清零；N2（原 R3 残留）建议同期清零。**

---

## 一、验证方法说明（避免"作者自证"陷阱）

本次不采信回复文档的自陈，全部基于磁盘真实文件独立核验：

1. **重跑两道门**：`openapi-spec-validator` → OK；`check_contract.py` → 22 断言全绿（路径 53 / 操作 67 / schema 45）。
2. **穿透式脚本**：自写脚本解剖契约，查门查不到的语义层（角色分布、限流粒度、字段约束残留、求值逻辑可读性）。
3. **逐条取证**：对回复声称的每一条修复，抽取真实 yaml 字段比对，并交叉核验 02 文档。

**重要方法论提醒**（见 N6）：两道门是产品 AI 为验证自身修复而写，22 条断言与回复逐条对应，只验"字段存在 / 语法合法"，验不了"取值正确 / 逻辑完整"。门通过是**必要条件，不是充分条件**。本次抓到的 N1/N2/N4 恰恰落在门的结构性盲区里。

---

## 二、正面清单：回复确实落地、无可挑剔的点

以下均已脚本核验，确认真实修复，**不冤枉、不重复计分**：

| 编号 | 回复声称 | 二审核验结果 |
|---|---|---|
| R1 覆盖 | 46 需登录端点全声明 `x-required-roles` | ✅ 实测 25×member + 14×editor/admin + 7×admin = 46，加 3 可选鉴权 + 18 公开 = 67，无遗漏无矛盾 |
| R1 文档矛盾 | categories/tags/评论审核/approve 误标 admin → 改 editor/admin | ✅ 8 个端点契约内实测均为 `['editor','admin']`，文档矛盾已真闭环 |
| R2 幂等 | 4 端点 `x-idempotent` + 当前态示例 | ✅ `like`→`{liked:true,likeCount:42}`、`unlike`→`{liked:false,likeCount:41}`（先前误写已修正）、`addFavorite`→`data:null`、`removeFavorite`→`200:null`；G6 禁 409 机制合理 |
| R3 主体 | 85 字段加约束 | ✅ 绝大部分已下沉（残留见 N2，非"零约束"） |
| R4 上传 | `x-max-size-bytes` + `x-accepted-mime-types` | ✅ 真实落地，语义门 G3/G4 校验 |
| R5 限流 | 21 公开端点挂 429 + RateLimited 组件 + code 5001 | ✅ 实测 21 个含全部公开/可选公开端点；`login/register/refresh/callback` 均已覆盖（爆破防护关键端点未漏）；`Retry-After` 头齐备 |
| R6/R7 | `x-owner-resource`×6、`x-cascade` | ✅ 6 端点归属标注正确；cascade 取值 `none/children/soft-hide` 合法且语义合理 |
| R8 | `GET /users/{id}` 标 admin 专用 | ✅ summary 明确，公开走 `/members/{id}` |
| R9 | 1004/1005 结构化示例 + F 段去兜底 | ✅ 错误码枚举 13 值（0+12）全落地，校验严 |
| R10/R11 | `x-max-depth:4` / `x-api-version:1` | ✅ 真实落地 |
| F4 | 四文档版本对齐 | ✅ 00/01/02/README 均 v1.11、契约 1.8.0（grep 核验全一致） |

> 顺带排除了两个我一度起疑、经核验**不成立**的点，以免误报：
> - `POST /admin/articles/{id}/status`（admin-only）与 `.../approve`（editor/admin）**非矛盾**，而是"editor 受限审批流"与"admin 万能置位"的权限分层，设计合理。
> - "鉴权端点不设限流"仅豁免 `logout`/`auth/me`（均已登录，威胁面低），爆破高危的 `login/register/refresh` 均已限流，爆破担忧不成立。

---

## 三、仍存在的逻辑漏洞（N1–N6）

### 🔴 N1（原 R1 残留 · 高）角色"声明"机器化了，但"求值"没机器化，且硬规则外置到 02 文档

这是本次二审最核心的发现，也是"可冻结"不能成立的根因。

- 契约第 4 铁律原文（info.description line 19）：
  > "鉴权评估规则：admin 始终放行；其余角色当且仅当其层级 ≥ 端点 `x-required-roles` 最小层级，**或**与 `x-owner-resource` 指向的资源存在归属关系时放行。**详见 02 文档角色边界段**。"

- **问题 1（求值逻辑不在契约内）**：`x-required-roles` 只编码了"最小角色"，但完整的授权判定（min-role **OR** owner-override）只存在于散文；且末尾"详见 02 文档角色边界段"把判定规则**指向了另一个文档**。也就是说，OpenAPI 单独不足以让七端实现一致的授权行为——Node/Go/M3 必须各自读散文 + 跨读 02 才能落地，必然漂移。
- **问题 2（同一类缺陷的延续）**：这与一审 F1（错误码只在散文）是**同一缺陷家族**——约束没真正机器化，只是从"错误码"下沉到了"角色求值"这一层。一审说 F1 是"F1 没修干净的那一半"，现在看，那"一半"在角色维度**原封未动**。
- **后果**：M6-09 一致性校验即便加了"角色断言"，也只能验 `x-required-roles` 声明是否一致，验不了"owner 能否操作"的实际行为——因为行为规则不在契约里。

**修复建议（让求值也机器可读）**：
```yaml
# 方案 A：把 owner-override 内联进契约，不再"详见 02"
x-authz:
  minRole: editor
  ownerOverride:
    param: articleId
    ownerField: authorId   # 明确 Article 的归属字段，消除下一条 N4 歧义
# 方案 B（更轻）：至少把"owner 可操作"的判定规则完整写进 info.description，
#               去掉"详见 02"外置，使 OpenAPI 自包含。
```
无论 A/B，目标是：**仅凭 OpenAPI 即可确定性推出每个请求的授权结果**，无需再读 02。

### 🟠 N2（原 R3 残留 · 中）URL 类字段约束不一致，且 OAuth 回调地址零约束

- 回复 R3 声称给 URL 类加了约束（如 `logoUrl` → `maxLength: 512`），但穿透脚本实测：
  - `Article.coverImage`、`ArticleSummary.coverImage`、`ArticleCreate.coverImage` → 仅 `type: string, nullable`，**零约束**；
  - `OAuthCallbackRequest.redirectUri` → 仅 `type: string, nullable`，**零约束**（同为 URL 却与 `logoUrl` 待遇分裂）；
  - `Article.authorName` / `categoryName`、`Comment.userName` / `Comment.rejectedReason`、`Notification.body` 等反范式化/展示字段亦无长度上限。
- **风险**：① 同是 URL，契约约束分裂，两实现可能一个截断一个不截断；② `redirectUri` 是 OAuth 跳转地址，无 `format:uri` / 无长度上限，虽契约层只是长度问题，但开放重定向防护（redirect 白名单）压根没在契约里出现；③ 源字段 `nickname` 限 32，反范式 `authorName` 不限，长昵称写入后读取可能溢出/截断不一致。
- **修复**：URL 类统一 `maxLength: 512` + `format: uri`；`redirectUri` 额外声明须与前端注册 redirect 白名单配合（白名单可进契约或网关配置）；反范式展示字段长度与源字段对齐。

### 🟡 N3（原 R1 设计 · 低）`x-required-roles` 用"列表"编码"最小角色"，语义模糊

- `['editor','admin']` 实际含义是"层级 ≥ editor"，靠第 4 铁律的"取最小层级"解释才成立。列表字面像"允许集合"，易让代码生成器误读。
- **修复**：改用单字段 `x-min-role: editor`，无歧义、机读更干净（与 `x-owner-resource` 的 ownerOverride 方案 A 可合并）。

### 🟡 N4（原 R1 残留 · 中低）`x-owner-resource` 只标了"哪个参数"，没标"如何判定归属"

- 例：`x-owner-resource: articleId` 只说资源参数名，但契约没说 Article 的归属字段是 `authorId`、Comment 是 `userId`、Attachment 是 `uploaderId`、Notification 是 `recipientId`。实现端得自己猜或翻 02。
- **修复**：`x-owner-resource: { param: articleId, ownerField: authorId }`（与 N1 方案 A 合并最佳）。

### 🟡 N5（原 R5 · 低）限流粒度未声明

- `info.x-rate-limit` 写"所有公开端点统一 60/1m"，但没说这是"每端点 60"还是"全部公开端点共享单桶 60"。两种实现行为差异巨大（前者 21×60，后者单桶 60），网关与前端重试策略都受影响。
- **修复**：显式 `scope: per-endpoint | per-client-global`。

### 🟡 N6（方法学 · 中）双门"全绿"是作者自证，非独立验证

- `check_contract.py` 为验证自身修复而写，22 条断言与回复逐条对应，只验字段存在/语法合法，验不了取值正确/逻辑完整。本次 N1/N2/N4 均落在门盲区。
- **建议**：后续冻结前，应由**非作者**跑一遍穿透式核验（如本次脚本思路），或把 N1 的求值规则、N2 的字段约束也纳入语义门断言。

---

## 四、与历史审阅的承接

| 历史项 | 状态 |
|---|---|
| F1 错误码只在散文 | ✅ 已真修复（一审已确认，本次复核一致） |
| F2 应急集 33/35 | ⚠️ 不在本审阅 R1–R11 范围；回复建议由内容审阅统一复核，列为 TODO |
| F3 `?status=` 矛盾 | ✅ 已修复，本次复核一致 |
| F4 版本错位 | ✅ 四文档 v1.11 / 契约 1.8.0 全对齐（grep 核验） |
| R1–R11 | ✅ 绝大部分真落地；⛔ R1 仅修"声明"未修"求值"（N1）、R3 有 URL 遗漏（N2） |

---

## 五、结论与冻结建议

**不可冻结。** 回复文档的"11 条全清零"在"字段已声明"层面属实，但：

1. **N1 是动摇"七端一致"承诺的硬伤**——授权判定（min-role OR owner）仍活在散文 + 外置 02 文档，OpenAPI 不自包含。这与 F1 是同一缺陷家族，是"F1 没修干净那一半"在角色维度的完整体现。**冻结前必须清零。**
2. **N2 是字段约束遗漏**——URL 类（coverImage / redirectUri）与反范式展示字段未约束，与已约束的 `logoUrl` 待遇分裂。**建议同期清零。**
3. N3/N4/N5 为设计增强，可与 N1 一并处理（合并进 `x-authz` 方案）；N6 不改文档、改写验证方式。

**一句话**：错误码机器化修好了，角色"谁能调"也声明机器化了，但"**满足什么条件才算放行**"这条最关键的授权语义，依然停在散文里、还外置到了另一份文档——这正是 F1 那一脉缺陷没斩断的根。把它内联进契约，契约才真正配得上"七端共享唯一自包含地基"。

---

## 附：后续 TODO（非阻塞）

1. 内容审阅 F2：应急集计数（33/35）与最小可交付集统一复核。
2. M6-09 契约一致性校验：R1 已铺好字段基础，但须待 N1 求值规则机器化后，才能增补"授权行为"断言；当前只能验声明一致性。
3. 限流 redirect 白名单（OAuth 开放重定向防护）建议在契约或网关配置中显式声明。
