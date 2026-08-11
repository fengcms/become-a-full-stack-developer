# API 契约专项审阅 · 三次评审（Backend Architect 视角）

> 审阅对象：`docs/review/API契约专项审阅-二次评审-回复报告.md`（产品 AI 对二审 N1–N6 的整改回应）
> 处置对象：磁盘真实 `docs/api/openapi.v1.yaml`（契约 **1.8.0 → 1.9.0**）+ `docs/prd/00/01/02/README`（文档 **v1.11 → v1.12**）
> 方法：不采信回复自陈，独立重跑双门 + 自写穿透脚本解剖 + 逐条比对磁盘真实值 + 反向核验 02 文档
> 结论：**N1–N6 整改基本属实，但"可冻结"仍不成立。新增 N7（中）/ N8（低）/ N9（中低），其中 N7 为冻结前应清零的完整性缺陷。**

---

## 一、总评与门状态（独立复验）

| 门 | 工具 | 结果 | 说明 |
|---|---|---|---|
| 结构门 | `openapi-spec-validator` | ✅ OK | 真实跑过 |
| 语义门 | `check_contract.py` | ✅ 28 条 OK | 一审 22 → 本轮 28（新增 R1/N2a/N2b/N5） |

契约规模：**53 路径 / 67 操作 / 45 schema / 46 `x-authz` / 6 `ownerOverride` / 28 OK 断言**。

**门过了 ≠ 没漏洞。** 28 条断言是同一作者为验自身修复而写，只验"字段存在 + 取值合法"，验不了"取值是否正确、逻辑是否自洽、响应是否完整"。本次三处新发现（N7/N8/N9）全部落在门盲区——这恰好印证了二审 N6 的方法学预警。

---

## 二、已确认修复（给足 credit，均脚本逐条核验）

| 项 | 回复声称 | 磁盘核验 | 结论 |
|---|---|---|---|
| **N1 授权求值自包含** | 第 4 铁律改写自包含，删除"详见 02" | 第 4 铁律原文确含 ①层级 ②匿名规则 ③admin 放行 ④min-role OR owner ⑤/me 自作用域，并明确"否则返回 403 / code 2001"；且**不引用 02** | ✅ 真修复 |
| **N1 双向闭环** | 02 文档角色边界段反向引用第 4 铁律 | 02 第 103 行："求值算法以 OpenAPI 第 4 铁律为唯一权威……本节为上溯性说明，歧义以契约为准" | ✅ 真修复 |
| **N2 字段约束** | URL 类 `format:uri+maxLength`，展示字段补 `maxLength` | 语义门 N2a/N2b 通过；`coverImage/redirectUri/logoUrl/avatar/url/link` 均 `format:uri`，`authorName`等均有 `maxLength` | ✅ 真修复 |
| **N3** | `x-required-roles` 列表 → `x-authz.minRole` 单字段 | 全部 46 端点用 `minRole: member/editor/admin`，无列表歧义 | ✅ 真修复 |
| **N4** | `x-owner-resource` → `x-authz.ownerOverride{param,ownerField}`，`param` 修正为 `id`，`ownerField` 用真实字段 | 6 端点 `param: id`；`ownerField` 为 `authorId`（Article）/ `userId`（Comment/Attachment/Notification）；`Notification.userId` 已补（字段清单确认） | ✅ 真修复 |
| **N5 限流粒度** | `x-rate-limit` 加 `scope: per-endpoint` + `key: client` | 语义门 N5 通过；21 公开端点 429 均 `$ref` `RateLimited`（code 5001） | ✅ 真修复 |
| **遗留清理** | 无遗留 `x-required-roles`/`x-owner-resource` | 语义门 R1e 通过（全量重构为 `x-authz`） | ✅ 真修复 |
| **`submitArticle` 越权** | `[member]` → `minRole:admin + ownerOverride` | `POST /admin/articles/{id}/submit` = `minRole:admin, ownerOverride{param:id, ownerField:authorId}` | ✅ 真修复（防任意 member 提交他人文章） |
| **作者可改删自己文章** | — | `PUT/DELETE /articles/{id}` = `minRole:editor + ownerOverride{authorId}`（无 IDOR） | ✅ 设计正确 |
| **版本对齐** | 四文档 v1.12 / 契约 1.9.0 | grep 确认 00/01/02/README 均 v1.12，yaml `version: 1.9.0` | ✅ 真修复 |

**小结**：二审担心的 N1 硬伤（授权求值只活散文 + 外置 02）已**实质清零**，且比回复声称的更扎实——双向闭环（契约自包含 + 02 反向引用）都落实了。这是本轮最大的进步，必须肯定。

---

## 三、独立复核新发现（门查不到）

### 🟠 N7（中）· 16 个需登录端点缺 401 响应声明

**证据**（脚本逐端点扫描 46 个 `x-authz` 端点）：

- 声明 401 的：**7 个**
- 声明 403 的：**23 个**
- **既无 401 也无 403 的：16 个**（全部为 `minRole: member` 端点）

16 个明细：`POST /auth/logout`、`GET /auth/me`、`POST /articles`、`GET /me/articles`、`POST /upload`、`GET /me/attachments`、`GET /me/favorites`、`POST /me/favorites`、`DELETE /me/favorites/{articleId}`、`GET /me/history`、`POST /me/history`、`DELETE /me/history`、`DELETE /me/history/{articleId}`、`GET /me/profile`、`PATCH /me/profile`、`POST /me/change-password`。

**问题本质**：
1. 第 4 铁律明令这些端点需鉴权（声明 `x-authz`），**无 token 必返 401**。但契约不声明 401 响应 → 规则承诺的行为与端点 schema 不一致，代码生成器/一致性测试无从知晓 401 存在。
2. `editor/admin` 受限端点（最该有 403 的）**已全部声明 403**（role_restricted_missing_403 = 0），说明作者**选择性**补了高角色端点，却漏了 member 端点——典型的"门只验存在、不验完整性"盲区。
3. 严格 OpenAPI linter（如 Spectral `owasp:security` / `operation-4xx-response` 规则）会对这 16 个全部报错。

**为何是中危而非低危**：它直接削弱"自包含授权"的承诺——授权*决策*自包含（第 4 铁律），但授权*失败时的线协议响应*未统一声明。修复极廉价：定义 `components.responses.Unauthorized`（401 + `code: 1001` 或对应码）并在全部 46 个 `x-authz` 端点 `$ref` 引用。

### 🟡 N8（低）· `/me/*` 端点 `ownerOverride` 声明不一致

第 4 铁律 ⑤ 说"`/me/*` 为自我作用域"，但实操上：
- `PATCH /me/notifications/{id}` **声明**了 `ownerOverride{param:id, ownerField:userId}`；
- `DELETE /me/favorites/{articleId}`、`DELETE /me/history/{articleId}`、`PATCH /me/profile` 等**未声明** `ownerOverride`，仅靠 `/me/` 前缀约定。

两种表达都能正确工作（规则 ⑤ 兜底），但契约**表征不统一**：一部分资源型 `/me/` 端点显式声明归属，另一部分依赖前缀约定。若某代码生成器只实现规则 ④（min-role OR ownerOverride）而忽略规则 ⑤（`/me/` 隐式归属），则 favorites/history 会因"无 ownerOverride + minRole:member"被误判为"任意 member 可操作他人资源"——虽然后端按 `/me/` 隐式归属能兜住，但**契约层面未显式锁死**，与项目"约束机器化、不靠约定自觉"的 §3.2 铁律自相矛盾。建议：要么全部 `/me/` 资源型端点统一显式声明 `ownerOverride`，要么在规则 ⑤ 增加"所有 `/me/*` 资源操作等同于 `ownerOverride{param:隐含, ownerField:userId}`"的机器可读表述。

### 🟡 N9（中低）· 契约仍含 12 处对 02 文档的引用，"无需再读 02" 言过其实

回复声称"删除详见 02""仅凭 OpenAPI 即可……无需再读 02""唯一自包含地基"。**对授权求值规则确属真话**（第 4 铁律自包含、02 反向引用）。但契约整体仍向 02 借了 **12 处**定义：

```
详见 02 文档                              ← 三条硬规则导语
02 §3.1 / 02 §3.2                        ← 硬规则 2（生命周期）/ 3（机器化）
见 02 §3.3                               ← 可选鉴权客户端配置
见 02 §2.6 / 02 §2.2×3 / 02 §2.3×2 / 02 §2.5  ← 上传/分类树/评论等域名语义交叉引用
```

**问题**：授权*结果*确实可仅凭契约推出，但契约仍依赖 02 解释 12 项语义（含硬规则导语本身）。这与"唯一自包含地基"的宣称不符；且"契约优先变更 / 见 02 §x"造成权威模糊——若 02 与契约在某域名点冲突，读者需自行判断。建议：保留"见 02 §x"作为*溯源注*可接受，但应把"三条硬规则导语"与"可选鉴权配置"这类**行为性**约束下沉进契约（或明确写为"实现细节见 02，以本契约为准"），并把"唯一自包含地基"的措辞收敛为"授权求值自包含"。

---

## 四、方法学提醒（N6 延续）

二审 N6 预警"双门为作者自证、只验存在不验完整"——本轮 N7/N8/N9 **全部**落在该盲区，印证预警成立。建议语义门补两条断言把盲区固化：
1. **401/403 完整性**：每个 `x-authz` 端点须 `$ref` `Unauthorized`（401）；`minRole ∈ {editor,admin}` 端点须声明 403。
2. **02 引用度量**：契约 `info.description` 中"详见/见 02"类引用计数应降至 0（或显式标注"溯源注，以本契约为准"）。

---

## 五、冻结建议

**不建议冻结。** 但本轮与二审有质的区别：二审 N1 是"动摇七端一致的硬伤"，本轮 N7 只是"响应完整性缺口"，N8/N9 为表征统一与措辞收敛。**N1 的核心（授权求值自包含 + 双向闭环）已真清零，这是关键里程碑。**

冻结前应清零：
- **N7（必做，廉价）**：46 个 `x-authz` 端点统一挂 401（建议共享 `Unauthorized` 组件）。
- **N9（建议）**：收敛"无需再读 02 / 唯一自包含"措辞，或将行为性引用下沉。
- **N8（可选）**：`/me/*` 资源端点 `ownerOverride` 表征统一。

完成 N7 后，契约即配得上"授权行为七端一致"的承诺，可作为 M1 动手前的冻结基线。

---

## 六、与历史审阅承接

| 历史项 | 状态 |
|---|---|
| F1 错误码只在散文 | ✅ 已机器化（多轮确认） |
| F2 应急集 33/35 | ⚠️ 不在本审阅范围（内容审阅 TODO） |
| F3 `?status=` 矛盾 | ✅ 已修复 |
| F4 版本错位 | ✅ v1.12 / 契约 1.9.0 全对齐 |
| R1–R11（一审） | ✅ 绝大部分真落地 |
| N1–N6（二审） | ✅ 基本清零（本次独立复验确认，含双向闭环） |
| **N7/N8/N9（本次三审）** | 🔴 新增，N7 建议冻结前清零 |
