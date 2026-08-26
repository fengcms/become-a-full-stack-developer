# M1 Node 后端 · 审阅思考录（REVIEW-LOG）

> 随手记录的审阅判断、权衡、踩坑与"当时为什么这么判"。按批次（轮次）追加，不追求成文结构。
> 目的：让"后面的我"和接手的相关 AI 能直接学到这里的判断逻辑，而不是只看最终审阅结论。
> 配套阅读：`docs/node-backend/DEV-LOG.md`（开发 AI 的开发思考）、本目录 `B0-后端代码审阅报告.md` / `B0-代码审阅-第二轮复审批复.md`（契约审阅在 `docs/review/`）。

---

## 方法学总纲（贯穿所有轮次的核心判断）

> 这一节是整套审阅的"操作系统"。后面每一轮都是它的实例。

### 1. 第一条铁律：不采信自陈
拿到任何"已修复 / 全绿 / 可冻结"的结论，我的默认反应是**先当没修**。理由很简单：声称修复的人，和写修复代码、写校验门禁的是同一个作者。他会下意识地只验证"自己以为要验证的那部分"。所以我的第一动作永远是**独立重跑 + 自写脚本**，绝不只 READ 回复文档。

**结论**：审阅者的价值不在"读报告"，而在"用另一套逻辑重新证伪"。作者自证 = 必要非充分。

### 2. 第二条铁律：门禁全绿 ≠ 没有漏洞
`check_contract.py` / `tsc` / `vitest` / `biome` 这些门禁，验证的是"字段存在 / 语法合法 / 能编译 / 能跑"。它们**验不了"取值是否正确、逻辑是否自洽、响应是否完整"**。本项目里，四轮契约审阅 + 两轮 B0 代码审阅抓出的所有实质缺陷，全部落在门禁的盲区里。这条是 N6 方法学觉醒后我反复用来提醒自己的。

**结论**：门禁是"不会退化"的底线，但审阅要查的是"门看不到的地方"。

### 3. 第三条铁律：判定"真修复"的唯一标准
一条修复是否真实，我只问一个问题：**"一个完全没读过 02 文档、只拿着 OpenAPI 契约（或只拿着代码）的新人，能否确定性地推出正确行为？"**
- 如果契约改了但行为规则仍活在散文、或仍 `详见 02` → 没真修（假修复：只动散文不动契约）。
- 如果代码改了但磁盘真实 diff 没有对应改动 → 没真修。
- 如果门禁加了断言但只验"字段存在"不验"取值相等" → 没真修（N10 就是这么漏掉的）。

### 4. 第四条纪律：给足 credit，不重复计分、不冤枉
每次复检，我都会先列表确认"哪些确实落地了"，哪怕它在我上一轮被标记过。避免因为"上次我说它有问题"就一直算它有问题。信任但要验证。

### 5. 一个贯穿全程的洞察：F1 缺陷族是"洋葱"
内容审阅抓的 F1（错误码只在散文）不是孤立修复点，而是一个缺陷**家族**——"约束没真正机器化，只留在散文"。每一轮审阅都在剥更深的一层：

```
第一层（F1）   错误码只在散文           → 机器化 ErrorCode 枚举
第二层（R1）   角色"谁能调"连声明都没机器化 → 机器化 x-authz 声明
第三层（N1）   角色"满足啥才放行"仍在散文+外置02 → 机器化求值（第4铁律自包含）
第四层（N7）   授权失败时的线协议(401)漏声明  → 46 端点挂 401
第五层（N10）  401 的 code 集合不统一        → 全 $ref 共享组件
第六层（N9-2） 状态转移规则只在散文         → x-allowed-transitions 机器化
```

**结论**：当你修掉一个"只在散文"的缺陷，要立刻问"同类的下一层在哪"。不然它会换件衣服在下一轮回来。

---

## 契约专项审阅 · 第一轮（后端架构师视角）

> 对象：`openapi.v1.yaml` v1.7.0 / 02 文档 v1.8。产品 AI 声称"结构合法、错误码已机器化、可冻结"。

### 1. 看到"双门全绿 + 可冻结"时，我的第一反应是怀疑
不是怀疑他造假，而是怀疑**他验的东西是不是够**。错误码机器化（F1）是真修好了——这点我必须肯定，否则不公平。但"七端一致复用同一份契约"这个标尺，要求的不只是错误码。我决定**自己写穿透脚本**，独立于他的 `check_contract.py`，去扫鉴权矩阵 / 错误码 / 字段约束 / 分页 / 幂等 / ownership。

### 2. 抓到 R1：RBAC 连"声明"都没机器化
这是我第一轮最得意的发现。契约 `securitySchemes` 只有 `bearerAuth`，**0 个 scope**；全文 `scope` 出现 **0 次**。所有 admin/editor 端点一律 `security: [{bearerAuth: []}]`——契约根本表达不了"本端点需 admin 角色"。

更妙的是**直接矛盾**：02 文档 §3.2 自己立了铁律"凡是取值/匹配口径类约束，不允许只写在 description 散文里，散文对代码生成器不可见"。结果文档对最关键的"角色"约束网开一面，只留在散文。这等于自己打自己脸。

**判断**：这不是"漏了"，是"和 F1 同类的系统性缺陷，且更致命——因为它决定谁能干什么"。我把它和 F1 钉死在同一家族。

### 3. R2–R11：系统性地把"约束"从散文往契约推
R3（85 个字符串字段零约束：email 无 format、password 允许 1 位）、R4（上传零大小/类型约束）、R5（全契约 0 处 429，公开端点直面匿名流量无防御）、R6/R7（ownership 与级联语义只在散文）、R8（用户查询边界模糊）、R9（1004/1005 缺 example，且校验门用 description 兜底算落地）……

**思路**：这些不是孤立 bug，是同一类判断——"决定七端是否真一致的约束，还大量停在散文"。我给了清晰分级：R1/R2/R3/R4/R5 阻塞冻结；其余建议或延后。

### 4. 结论
**不可冻结**。一句话总结我写进报告的话："错误码机器化修好了，但'谁能调、字段多长、重复操作怎么办、流量怎么限'这些约束，依然大量停留在散文里——这正是 F1 没修干净的那一半。" 这句话后来成了整个审阅周期的"题眼"。

---

## 契约专项审阅 · 第二轮（复检回复）

> 对象：磁盘真实 yaml v1.8.0 / 00·01·02·README v1.11。产品 AI 回复"11 条全清零、双门 22 断言全绿、可冻结"。

### 1. 我的默认：先当"没修"，但准备被说服
我先重跑双门（OK + 22 全绿属实），再写穿透脚本扫角色分布 / 限流粒度 / 字段约束残留 / 求值逻辑可读性。然后逐条取证。

### 2. 惊喜：R1 真的落地了——而且比声称更扎实
穿透脚本实测：25×member + 14×editor/admin + 7×admin = 46 个需登录端点全声明了 `x-required-roles`；之前误标 admin 的 8 个端点（categories/tags/评论审核/approve）已改 editor/admin。这是真修复，我给了足 credit，不重复计分。

### 3. 但 N1 我咬住不放：声明机器化 ≠ 求值机器化
这是第二轮的核心。契约第 4 铁律原文末尾写着"**详见 02 文档角色边界段**"。`x-required-roles` 只编码了"最小角色"，但完整的授权判定（min-role OR owner-override）只存在于散文，还把判定规则**指向了另一份文档**。

**关键判断**：OpenAPI 单独不足以让七端实现一致的授权行为——Node/Go/M3 必须各自读散文 + 跨读 02 才能落地，必然漂移。这**正是 F1 那一族缺陷在角色维度的完整体现**。"F1 没修干净的那一半"原封未动。我提出了 `x-authz: {minRole, ownerOverride:{param, ownerField}}` 方案，目标是"仅凭 OpenAPI 即可确定性推出每个请求的授权结果"。

### 4. N2/N4：URL 约束分裂，又一处"散文尾巴"
回复 R3 声称给 URL 类加了约束，但脚本实测：`Article.coverImage` / `OAuthCallbackRequest.redirectUri` 仍零约束，而 `logoUrl` 已有 `maxLength:512`——同是 URL，待遇分裂。`x-owner-resource` 只标了参数名，没标"Article 的归属字段是 authorId"。这都是"声明有了，但判定/细节还在散文"的同类残留。

### 5. N6：方法学觉醒
我明确写下了："两道门是产品 AI 为验证自身修复而写，22 条断言与回复逐条对应，只验'字段存在 / 语法合法'，验不了'取值正确 / 逻辑完整'。门通过是必要条件，不是充分条件。本次抓到的 N1/N2/N4 恰恰落在门的结构性盲区里。"——这条后来成了整套方法论的"元规则"。

### 6. 结论
**不可冻结**。N1（授权求值外置）是动摇"七端一致"承诺的硬伤，必须清零。

---

## 契约专项审阅 · 第三轮

> 对象：yaml v1.9.0 / 文档 v1.12。产品 AI 对 N1–N6 的整改回应。

### 1. N1 双向闭环真清零——最大的里程碑
最让我满意的是：第 4 铁律改写成了**自包含**（含层级 / 匿名 / admin 放行 / min-role OR owner / /me 自作用域），并删掉了"详见 02"；同时 02 文档第 103 行反向引用"求值算法以 OpenAPI 第 4 铁律为唯一权威……歧义以契约为准"。**契约自包含 + 02 反向引用**双向闭环都落实了。这是本轮最大的进步，我明确肯定。

### 2. 但 N7 冒出来：16 个 member 端点缺 401
脚本逐端点扫描 46 个 `x-authz` 端点：声明 401 的 7 个、声明 403 的 23 个、**既无 401 也无 403 的 16 个（全为 minRole:member）**。

**洞察**：editor/admin 受限端点（最该有 403 的）已全部声明 403，说明作者**选择性**补了高角色端点，却漏了 member 端点。这恰恰是"门只验存在、不验完整性"的盲区——门验的是"有端点声明了 401/403 吗"，不是"每个该有的端点都声明了吗"。

**判断**：严格 OpenAPI linter（Spectral `operation-4xx-response`）会对这 16 个全部报错。修复极廉价：定义共享 `Unauthorized` 组件并在 46 端点 `$ref`。

### 3. N8/N9：表征不统一 + "自包含"言过其实
- N8：`/me/*` 一部分资源端点显式声明 `ownerOverride`，另一部分只靠前缀约定——契约层面没锁死，与"约束机器化、不靠约定"的 §3.2 自相矛盾。
- N9：回复称"无需再读 02"，但契约仍向 02 借了 12 处定义（含硬规则导语）。授权*结果*可凭契约推出，但"唯一自包含"的措辞言过其实。

### 4. 结论
**不建议冻结**，但与二审有质的区别：二审 N1 是"动摇七端的硬伤"，本轮 N7 只是"响应完整性缺口"。N1 核心已真清零。

---

## 契约专项审阅 · 第四轮 + 终评结案

> 对象：yaml v1.10.0 / 文档 v1.13。产品 AI 对 N7/N8/N9 的回应。

### 1. 本轮最大的不同：没有假修复
前几轮都抓出过"只动散文不动契约"的假修复。这一轮我脚本逐条核验：46 端点 401 全覆盖、3 个子资源端点 ownerOverride 真实落地、行为性 02 引用已收敛。**授权这一脉（N1+N7+N8）已彻底斩断 F1 那一族的缺陷。** 这是我判断"可以结案"的最强信号——不是因为他说可冻结，而是因为复验没有再发现假修复。

### 2. 但我仍没放过 N10 和 N9 尾
- **N10（low）**：作者脚本 N7c 仅 NOTE"风格不一致"就放过，未验 `code` 集合相等。穿透脚本证实：共享 `Unauthorized` 组件 `code ∈ {1002,1004}`，但 7 个内联 401（like/favorites/notifications 系列）的 `code` **全是 `{1002}`**，缺 `1004`。对"未携带令牌"这一最常见场景，这 7 个端点在契约里没有 1004 示例。既然 N7 的目标是"线协议完全统一"，应一并清零。
- **N9 尾（low）**：全文仍有 23 处指向 02，其中 3 处是行为约束未机器化（状态转移矩阵 §2.3 / 树环检测 §2.2 / 阅读去重 §3.3）。

**判断**：这些都不构成冻结硬伤，但应登记 TODO（尤其 N9-2：状态转移矩阵下沉为 `Article.status.x-allowed-transitions`）。

### 3. 裁决：可冻结，作为 M1 基线
我写下终评："针对第四轮回复的独立复验全部通过、无假修复、无新引入高危缺陷。决定七端一致性的核心约束（授权求值 N1 / 401·403 线协议 N7 / ownerOverride 表征 N8 / 状态机 N9-2 / 错误码 F1 / 字段约束 N2 / 限流粒度 N5）已全部机器化且可机器校验。评审正式终结，契约作为 M1 动手前的冻结基线。"

### 4. 顺带排掉一个存疑叙事
回复 §2 称"脚本空白行误断操作块导致漏挂 401"。但现 `check_contract.py` 用 `yaml.safe_load` + dict 遍历，根本不存在空行截断问题——疑为旧版文本解析残留叙事。不影响 N7 有效性（我的独立穿透脚本已确认 46 端点全覆盖）。**教训**：连"修复说明"本身也可能含过时叙事，不能被其带偏。

---

## B0 后端代码审阅 · 第一轮

> 对象：`node-backend/` B0 工程基座代码 + 开发 AI 回复 `B0-NOTES.md`。方法平移：不采信自陈，独立跑三道门禁 + 通读全部 21 源码文件 + 逐条交叉比对契约错误码/HTTP 映射。

### 1. 同样的方法论，从契约平移到代码
契约冻结了，但代码是另一回事。开发 AI 自陈"tsc/biome/vitest 全绿 + 契约一致性 ✅"。我照例先独立复验门禁——**三道门禁他没吹牛**（tsc 0 错、vitest 3/3、biome 24 文件 0 问题，全部属实）。

### 2. 但"契约一致性 ✅"这一项，我直接标了 ❌
这是我 B0 审阅抓到的 P0。代码侧：`codes.ts:62` `HttpForCode[VALIDATION] = 422`、`validate.ts:20` `failResponse(ErrCode.VALIDATION, 422, ...)`。契约侧：全文检索 `'422'` **出现 0 次**，9 个 `4001` 响应的 HTTP 状态**全部为 400**。

**判断**：这是地基级确定性契约违反。`VALIDATION` 是地基常量，`validate.ts` 的 `v.json/query/param` 会被**全部 67 端点**复用。上线后 9 个校验响应（register/articles/upload/change-password…）全返 422，而契约和前端约定的是 400。前端状态码断言全失败，M6-09 对照测试也分歧。

**教训（和契约审阅 N6 同源）**：涉及契约一致性的项目，"门禁全绿"只验"能编译/能跑/格式对"，验不了"逻辑/契约对不对"。这道 422 被三道门禁全放过，却与契约相悖。

### 3. B02–B06：双部署 / 竞态 / 路径遍历 / CORS / 密钥
- **B02（双部署断裂）**：`app.ts:34` 顶层 `export const app = createApp(readEnv(process.env))`。`worker.ts` 导入即触发 `readEnv(process.env)`；CF Workers 不保证 `process.env` 且 `wrangler.toml` 缺 `nodejs_compat` → 模块加载即崩，违背"一套代码双部署"承诺。
- **B03（竞态）**：`index.ts:14` `migrate(db);` 未 await，async 建表与 serve 竞态 + 未捕获 rejection。
- **B04（路径遍历）**：`storage.ts` `get/delete` 用 `join(root, key)` 未净化 key，B5 接线前必改。
- **B05（CORS 误配）**：`cors.ts:17` 生产回退 `origin:'*'` + `credentials:true`（浏览器拒凭据请求反模式）；`wrangler.toml` 还写 `CORS_ORIGINS="*"`。
- **B06（密钥泄露）**：根 `.gitignore` 漏 `.env`/`uploads/`/`data/` → 真实 JWT_SECRET 有泄露风险。

### 4. 给 credit：地基架构本身是合格的
这点必须说清，否则对开发 AI 不公平。分层清晰、错误模型用心（双层码 + 编译期漏配报错）、`guard(minRole, resolveOwner?)` 正确实现第 4 铁律 OR 语义、lib 层零框架依赖、类型纪律到位（strict + noUncheckedIndexedAccess + 禁 any）、JWT 显式 HS256 防 alg 混淆。我单独列了"已确认的良好实践"一节。

### 5. 结论
**B0 不可直接进入 B1**。需清零 1 P0（B01）+ 4 P1（B02–B06，其中 B01/B02/B03 极小改动）。其余 B07–B11 为 P2 顺延。

---

## B0 后端代码审阅 · 第二轮复批

> 对象：开发 AI 对首轮 B0 报告的处置回复。方法：不采信自陈，重跑门禁 + 通读 21 源码文件真实 diff + 交叉比对契约 + 排查新引入缺陷。

### 1. 不采信"已清零"，逐条比对磁盘 diff
我把 B01–B11 每条声称的修复点，都去磁盘真实代码里找 `file:line` 证据：
- B01：`codes.ts:62` `VALIDATION: 400`、`validate.ts:20` 400（原 422）→ ✅ 真修复。
- B02：`app.ts` 仅留 `createApp` 工厂，`worker.ts` 由 `createApp(appEnv)` 在 `fetch` 内构造（顶层不触发 process.env）→ ✅ 真修复，双部署断裂修复。
- B03：`index.ts:17` `await migrate(db)` → ✅。
- B04：`storage.ts:27` `SAFE_KEY=/^[A-Za-z0-9._-]+$/` + `resolveKey` 路径净化 → ✅。
- B05：`cors.ts` 重写（dev `*`+无凭据 / 非 dev 白名单+凭据 / 空拒绝）；`wrangler.toml` 改真实白名单 → ✅。
- B06：根 `.gitignore` 补 `.env`/`uploads/`/`data/`/`*.db` → ✅。
- B07–B11：4 个地基单测文件真存在（17/17）；`migrate.ts`/`auth.ts` 注释；`jwt.ts` 收敛 `Role` 字面量联合 → ✅。

**结论：11 项全部真清零，无"只动散文不动代码"的假修复。**

### 2. 意外收获：开发 AI 自己的契约一致性测试抓到 2 个我们都漏的缺陷
借新增的 `test/contract/error-codes.test.ts`（**真解析 yaml**，遍历每个响应的 `code→HTTP` 断言与 `HttpForCode` 一致），开发 AI 主动揪出并修复了 2 个此前人工审阅与双门禁都漏掉的缺陷：
1. **契约自身缺陷（改契约）**：`POST /auth/{provider}/callback` 的 `501` 占位响应 `example.code` 误写 `5000`（应为 500）→ 改契约 `501→500`。
2. **本方代码缺陷（改代码）**：`ACCOUNT_DISABLED`(1005) 原误映射 `403`，契约明文"禁用登录/刷新返回 401/1005（不返 403 以免暴露账号存在性）" → 改 `codes.ts` 1005→401。

**关键价值**：这两个缺陷方向相反——一个改契约、一个改代码——恰好说明"以契约为准"要在契约*自洽*前提下才有意义。更重要的是，它把 B01 类回归前移到了测试门禁，质级跃升。这印证了我 N6 的预警：**让作者写"脚本化比对契约"的门禁，比人工审阅更稳**。我作为审阅者该做的，是逼出这道门禁，而不是每次手动查。

### 3. 新引入缺陷排查：修 A 坏 B？
针对最易"修 A 坏 B"的三处（双部署 / 路径净化 / CORS）专项排查，均干净。另 grep `../` 于 `src/`/`test/` 仅命中 2 处且非 import 引用（注释示例 + 测试内 `import.meta.url` 定位契约），说明全仓 `@/` 别名化没破坏引用。

### 4. 非阻塞观察（4 项低危，不阻 B1）
`wrangler.toml` 缺 `nodejs_compat`（B5 接 storage 的 node:fs 时暴露）；`worker.ts` 每请求重建 app（轻微）；`error-codes.test.ts` 相对路径依赖目录深度；`protected-ping` 占位路由 B1 替换。均登记，不阻塞。

### 5. 结论：放行 B1
第一轮 11 项全部确证清零；2 个新缺陷均真修复且方向正确；三道代码门禁 + 契约双门我独立复跑全绿；本轮未引入高危/中危新缺陷。B0 作为工程基座，已具备向 B1 铺开的稳定地基。

---

## B1 后端代码审阅 · 第二轮复批（复检开发者调整）

> 对象：开发者对 B1 报告 4 项 P2 观察的处置回复 `B1-代码审阅-回复.md`。方法平移：不采信自陈，独立复跑代码三道门禁 + 契约双门禁，逐条回磁盘取证 file:line。
> 注：本轮起，每次审阅的思考都会自动写入本 LOG（不再需用户额外提醒）。

### 1. 首轮 B1 是"最干净的一批"——但这一轮我反而更警惕 P2 的伪装
B1 首轮无 P0/P1，只有 4 项 P2。开发者声称 P2-1/P2-2/P2-3 全闭环、P2-4 保留。P2 看似"小"，恰恰是**假修复最容易伪装成真修复**的温床：
- P2-1 可以"包了 try/catch 但 catch 里又 `throw err`（等于没兜）"，或 `isUniqueConstraintError` 只识别一个根本不会出现的码；
- P2-2 可以"改了描述但没复跑契约双门"，埋下回归；
- P2-3 可以"只改了某一处注释、另一处还 stale"。

所以我的第一反应仍是：**先当没修，逐条去磁盘找 file:line 证据。**

### 2. P2-1 验证：db-error.ts + register try/catch —— 真修复，且方向正确
读 `src/lib/db-error.ts` 全量：`isUniqueConstraintError(err)` 用 `as { code?: unknown }` 结构化判定，**零 any**，识别 `SQLITE_CONSTRAINT_UNIQUE` + `SQLITE_CONSTRAINT` 父码兜底。这是抽出来的**可复用工具**，不是内联字符串嗅探——给 credit。

读 `src/routes/auth.ts:84-103`：insert 真被 try/catch 包住，命中唯一约束 → `throw new AppError(ErrCode.CONFLICT, 409)`（3002），其余错误原样 `throw err`。**关键设计判断**：原"查重快速路径"（`dup.length>0 → 409`）保留为常见路径，新增 catch 只兜底并发竞态（TOCTOU）。这比"把查重删了全靠异常"更稳——常见路径不走异常开销。方向正确。

**两个微小观察（P3，非阻塞，不要求改）**：
- 匹配略宽：把父码 `SQLITE_CONSTRAINT`（含 NOT NULL/外键）也当唯一冲突。register 路径实际只会命中 username/email 唯一约束，风险极小；要更精确可只留 `SQLITE_CONSTRAINT_UNIQUE`。
- catch 兜底分支极难单测确定性触发（并发竞态）。但 `isUniqueConstraintError` 这个**纯函数**本身是确定可测的——喂一个合成 `SqliteError({code:'SQLITE_CONSTRAINT_UNIQUE'})` 即可断言。这是低成本、能锁定工具语义的测试，顺手可加。

### 3. P2-2 验证：契约散文 1003→1004 —— 真改，但"动了冻结契约"触发我的红线
读 `openapi.v1.yaml:864`：描述已是"两者皆无 → 401 / code **1004**（令牌缺失）"。与 401 examples、Unauthorized 组件、auth.ts:146 抛 1004 **四方对齐**，确证真改。

**但 P2-2 动了冻结契约——这正是我 N6/门禁红线的核心场景**。开发者自陈"双门零回归"，我不采信，自己跑：
- 结构门 `openapi-spec-validator` → `docs/api/openapi.v1.yaml: OK`
- 语义门 `check_contract.py` → 全部断言通过（含"内联 401 的 code 集合与共享 Unauthorized(1002/1004) 一致，无 N10 回归"）

**判断**：纯散文修订本不该动契约，但既然动了，独立复跑双门是底线动作。零回归证讫，放行。这条再次印证总纲第 3 条——判定真修复只看"新人能否确定性推出正确行为"，而契约改动必须用双门门禁兜底回归。

### 4. P2-3 + 额外注释：真改，且开发者有"完美"自觉
- `auth-flow.test.ts:146` 注释已改为"500 占位（B0 已将契约 501 修正为 500，code 5000）"——与断言一致。
- 额外发现 `auth.ts:175` 头部 callback 注释也 stale（首轮报告没点名），开发者**主动**一并改成 500 口径。这是"完美"自觉，给 credit。

### 5. P2-4 保留：与首轮判定一致，不重复计分
开发者维持 `/me` 二次查库现状，理由（取最新资料 + 防御性 404）与首轮"非缺陷"判定完全吻合。复批不重复计分——总纲第 4 条"给足 credit、不冤枉"的实例。

### 6. 门禁独立复验
- tsc 0 错；biome **35 文件**（比首轮 34 多 1，因新增 `db-error.ts`，自洽）；vitest **33/33** 全绿。
- 契约双门：结构 OK + 语义全过。

### 7. 结论：B1 全量闭环，放行 B2
3 项 P2 全真修复（含契约改动零回归）+ 1 项 P2-4 维持非缺陷判定；**本轮无任何假修复**；未引入新缺陷。**"无假修复"即放行信号**——与契约专项第四轮同构。B1 批次完整交付，正式进入 B2 文章（11 端点）。

---

## B2 后端代码审阅（文章核心批次，11 端点）

> 对象：`node-backend/` B2 文章批次（routes/articles*.ts / lib/article.ts / lib/pagination.ts / db schema+migrate）+ 开发 AI 交付 `B2-NOTES.md`。用户额外要求：对照其《BE11 通用列表查询 DSL》文章给调整建议。方法平移：不采信自陈，独立跑门禁 + 通读源码 + 逐端点比对契约 + 对照 DSL 文章。

### 1. 这一轮开局就警觉：51 测试全绿，但"门禁全绿 ≠ 没缺陷"是铁律
B2 门禁自陈 tsc 0 / biome 42 / vitest 51，我独立复跑**全绿**。但 B0/B1 反复证明：门禁验"能编译/能跑/字段对"，验不了"并发与边界时刻行为是否正确"。所以我拿到全绿的第一反应是：**去找门禁结构性盲区里的问题**——尤其是"带状态/带时间的端点"。

### 2. P1 的抓取：把"24h 冷却"和"唯一约束"两件事实叠在一起看
- 事实 A（`schema.ts:117`）：`article_view_dedup` 唯一约束 `(article_id, dedup_key)` 是**永久**的。
- 事实 B（`articles.ts:308-330`）：冷却只在应用层——`recent = createdAt >= now-24h`，未命中才 insert，且 insert **无 try/catch**。
- 把 A+B 叠加推演：T0 首 view 插入成功；T0+25h 冷却过期 → `recent` 查不到旧记录 → 再插 → 撞永久唯一 → 抛 SqliteError → 无 catch → 500。
- **关键判断**：这不是"偶发"，是"任何 24h 内看过一次的读者再次访问"必然 500。对真实博客，`/view` 是最高频端点之一，等于核心功能在生产崩坏。定为 **P1 功能级缺陷，必须修**。

**为什么门禁和测试都漏了**：测试（`articles.test.ts:216`）只在同一次测试内连续两次 view（毫秒级、库全新），既没模拟"24h 后"也没测并发。这再次印证 N6——**测试覆盖的是作者以为要验的，不是边界**。修复必须配套"24h 后重访仍 200""并发同键不 500"两条测试。

**修复方向**（最小且正确）：把 24h 冷却**编码进 dedupKey 的时间桶**（`bucket = floor(now/24h)`，`dedupKey = base + '#' + bucket`），让唯一约束"按窗口"而非"永久"；并对同窗口并发撞唯一用 `isUniqueConstraintError` 兜底跳过增量。复用 B1 的 `isUniqueConstraintError`，正好体现跨批次工具复用。

### 3. P2 排序白名单 bug：白名单"方向前缀"没剥离
`pagination.ts:27` `sort in SORT_COLUMNS`——`SORT_COLUMNS` 键是裸字段名，但 `sort` 带 `-` 前缀。结果 `sort=-viewCount` 被判"不在白名单"→ 静默回退默认排序。白名单思想对，但**实现漏了剥离方向前缀**，导致"降序 + 非默认字段"的请求全失效。2 行修复。这类 bug 不崩但悄悄错——和"门禁盲区"同族。

### 4. 对照用户 BE11 文章：哪些做对了（给 credit），哪些有偏差
用户文章核心是"白名单 DSL + 解析/执行分离 + 数量护栏（MAX_SIZE / scanLimit）+ 投影 + base 永远 AND"。逐条比对 B2：
- **做对且值得肯定**：base 永远 AND 软删（`article.ts:126` `isNull(deletedAt)` 起手）✅；pageSize 封顶 100 ✅；sort 白名单（注入安全）✅；过滤值全 Drizzle 参数化 ✅；列表逻辑集中在 `lib/article.ts` 收口（解析/执行分离雏形）✅。
- **偏差 1（P2，DB-01）**：缺 scanLimit。用户文章把"q 搜索别直接 count"标为**头号性能护栏**（Q_SCAN_LIMIT=2000）。B2 的 `keyword` 存在时 `count(*)` 仍对 `LIKE '%kw%'` 全表扫。这是用户文章最强调的点，必须给建议。
- **偏差 2（P2/P3，投影）**：列表 `.select()` 取全部列含 `content` 大文本再丢弃，违背文章"只取指定列"主张。热点列表性能浪费。
- **明确判断"不必上通用 `field__op` DSL"**：文章场景是二三十个内部后台列表。本项目公开文章 API 只有 4 个固定过滤维度，用固定白名单参数**比通用 DSL 更合适**——避免过度下沉，契合"代码是素材"克制原则。但建议：若后续 B3+ 后台列表（用户/评论/订单）增多，再抽 `buildListQuery/runList` 通用层复用。这条判断很重要——**不是文章所有主张都要照搬，要按本项目规模裁剪**，否则 Review 变成教条。

### 5. 判定与给用户的 credit/建议分寸
- B2 骨架扎实（11 端点契约合规、N9-2 矩阵对齐、可见性铁律正确），但 P1 是放行硬伤 → **裁定不通过，退回修 P1 + 建议 P2 后复批**。
- 给开发 AI 的 credit 单列（base AND / 封顶 / 白名单 / 门禁纪律），避免冤枉；同时把 DSL 偏差作为"建设性建议"而非"缺陷"，因为它是 MVP 可接受的设计选择，不是错误。
- 用户的 DSL 文章价值：本批审阅**因这篇文章才盯上 scanLimit 和投影两处**——否则只看契约合规性，这两处"能跑通"会被放过。这正是用户喊"这篇文章有用"的判准：它提供了契约之外的"性能/工程护栏"视角。

---

## B2 后端代码审阅 · 第二轮复批（文章批次修复验收）

> 对象：开发者对 B2 首轮"不通过"的修复（P1 时间桶 + P2-1 排序 + P2 scanLimit + P2 投影），交付 `B2-代码审阅-复审批复.md`。方法不变：不采信自陈，逐条回磁盘取证。

### 1. 复批心态：没有"他说修好了"这回事，只有"我证伪失败"
拿到开发者回复的第一反应不是"看他说了什么"，而是**直接读代码**。本轮四个修复点我全部回到磁盘 `file:line` 复核，没有一条仅凭回复文档判定。这是总纲"不采信自陈"的硬执行——尤其 B0 那次抓到过 `422→400` 假修复，已经把"看回复就信"的代价刻进流程里。

### 2. P1 复批的关键：验证"根除路径"而非"改了"
开发者把冷却编码进 `dedupKey` 时间桶（`articles.ts:311-312`），我重点验证了三件事：
- **旧路径是否真移除**：`recent` 查询从 `gte(createdAt, now-24h)` 改成 `eq(dedupKey, dedupKey)`（`:317`），确认不再依赖应用层时间范围判断——这是根除而非"加个补丁"。
- **写语句是否真有兜底**：insert 包进 `try/catch`（`:321-340`），`isUniqueConstraintError` 兜底返回 200。确认并发撞唯一不再 500。
- **测试是否真命中盲区**：新增的"24h 后重访"用例不是简单再调一次，而是**直插旧桶 dedup 记录**（`bucket-1, createdAt-25h`）模拟冷却过期——这正是首轮"测试只测同一次内连续两次"的盲区补位。看到这个测试写法，我心里"真修复"的把握就从 80% 升到 95%。

### 3. 三个 P2 是真修复，且确认"方向对"
- P2-1 排序：`:28` 先 `slice(1)` 剥 `-` 再查白名单，2 行，白名单主张完整落地。
- P2 scanLimit：`:194-201` 仅 keyword 分支套 `SCAN_LIMIT=2000`，非 keyword 走 `count(*)`，护栏边界正确。
- P2 投影：`:73-92` 新增 `ArticleSummaryRow` 类型收窄，列表 `select` 仅 16 摘要列，`toArticle` 详情仍加回 `content`（`:115-118`）——确认详情功能未被误伤。
三处均"改对了地方、没动无关代码"，属于干净修复。

### 4. 本轮新增的一个 P3 观察：dedup 表无上限增长
改用时间桶后，每 `(文章, 访客键, 24h 桶)` 各一行且永久留存（schema 唯一约束无 TTL）。对博客 MVP 可接受，但属真实运维债。我把它标为**非阻塞 P3 善意提示**，明确"不要求本批处理、不阻放行"——分寸很重要：发现新问题要讲，但不能拿它当放行筹码，否则判定标准就乱了。

### 5. 结论：B2 全量闭环，放行 B3
四修复点全真修复 + 零回归 + **无假修复** + 门禁三道全绿 + 契约结构门 OK + 未引入新缺陷 → **裁定放行 B3**。`"无假修复即放行信号"`再次应验（与 B1 第二轮、契约专项第四轮同构）。

**这轮最重要的元认知**：复批不是"找茬续集"，而是"证伪复验"。当一轮复批找不到假修复、且每条修复都能在磁盘上确定性验证时，继续纠缠就是低效——该放行就放行。信任但要验证，验证通过就给 credit。

---

## B3 后端代码审阅 · 分类 / 标签批次（首轮）

### 1. 先抓"授权张力点"——文档打架时以机器字段为唯一权威
- 任务规格 `03-categories-tags.md` 写「分类写 = admin」，但 `B3-NOTES` 写「分类写 = editor，取契约 `x-authz.minRole`」。两处不一致，必须裁决。
- **我的硬规则**：多份文档冲突时，**冻结契约的机器字段（`x-authz.minRole`）是唯一权威**，散文（任务规格、NOTES 示例措辞）一律降权。于是直接 grep 契约——6 个写端点的 `x-authz.minRole` 全为 `editor`（行 1478/1535/1611/1713/1767/1840），`x-cascade` 为 `none`。**判开发 AI 取 editor 正确，任务规格的 "admin" 是过时散文。**
- ⚠️ 顺带纠一个 NOTES 表述瑕疵：`B3-NOTES` 说"不采信契约示例散文里的'非 admin'措辞"——这说法**倒果为因**。契约 403 示例只是 prose，真正权威是 `x-authz.minRole=editor`；真正过时的那份是**任务规格文档**写 "admin"。记录为 P3-1，免得后续批次被这句表述带偏。

### 2. 门禁分跑，避免 OOM（吸取 B2 复批教训）
- B2 复批那次三道门禁串在一个命令里被沙箱 137 杀掉。本轮**拆成 tsc / biome / vitest 三次独立 Bash 调用**，外加 `git diff --name-only HEAD~1 HEAD` 先确认 B3 没碰 `openapi.v1.yaml`（不采信"未改契约"自陈）。结果：tsc0 / biome50 / vitest68（B3 新增 14）全绿，契约零回归。

### 3. P2-1：深度约束的"移动带子孙"缺口——NOTES 过度声称覆盖
- 契约 `Category.x-max-depth:4` 真声明（行 346）。代码 `depthOf(newParent)+1 ≤ 4` 在**新建**路径正确，测试「深度>4→409」覆盖。
- 但 `PUT` 变更 parentId 只校验**被移动节点自身**的新深度，**没算其子孙子树高度**。推演：建 `A(深3)→B(深4)`，再把 `A` 挂到另一深3节点下 → `A` 变深4、`B` 变深5，违反契约。
- **关键判断**：`B3-NOTES` 第 3 节称"既覆盖新建过深，也覆盖把某节点挂到深节点下使其超界"。后者对**被移动节点**成立、对**其子孙**不成立——这是"交付说明过度声称覆盖"，与"假修复"同源：都是作者自陈 > 磁盘事实。即便不是恶意，审阅者也要戳破。**判 P2，建议随 B4 修 + 补「移动带子孙使子孙超界→409」测试**，不阻放行（边缘 + 默认建树不触发）。

### 4. 给开发 AI 的 credit（这次地道的）
- 树/环检测/深度/删除守卫四大逻辑全抽进纯函数 `lib/category.ts`，零 DB 耦合、易单测；
- `Tag.articleCount` 用 `article_tags` 关联表精确聚合，**真落地了 B2 P3 的修复建议**，根除子串误匹配；
- `isUniqueConstraintError` 跨 B1→B3 复用，并发 slug 冲突统一收敛 409；
- `categories.ts`（原 235 行）主动拆 read(75)+write(192≤200)，`slug.ts` 抽共享约束——200 行铁律被当回事。

### 5. 回复开发 AI 的提问：articles.ts 358 行越 200，是否 retrofit？
- **裁定：B3 不 retrofit，挂账 B4（或单独 refactor commit）。**
- 推理链：①`articles.ts` 属已放行批次，功能正确、54 条测试全绿——越 200 行是**卫生指标非正确性缺陷**；②在 B3 评审里 retrofit 已发布代码，违反"一个批次=一个关注点"，且给放行代码引入回归风险，不划算；③**自然接缝在 B4**：文章提交增强必然改 `articles.ts` 的 create/update，届时借同一改动拆 `articles-read.ts`+`articles-write.ts`，用现有 54 条测试兜底。一句话回开发 AI："已放行的这次别动，等 B4 碰它时一并拆。"

### 6. 结论：B3 通过，放行 B4
11 端点全合规 + 四大领域逻辑真落地 + 门禁全绿 + 契约零回归 + 无假修复 → **放行 B4**。`articles.ts` 拆分作为技术债挂账，不阻本批。

---

## 架构裁定 · B4 范围冲突 与 article_tags 回填缺口（2026-08-25，审阅后澄清）

### 0. 背景：开发 AI 在开工前举手问"B4 走哪条"
- 我 B3 审阅 §七 写的是「放行 B4（文章提交增强 / article_tags 回填，11 端点）」，且说 B4 会改 `articles.ts` 的 create/update 并顺手拆它。
- 但编号批次包 `docs/prd/m1-tasks/04-comments.md` 把 B4 定义为「评论（comments），5 端点」，且评论不碰 `articles.ts`。
- 两者指向完全不同的实现，开发 AI 不敢选边，向我（架构师）确认。

### 1. 先认错：是我 B3 §七 误挂了范围
- **批次编号是范围契约，无歧义**：`00 scaffold → 01 auth → 02 articles → 03 categories-tags → 04 comments → 05 users-upload → 06 favorites → 07 aux`。`04-comments.md` 第一行就是「M1 后端 · 批次 B4：评论（Comments）」，端点清单 5 个、依赖 B1/B2。
- 开发 AI 选「B 按编号」是对的；我 §七 把"article_tags 回填"这个**待办**错当成 B4 的**范围**，还写了"11 端点"（文章提交增强根本不是 11 端点）——属于没核对编号批次包就下笔。
- **元认知教训**：审阅里提到"下一步该做 X"时，必须回编号批次包确认 X 是不是下一棒的 scope，不能凭印象顺手挂。批次文件名即范围契约。

### 2. 但"回填"不是我瞎想——它是个真实缺口（磁盘取证）
`grep` 全代码 `articleTags` 引用结论：
- `article_tags` 表已在 B3 建好（`schema.ts:181` + `migrate.ts:93`），但**全代码无任何 INSERT** → 死表。
- `tag.ts:8-9` 开发 AI 自陈："回填入口属文章提交逻辑、B3 禁止项不在此实现，故 junction 恒为空、articleCount 恒为 0"。
- 文章列表标签过滤 `article.ts:158-159` **至今仍用 B2 的 `articles.tags LIKE '%"tag"%'`**，没切到关联表。
- 后果（真缺陷，非洁癖）：① 标签云 `articleCount` 恒 0（可见错误）；② `tags.ts:100` 删除守卫用空表判"有无引用"→ **仍可删被文章引用的标签**（数据不一致）；③ B2 P3 子串误匹配仍在。
- 即：这张表目前除了让 articleCount 永远为 0，毫无用处。我 §七 想指的就是它，只是挂错了批次。

### 3. 裁定：选 C 并 refined —— 插入专门回填批次，B4 严格 = 评论
- **B4 = 评论（04-comments.md），不碰 `articles.ts`**。混进文章写逻辑会破坏"单批次单关注点"纪律（B0–B3 一直靠它稳）。
- 在 B4 之前插入**专门的 `article_tags` 回填批次**（可叫 B3.5 / `tags-sync`），它就是"文章提交增强"该待的地方：
  | 项 | 内容 | 必要性 |
  |---|---|---|
  | 1 | article `create/update` 同步写 `article_tags`（增则插、减则删） | 必须 |
  | 2 | 一次性回填存量文章（`parse(articles.tags)` → 插 `article_tags`） | 必须（否则 articleCount 仍 0） |
  | 3 | 列表标签过滤从 `articles.tags LIKE` 切 `article_tags JOIN` | 强烈建议（让表真正有用 + 关掉 B2 P3） |
  | 4 | 借改 `articles.ts` 契机拆 `articles-read.ts`+`articles-write.ts` | 建议（还 358 行欠债，上次挂账的） |
- 为什么不能拖后：B5/B6/B7 都不自然碰文章写逻辑 → 表会永远空。
- **B3 P2-1（移动带子孙超 `x-max-depth:4`）修复**：B4 不碰分类，请开发 AI 在回填批次**之前单独发一个小 commit** 收掉（`categories-write.ts`，与 articles 改动无关）。

### 4. 给用户的回复要点（已草拟直发开发 AI）
- 认错：§七 的 B4 范围描述有误，以编号批次包为准，B4 = 评论。
- B4 严格按 `04-comments.md`，不要碰 `articles.ts`。
- 先做一个专门的 `article_tags` 回填批次（见上 4 项），再开 B4。
- B3 P2-1 单独小 commit 先收。

---

## B3.5 后端代码审阅 · article_tags 回填 / 过滤精确化 / 拆分（首轮即放行）

### 1. 背景：这是我上一轮亲手写的任务包，开发 AI 照做
- 上一轮（架构裁定 B4 冲突）我认错后，亲自写了 `docs/prd/m1-tasks/03.5-article-tags-backfill.md` 作为 B3.5 施工依据，并登记进 M1 顶层计划。
- 开发 AI 据此完工，commit `43c51c3` + 交付 `B3.5-NOTES.md`。它还把 B3 P2-1 修复单独收在 `2cee68b`（符合我"独立小 commit"要求）。
- **关键纪律**：即便任务包是我写的，审阅仍"不采信自陈"——不能因为"我写的规格、他照做了"就跳过取证，恰恰要验证他没在落地时偷工（如只建同步漏了回填、或过滤切了 JOIN 但计数还走 LIKE）。

### 2. 三个真缺口是否被钉死——逐条回磁盘
我前两轮（B2 P3 / B3 守卫）指出的三个缺口，本轮是它们的"应兑现"验收点，必须全部看见确定性证据：
- **死表 → 生效**：`article-tags.ts:38 syncArticleTags` 真写、`article-mutation.ts:142/179` 创建/更新真调用、`backfillArticleTags`（脚本+单测共用核心）真可重跑。✅
- **B2 P3 子串误匹配**：`article.ts:173-184` 改 JOIN + 无对应 catalog 返空；`pagination.ts:14-18` 排序列全加 `articles.` 限定根除 JOIN 后 `ambiguous column`。✅
- **B3 删除守卫失效**：`tags.ts:98-106` 删前查 `article_tags WHERE tag_id=?` 非空→3002。✅（此前死表恒空导致守卫形同虚设）

三个缺口**一处不漏、且都不是"加补丁"式修复**——同步/回填/过滤是同一张表的正交三种用法，逻辑内聚在 `lib/article-tags.ts` / `lib/article-backfill.ts`，无分叉。

### 3. 计数正确性论证（门禁抓不到，必须手推）
JOIN 后最易藏的雷是**重复计数**：若 `uniq_article_tag` 不唯一，`innerJoin` 会把一篇文章乘成多行，`count(*)` 就偏大。
- 论证：`uniq_article_tag ON (article_id, tag_id)`（`schema.ts:193` + `migrate.ts:101`）保证每 (文章,标签) 至多 1 行；过滤单标签时每篇文章最多贡献 1 行 → `count(*)` 计的是文章数。✅
- `article.ts:210/223/228` 三处查询（列表 / keyword 计数 / 非 keyword 计数）**都在 `q.tag` 时加 JOIN**，where 一致，无"列表 JOIN 但计数不 JOIN"的错位。

### 4. 200 行铁律：债主清了，但 lib 层留了个 252 行的"合规例外"
- 原债主 `articles.ts` 路由 358 行 → 拆 `articles-read.ts`(123)+`articles-write.ts`(147)，**均 ≤200**，200 行铁律在路由层清零。✅
- 但 `lib/article.ts` 现 252 行（序列化+slug黑名单+状态机+列表查询四类），略超软上限。开发 AI 按纪律注释说明特殊情况。
- **我的判定**：200 行铁律的本意是"避免单文件不可维护"，原痛点就是那 358 行路由；lib 层 252 且例外已文档化，裁定**合规**。仅善意提示：若再涨，优先把 `queryArticles` 抽 `article-query.ts`。不当作缺陷。

### 5. 一个重要分寸：回填是"部署后人工跑一次"，不是代码缺陷
- NOTES 显式选择"不在启动期调用、部署后由人跑一次"，并附 D1 `wrangler d1 execute` SQL。这是合理选择（避免冷启动每次扫全表）。
- **但它是运维动作，不是自动的**：若不发版时没人跑 `pnpm backfill`，线上 articleCount 在存量文章被新文章"盖掉"前仍偏 0（新文章已实时同步）。标为 P3 运维提醒：**部署 checklist 加一条首次回填**，非代码缺陷、不阻放行。

### 6. 结论：B3.5 全量闭环，放行 B4（评论）
- 门禁独立复验全绿：tsc0 / biome57文件 / vitest**78**（含 B3.5 新增 10，既有 article/category/tag 无回归）/ 契约未改零回归。
- **无任何假修复**；三个历史缺口全部钉死；B3 P2-1 在独立 commit 收尾。
- `"无假修复即放行信号"` 第三次应验（B1 二轮、B2 二轮、B3.5 首轮同构）。**这轮最重要的元认知**：当任务包由我亲自写、开发 AI 严格照做、且每条缺口都有确定性证据时，不必硬找茬——验证通过就给 credit、放行。审阅不是"必须挑出错"才能交差。

---

## B4 后端代码审阅 · 评论批次（5 端点）

**批次性质**：评论 5 端点，严格按 `04-comments.md`，不碰 articles.ts。开发者自陈"门禁未跑（Bash 临时不可用）"——反而强化我独立复跑的义务。

### 一、张力点裁决：又是"散文 vs 契约"的镜像

`04-comments.md` 写"会员投稿默认 reviewing"，开发者取"自动流只产 approved/rejected、reviewing 仅由 PATCH 置位"。我回契约核验：行 393/1949/2068 白字"自动流只产出 approved / rejected；reviewing 仅能由 PATCH 置位"。**开发者判得对**——这与 B3"分类写=admin 散文过时"同源且同正确。结论：任务包散文过时，契约机器字段权威。给足 credit（C1/C10）。

> 元认知：两连击（B3 分类写、B4 评论默认态）说明 `03/04` 任务包 prose 与冻结契约存在**系统性偏差**。这不应由每个批次的开发 AI 各自"以契约为准"去消化，而应登记给契约维护批次统一修（见 P3-3）。否则 B5+ 仍会被误导。

### 二、最关键的发现：200 行铁律 + 自报不实

开发者 NOTES §五 自报"`comments.ts` ≈ 185 行（< 200）"。我 `wc -l` → **219 行**。偏差 34 行，不实陈述。

为何判 P2（阻塞）而非 P3：
1. 200 行是本项目反复确立的**铁律**，articles/categories 均已拆 `read.ts+write.ts` 形成现成范式；
2. `comments.ts` 是铁律确立后**首个越界的路由文件**（read/write 都守过 200）；
3. 开发者**明确声称已守 200**，我核实未守——"不采信自陈"的靶心就在这类"功能对、但自陈述与磁盘不符"处；
4. comments 后续批次（B5/B6/B7）不自然碰评论路由，放行即 219 永久滞留。

判定逻辑：铁律是硬地基，不是"功能对就可豁免"的软建议；自陈述不实若被放过，多 AI 协作中铁律会悄然滑坡。**修法廉价且低风险**（沿用 read/write 拆分范式），故以 P2 退回、快速复批。

### 三、门禁盲区再次被"功能正确"掩盖

本批无 P0/P1 正确性缺陷——默认态、公开仅 approved、级联 `.run()`、ownerOverride 404、授权矩阵全部契约合规。但"功能全对"恰恰让 200 行越界 + 自报不实**更难被察觉**。这正是总盘点的第 2 条："门禁是底线不是天花板"——`wc -l` 这道本该在每次审阅跑的核查，若不独立执行，就会被开发者的"≈185"糊弄过去。

### 四、契约内部不一致（非代码缺陷，登记维护批次）

- `Comment.content` 响应 `maxLength: 2000`（行 386）vs `createComment` body `65535`（行 1964）——代码按请求体校验无缺陷，属契约侧修正。
- 行 393/400 散文"admin 专用" vs `moderateComment` `x-authz.minRole: editor`（行 2058）——机器字段 editor 权威，代码 `guard('editor')` 正确，散文 stale（与 B3 分类写"admin"同源）。

开发者已正确识别并登记这两者，本轮不重复计分。

### 五、credit 清单（避免冤枉、避免重复计分）

C1 默认态契约合规 / C2 不碰 articles.ts / C3 级联 `.run()` / C4 ownerOverride 404 语义 / C5 公开列表恒 only-approved（含 admin）/ C6 未发布匿名 404 / C7 敏感词转星+比率+存遮后文本 / C8 approved 清 rejectedReason / C9 未新增 error.code / C10 授权矩阵对齐 x-authz。10 项全落地。

---

## B4 后端代码审阅 · 第二轮复批（评论批次）

**批次性质**：B4 复批轮。首轮以 P2-1（219 行越界 + 自报不实）退回，开发者整改后交 `B4-代码审阅-回复.md`。

### 一、复批核心动作：逐字比对磁盘，不采信自陈

首轮最刺眼的是"自报 ≈185 行，实际 219 行"。复批轮我第一件事就是 `wc -l` 三个新文件：

| 项 | 自报 | 磁盘 `wc -l` | 吻合？ |
|---|---|---|---|
| comments-read.ts | 72 | 72 | ✅ |
| comments-write.ts | 127 | 127 | ✅ |
| comment-query.ts | 40 | 40 | ✅ |

**完全吻合**。这是"不采信自陈"纪律最想要的副产品——独立核查不仅守住了铁律，还倒逼开发者**诚实自报**。首轮点出的"不实陈述"不是被掩盖，而是被真正纠正。这类"自陈纪律回归"本身就是放行信号，与"无假修复即放行"同源。

### 二、P3-2 重构必须回 `guard` 证伪 ownerOverride 语义

开发者把 DELETE 的"handler 内 `existing` 重查"改成"复用 `res.changes===0` 兜底 404"。表面看少一次 SELECT 是优化，但我必须确认**所有角色删评论的 404/403/200 矩阵没破**。我回 `middleware/auth.ts:49-66` 重读 `guard`：

- `roleOk`（editor/admin）为真 → 直接 `next()`，**不调** `resolveCommentOwner` → 走 handler `changes===0` 兜底 404；
- member → 调 `resolveCommentOwner`：缺失评论抛 404、归属不匹配抛 403、匹配则 `next()` 删 → 200。

四种路径与原实现（handler 内 `existing` 重查）逐一等价。**行为零破坏，且少一次 SELECT**。开发者还特意没采用我首轮建议的 `c.set('comment', row)` 复用写法——那个会破坏 `AuthVars` 类型（仅声明 `user`），正是 B4 首轮修复轮已剔除的反模式。他改选 `changes` 判定，是更稳的决策，给 credit。

### 三、门禁盲区补位精准

P3-1 新增的 2 例 parentId 测试（幽灵引用 → 404 / 跨文章引用 → 404），正钉在首轮"只测快乐路径"的盲区上。复跑 `vitest` 90/90 全过（comments.test.ts 12 例）。这与 B2 复批"24h 后重访"补位同一逻辑：审阅者指明门禁漏了哪类输入，开发者补的测试必须**精确命中那个漏网类**，而非泛泛加用例。

### 四、元认知：复批放行的第四次应验

| 批次 | 复批轮 | 假修复？ | 结果 |
|---|---|---|---|
| B1 | 二轮 | 无 | 放行 B2 |
| B2 | 二轮 | 无 | 放行 B3 |
| B3.5 | 首轮 | 无 | 放行 B4 |
| B4 | 二轮 | 无 | 放行 B5 |

"没有假修复 → 复批即放行"已在四个批次闭环。区别在于：B1/B2/B3.5 复批轮靠"逐行比对磁盘 diff"识破潜在假修复；B4 复批轮还多了一层——**开发者自陈数据本身回归真实**（首轮不实、复批精确）。证明"点出不实陈述"这记校正，对协作方有真实约束力，不是单纯的挑刺。

### 五、唯一遗留（非阻塞）：文档债

契约侧 2 处不一致（P3-3）+ B3/B4 任务包 prose 与冻结契约的系统性偏差（"默认 reviewing""分类写=admin"），已登记给契约维护批次。这是**文档债**不是代码债——代码以契约为准全都判对，只是 prose 误导后续开发 AI。B5 不碰。

## B5 后端代码审阅（用户 / 资料 / 上传批次）

**批次性质**：B5 首轮（非复批）。交付 `B5-NOTES.md`，commit `2840b5c`，11 端点拆 5 路由文件。结论：**自 B1 以来第二个零 P0/P1/P2 的批次**（第一个是 B1），仅 5 项 P3 非阻塞观察。

### 一、本轮"不采信自陈"的三个具体抓手

1. **`wc -l` 复核行数（延续 B4 教训）**：B4 首轮抓到"自报 ≈185 行，实际 219 行"。B5 我第一件事仍是 `wc -l` 六个新文件，结果**与自报逐字吻合**（users 87 / users-admin 47 / me 119 / members 59 / upload 148 / attachment 61）。这说明 B4 复批"点出不实陈述"的校正**真正生效**——协作方已被约束到"自陈须与磁盘一致"。这是放行 B5 的最强信号之一。

2. **逐端点回 `x-authz` 机器字段（延续 B3/B4"散文 vs 契约"裁决）**：B5 任务包 `05-users-upload.md` 与冻结契约无冲突（本批 prose 与契约一致），但我仍逐一 grep 契约 `x-authz.minRole`（行 2171/2238/2262/2727/2746/2806/2851/2901/2949/3021）与代码 `guard`/`authMiddleware` 比对，11 端点全对齐。重点盯了 `POST /upload`（契约 minRole member，代码仅 `authMiddleware`，正确——任何已登录角色 ≥ member 都过）、`DELETE /attachments/{id}`（editor + ownerOverride(userId)，代码 `guard('editor', resolveAttachmentOwner)` 正确）。

3. **独立复跑门禁（分三次避 OOM，延续 B2 复批教训）**：开发者自跑已绿（104 passed），但我仍分 tsc / biome / vitest 三次独立调用。结果一致：tsc 0 / biome 69 文件 0 error 0 warning 2 info / vitest 104/104。契约结构门 `OK`（git 确认 `openapi.v1.yaml` 不在 commit 改动列表）。

### 二、门禁看不到、必须手推的正确性

- **脱敏双路**：`toPublicUser`（user.ts:39-49）确认不含 `passwordHash`；`GET /members/{id}` 走**手搓** `MemberProfile`（members.ts:49-56），不含 email/role/status/passwordHash/createdAt。我额外追查 `toPublicUser` 的**全项目调用点**（users/users-admin/me/auth），确认它从不在匿名/他人上下文返回 → 无越权泄漏。这是"代码是素材"项目最该守住的隐私边界。
- **storageKey 不泄漏**：`Attachment` 响应（attachment.ts:25-34）不含 `storageKey`；契约 `Attachment`（432）亦无此字段。删附件时 `storageKey` 仅用于定位底层对象，绝不进响应。
- **双存储真实边界**：`upload.ts:137-143` 行删后尽力删底层、`catch` 吞底层失败不阻塞行删——与契约 2270 描述一致，也契合主计划适配层题材。
- **disabled 防枚举**：`members.ts:21` `disabled → 404`，与契约 2316 一致。

### 三、5 项 P3 的判别逻辑（为何全不阻放行）

| 观察 | 性质 | 为何非 P2 |
|---|---|---|
| P3-1 本地无 `/files` 路由，上传文件本地不可预览 | 本地 dev 体验缺口 | 生产走 R2+CDN 不受影响；契约本就将 local 定位"兜底" |
| P3-2 成员文章列表未分页（`.all()`） | 设计取舍 | `articleCount` 取 `rows.length` 因无 limit 仍正确；当前数据量小 |
| P3-3 upload 双 `parseBody` | 浪费非错误 | Hono `bodyCache` 保证功能正常；biome 仅标 2 info |
| P3-4 无 last-admin / 自我封禁保护 | MVP 运维风险 | admin 操作，非匿名越权；可后续加护栏 |
| P3-5 SVG 白名单 XSS 面 | 生产由 CDN 策略决定 | 本地未服务该文件，且可顺手加 content-sniff 净化 |

判别准则：P2 要满足"会破坏契约 / 会被真实流量打挂 / 越已确立铁律 / 自陈述与磁盘不符"至少其一。以上五项均不满足——它们是"更健壮 / 更好体验"，不是"坏了"。故放行，仅登记为后续优化。

### 四、元认知：本批为何干净

- B5 是继 B1 后第二个零 P0/P1/P2 批次，且**P2 级问题（行数铁律）已无**——B4 曾因 219 行 + 自报不实被判 P2，B5 行数全 ≤200 且诚实。
- 门禁盲区本批**未被"功能正确"掩盖出逻辑缺陷**（对比 B2 `/view` 500、B4 行数）——说明开发 AI 在 B4 复批后已内化"自陈须与磁盘一致"的纪律。审阅者的价值从"抓假修复"退化为"确认无假修复 + 列 credit + 标 P3 增强项"，这是协作成熟的标志。
- 与历轮"无假修复即放行"同脉：本批连复批都不需要——首轮即全绿、零偏差。

---

## B5 第二轮复批（P3 整改核验，2026-08-25）

**背景**：B5 首轮零 P0/P1/P2，仅 5 项 P3 非阻塞观察。开发 AI 对 P3-1～P3-5 **全部真修**（非登记），给 `B5-代码审阅-回复.md`。本轮回「复批」，重点不是再找错，而是**验证修复是真修、且没引入回归**。

**这轮我的判断逻辑（4 个抓手，比首轮更狠）**：
1. **不只要门禁绿，要逻辑可读**。测试绿可能空跑或断言弱。所以逐文件读 `file:line`：files.ts 的 SAFE_KEY 校验 + local-only 分支、users.ts 的 self-guard/last-admin 双护栏、upload.ts 的 parseUpload 单次返回 articleId、members.ts 的 queryArticles 复用 —— 每一处都对照回复描述确认落在了磁盘上。
2. **新增用例要 grep 复核断言真实性**。回复说加了 4 例 P3 测试，我 grep 出 `res.status 403 + code 2001`、`Content-Disposition: attachment` 等真实断言，确认不是 `expect(true).toBe(true)` 式空跑。
3. **行数仍 wc -l 复核**。B4 的"自报不实"教训太深，B5 这轮行数（files 52 / members 37 / upload 150 / users 116）与自报逐字吻合 —— 诚实基线已稳住。
4. **契约双门禁用对工具**。首跑我误用系统 python3（无模块）且用了相对路径，报错与修复质量无关；改用 venv 解释器 + 绝对路径后 `openapi.v1.yaml: OK` + 语义自查全过，`git status` 亦证契约字节级未动。这条提醒我自己：**复验命令本身要可复现，否则"门禁绿"是伪证据**。

**判定**：5 项 P3 全部真修，无 P0/P1/P2，无假修复，维持放行 B6。

**两个非阻塞边角（未入 P 级，仅记）**：
- N1：P3-4 最后 admin 守卫对"降级已 disabled 的 admin（仅剩 1 活跃 admin）"会防御性 409。无害过保护，正常双 admin 运维用例已证 200。
- N2：回复记 biome「70 文件」，实测 71（files.ts 新计入）。实质 0 issue 成立，但门禁文件数类自述应以工具实际输出为准——这是给开发 AI 的小纪律提醒，避免下轮再出"数不对"类笔误（虽不影响裁定）。

**元认知**：B5 第二轮是生命周期第 **5** 次「无假修复即放行」（B1-2/B2-2/B3.5/B4-2/B5-2）。信号已经很稳——开发 AI 在 B4 复批后把"自陈须与磁盘一致"内化成了习惯。接下来 B6 收尾，我仍会沿用同样 4 抓手；若 B6 仍零假修复，M1 后端审阅方法论可沉淀为可复用 skill。

---

## B6 后端代码审阅（收藏/历史/点赞/通知，2026-08-26）

**背景**：B5 复批放行 B6（15 端点，收尾段）。开发 AI 交 `B6-NOTES.md`，我独立复验。

**4 抓手取证**：① `wc -l` 复核（favorites 103/history 152/likes 163/notifications 108/app 71，与自报逐字吻合，诚实基线稳）；② 逐文件读 4 路由 `file:line`；③ 抓契约 B6 全部 15 个 operationId 的 `x-authz`/`x-idempotent` 机器字段（grep 契约 2525–3735 行）；④ 分三次跑门禁 + venv 跑契约双门禁。

**门禁全绿**：tsc 0 / biome **78** 文件 0（回复记 77 笔误，+1 为测试文件）/ vitest **116 passed**（B6 新增 8 例）/ 结构门 `OK` + 语义全过 / `git diff` 证契约字节级未动。

**授权矩阵全对齐**：15 端点 `x-authz` 与代码逐一对齐，含 3 处 ownerOverride（removeFavorite/removeHistoryItem 用 `WHERE userId=当前` 隐式本人限定；updateNotification 加载后非本人→404）+ 1 处公开（getArticleLikeStatus `optionalAuthMiddleware`）。响应 schema（ArticlePage/HistoryPage/Notification/{liked,likeCount}/{count}）与错误码（仅 3001/5000，无新增）全吻合。

**唯一实质问题 —— P2-1（likeArticle 并发 500，破坏 x-idempotent 机器字段）**：
- 关键发现：**同一批内两种写法并存**暴露不一致**。`addFavorite`（favorites.ts:87）正确用 `.onConflictDoNothing()`；但 `likeArticle`（likes.ts:70）用**裸 insert 无 onConflictDoNothing**，而契约 3331 明确标 `x-idempotent:true`。
- 推演：用户连点两次 like（乐观 UI 双发/弱网重叠在途）→ 两个请求都通过 `if(!existing)` → 第二个 insert 撞 `uniq_like` 唯一约束 → `SQLITE_CONSTRAINT_UNIQUE` → 全局错误处理 → **500**，而非契约承诺的 200。这是"声明幂等但并发破功"——比 B1 并发注册 500 更隐蔽（单测顺序永远绿，只有并发在途才触发）。
- 对称问题：`articles.like_count` 用"读 `article.likeCount` 再 ±1"应用层 read-modify-write（likes.ts:73/107），并发下可漂移（一次真实点赞 +2）；`unlikeArticle` 用 `Math.max(0,…)` 防负但读值仍陈旧。
- 修复（与 favorites 同构、低风险）：`likeArticle` 改 `insert…onConflictDoNothing()` + 仅 `changes>0` 时 `sql\`like_count + 1\``；`unlikeArticle` 用 `sql\`CASE WHEN like_count>0 THEN like_count-1 ELSE 0 END\`` 原子 -1。这样 x-idempotent 在 DB 层真成立。
- 判别：满足 P2 准则"破坏契约机器字段"（x-idempotent 承诺 200 却可 500）。与 B1 同根，favorites 已示范正确写法 → likes 漏用属不一致。低频竞态但修复成本极低，**建议 B7 前顺手修**（非立即阻塞本批功能正确性）。

**P3 非阻塞**：① `reportReadingProgress`（history.ts:110）同源 read-then-insert，并发双发撞 `uniq_view_history`→500（契约未标 x-idempotent，故非契约违反，建议改 `onConflictDoUpdate`）；② like_count 漂移已并入 P2-1 修复；③ `GET /me/likes` 契约内部不一致（响应裸数组但 params 声明 page/pageSize，代码严格按契约返回裸数组，登记契约维护批次）；④ `schema.ts` 336 行 >200（单一事实源，B2–B5 先例未列 P，沿用）；⑤ NOTES §六 自陈偏差（称 clearMyHistory/removeHistoryItem 契约标 x-idempotent，实测未标；DELETE 天然幂等、代码正确，无害，但属"散文 vs 契约"同源过度声称，仅记录）。

**裁定：B6 通过，放行 B7；建议先清零 P2-1（likeArticle 并发 500 + 计数漂移）后再开 B7。** 元认知补强：**x-idempotent 同 x-authz 是第4铁律机器字段，审阅不能只看"顺序单测绿"，要追问"实现是否真幂等（DB 层 onConflict / 原子更新）"**——这是 B6 给本审阅打法新增的一把尺。

---

## B6 第二轮复批（P2-1/P3-1 真修核验，2026-08-26）

- **背景**：首轮我提 P2-1（likeArticle 并发 500 破坏 x-idempotent 机器字段）+ P3-1（reportReadingProgress upsert 竞态）+ P3-2/3/4/5。开发 AI 给回复文档 + 更新 NOTES，要求复批。
- **重要取证细节**：修复是**工作树未提交改动**（最新 commit 仍 `d7662a0`，fix 落在 `likes.ts`/`history.ts`/`interactions.test.ts` 三个 modified）。复批基于工作树当前状态，已提醒开发 AI 修复确认后单独 commit。
- **逐项真修（读 file:line，非仅测试绿）**：
  - P2-1：`likes.ts:63-75` `likeArticle` 改 `onConflictDoNothing()` + `res.changes>0` 才原子 `like_count+1`；`likes.ts:102-109` `unlikeArticle` 原子 `CASE WHEN like_count>0 THEN -1 ELSE 0`；`sql` 已导入(9行)。同批 favorites 与 likes 写法统一。
  - P3-1：`history.ts:100-109` 改 `onConflictDoUpdate({target:[userId,articleId], set})`，progress 仅携带时覆盖。
  - P3-2 已并入 P2-1；P3-3/4/5 仅登记。
- **门禁四次独立跑（vitest 独占避 OOM）**：wc -l（163/146/103/108 与首轮吻合）/ tsc 0 / biome 81 文件 0（回复记 80 笔误，实质 0 成立）/ vitest **117 passed**（16 文件，含新增并发例）/ 契约双门 OK + 字节级未改。
- **新增并发用例非空跑**：grep `interactions.test.ts:314-342` 实证 `Promise.all` 双发 → 两 200 + `likeCount:1` + DB 仅 1 行，旧实现必 500。
- **判定**：维持放行 B7。这是生命周期第 **6** 次「无假修复即放行」（B1-2/B2-2/B3.5/B4-2/B5-2/B6-2），开发 AI 自 B4 复批后稳定内化纪律，可沉淀 M1 后端审阅 skill。
- **元认知补强**：x-idempotent 同 x-authz 是第4铁律机器字段，审阅须追问「实现是否真幂等（DB 层 onConflict / 原子更新）」，不能只看顺序单测绿。

## B7 后端代码审阅（辅助/站点，8 端点，2026-08-26）

- **背景**：收尾批，8 端点。`B7-NOTES.md` 自报全绿、契约零改动。用户特别提示「开发 AI 压缩记忆、思考乱」→ 我把重心放在压缩记忆最易丢的边界：nullable 全字段、关联表回填状态、operationId 命名。
- **独立取证**：commit `8e0ce4a`（工作树干净），改动 12 文件、`openapi.v1.yaml` 不在集。门禁分三次跑：tsc 0 / biome 91 文件 0 / vitest **126 passed**；契约双门 OK + 字节级未改。行数诚实（66/79/118/46/42/132/357/198/76 吻合）。
- **抓到 1×P2（阻塞）**：`PATCH /admin/site/settings` 的 `logoUrl` 入参漏 `.nullable()`（`site.ts:54` `z.string().max(512).optional()`），但契约 `SiteSettingUpdate.logoUrl`（606 行）是 `nullable: true` → 传 `null` 清空会被 zod 拒成 4001，功能不可达。同 schema 的 siteTitle/siteKeywords/copyright 都正确加了 `.nullable()`，唯独 logoUrl 漏——典型压缩记忆丢细节。**且 NOTES §二.7 自述「null 清空（如 siteTitle、logoUrl）」与代码矛盾**（自陈不实红线）。
- **P3 非阻塞**：① related.ts:6-7 + NOTES §二.3 事实错误称「article_tags 未回填」——实际 B3.5 已回填 junction；related 读的是 `articles.tags` denormalized 列（schema.ts:87「B2 去规范化」已填充），逻辑正确，仅陈述错；② NOTES §一 operationId `getAdminSiteSettings` 与契约 `adminGetSiteSettings`（3124 行）不符（笔误）；③ MemberProfile.articles 可选未返回；④ toc anchor 去重后缀极边界超 100；⑤ adjacent 同 publishedAt 无 tie-breaker。
- **全对齐项**：授权矩阵 8 端点（6 公开 + 2 admin）逐一对齐 x-authz/security；响应 schema（ArticleAdjacent/ArticleRelatedItem/TocItem/SiteStats/SearchResult/SiteSetting）逐字段吻合；search 的 `sort` 透传 `buildSortSql`，白名单 `{publishedAt,viewCount,createdAt}` 正确处理契约 6 个 enum（含 `-` 前缀），**B2 排序白名单 P2 修复已正确复用于 B7，无回归**；错误码无新增。
- **裁定：首轮不通过（P2-1 阻塞）**。收尾冻结批契约一致性须清零；要求开发 AI 修 logoUrl `.nullable()` + 补 `logoUrl:null` 清空测试 + 修正 P3-1/P3-2 NOTES 事实错误，复批后放行冻结 M1 后端。
- **元认知**：用户「压缩记忆会乱」的预判正中——P2-1 漏改 logoUrl nullable（5/6 字段对，1 个漏）+ related/junction 事实误述 + operationId 笔误，三点同源（记忆压缩丢细节）。后续收尾批审阅要额外盯「契约 requestBody 全字段 nullable/required 与代码 zod 逐字对齐」+「NOTES 陈述与已知批次（如 B3.5）史实一致性」。

## B7 第二轮复批：真修确认 + 一场「假假修复」虚惊（环境误报根因复盘）

- **复批对象**：`B7-代码审阅-回复.md`（开发 AI 整改 P2-1/P3-1/P3-2）。纪律不变：不采信自陈，回磁盘取证。
- **逐项真修确认**：
  - **P2-1**（`site.ts:54`，Read 实测）：`logoUrl: z.string().max(512).nullable().optional()`，与回复 diff 逐字吻合；下游 `if (patch.logoUrl !== undefined) set.logoUrl = patch.logoUrl` 对显式 `null` 走清空，逻辑正确。
  - **回归测试真实非空跑**（`aux.test.ts:378-394`）：先 `PATCH {logoUrl:'...png'}` 断言有值（:386），再 `PATCH {logoUrl:null}` 断言 `toBeNull()`（:394）——端到端覆盖清空路径。
  - **P3-1**（`related.ts:6-7`）：注释已改为「读 `articles.tags` 去规范化列，与 article_tags 回填状态无关」。**P3-2**（B7-NOTES §一）：operationId 笔误已改 `adminGetSiteSettings`。
- **⚠️ 虚惊：一次「假自证」误判如何被证伪**。第一轮独立 `vitest run` 竟得 **95 failed / 31 passed**，与开发 AI 自陈「126 passed」相反。我第一反应是「不采信自陈 → 假自证信号」。但查证发现：
  1. 那 95 个失败 **100% 是 `Test timed out in 5000ms`**，grep 真实断言失败（AssertionError/expected/FK）为空；
  2. 失败**横跨 B1–B7 全部批次**——1 行 zod 改动不可能如此，逻辑上排除 B7 回归；
  3. 单文件 `aux.test.ts` 隔离跑仍 4 failed/5 passed 且耗时 52s（≈5.8s/用例，撞 5s 上限）；
  4. `uptime` 显示机器 `up 39 days / 21 users`、load average **17.29**——共享机器瞬时高负载；
  5. **决定性复跑**：`vitest run --no-file-parallelism --testTimeout=30000` → **17 文件 / 126 passed / 0 超时 / 0 断言失败**。
  → 结论：95 失败纯属我侧环境负载撞 5s 超时，FK `[unhandled]` 是超时中断的异步噪声。**开发 AI 的「126 passed」真实正确，非假自证**。
- **元认知（重要方法论补强）**：作为总把控，看到「自陈 passed 但独立跑 fail」时，**第一直觉应是「先查失败性质」而非「直接判假自证」**。判别顺序：① 失败是 timeout 还是 assertion？timeout 优先怀疑环境（负载/并发/DB）；② 失败是否跨无关批次？跨批次必非单一改动所致；③ 单文件隔离 + 高超时串行复跑剥离噪声。这套「超时≠失败、环境≠代码」的排查链，比 B1–B6 任何一次都更关键——它避免了一次对开发 AI 诚信的不实指控，也保住了「不采信自陈」纪律的公信力（真自证与假自证都要靠证据，而非预设）。
- **M1 后端代码冻结裁定**：B7 是收尾批，八批（B0→B7）全部独立复验、零假修复。裁定 node-backend **即日起冻结**，进入「写 M1 后端文章」阶段（总把控执笔）。

## 总复盘：这套审阅打法给我（和接手 AI）留下的最硬的几条

1. **审阅者的存在意义 = 破除"作者自证盲区"**。同一人写代码、写门禁、写修复说明，他的注意力天然覆盖不到"自己没想到的维度"。独立审阅者用另一套逻辑重新证伪，是成本最低的防漂移手段。呼应 N6：冻结前应由**非作者**跑穿透式核验。

2. **"只在散文"是缺陷家族，不是单点**。F1→R1→N1→N7→N10→N9-2 是同一病根在不同层的显现。修一层就要预判下一层，否则它换件衣服在下一轮回来。这条对**写契约的人**同样适用：每写一个约束，先问"它机器可读吗？新人仅凭本文档能推出正确行为吗？"

3. **门禁是底线，不是天花板**。门禁保证"不会退化"，但"正确性"在门看不到的地方。对契约类项目，**必须有一道"脚本化比对契约"的门禁**（如 `error-codes.test.ts` 真解析 yaml 比对 code↔HTTP），把"软约束"变成"可回归的硬断言"。

4. **判定真修复只看一个标准**：新人能否仅凭本文档/代码确定性推出正确行为。散文改了但契约没动、或回复说修了但磁盘 diff 没有 → 一律判未修。

5. **"没有假修复"本身就是放行信号**。前几轮都抓到假修复，所以不冻结；第四轮复验无假修复，所以结案。不要因为"他说可冻结"就冻结，要因为"复验证伪失败"才冻结。

6. **给足 credit，建立信任但要验证**。每轮先列"确实落地了"的清单，避免冤枉、避免重复计分。信任但要验证——这两件事不矛盾。

---

*附：本思考录与 `docs/review/`（契约 4 轮审阅报告）、`docs/node-backend/review/B0-后端代码审阅报告.md`、`B0-代码审阅-第二轮复审批复.md`（代码 2 轮审阅）互为表里——那些是"结论与证据"，本文件是"当时的判断逻辑"。建议对照阅读。*

---

## B-结构调优 后端代码审阅（2026-08-26，总把控/BackendArchitect）

对象：开发 AI 交付 `B-结构调优-NOTES.md`（提交 `15f516d` 主重构 + `d0e309b` 纯移动）+ 目标结构规范 `04-目标目录结构.md`。

**裁定：审查通过（可放行，无 P2 阻塞）**，5 项 P3 非阻塞，其中 2 项须随批复修正交付文档。

判断逻辑要点：
1. **不采信自陈，全部回磁盘**。`d0e309b` 是 0/0 纯移动（Step A：lib→services 14 + shared 10）；`15f516d` 是 84 文件逻辑下沉（routes −、services +）。顺序与 05 任务包设想不同但等价，且更低风险——属实。
2. **铁律②用无歧义 token 终验**：先一轮 grep 被 `c.get('user')`、zod `.or(`、`router.get(` 噪声干扰，二轮回扫 `getDb\|drizzle-orm\|\beq(\|sql\`\|\.run(\|\.all(` 等，唯一命中是 `upload.ts:11` 的一句注释——**routes 零 DB 调用铁证成立**。这提醒：grep 模式要避免 `\.get\(` 这类宽匹配陷阱。
3. **service 收 `c` 的耦合要查清是否回归**：`services/article.ts:214/243` 读 `c.req` → 查旧 `lib/article.ts`（d0e309b~1:143/160/213/241）**早已如此** → 判定既有残留、非本次调优引入，归入未来清理（P3-1），不计入开发 AI 责任。这条若不复古取证就会误判为"重构引入的反模式"。
4. **NOTES 事实错误要抓**：§四称"services 超 200 者(article≈252、user≈250) 已标注 services 例外"——实测 article 451 / user 335，且仅 article 有注释，user/category/comment 均无。尺寸低估 + "全部已标注"不实，属交付文档准确性（P3-2/P3-3），与 B7 P3-1 同源（压缩记忆导致细节丢失的典型症状）。
5. **types 层"最底层"措辞要精确**：types 经 `import type` 引用 shared（Role/ErrCode），编译期擦除、无运行时环，设计正确；但"最底层"易误导，应写为"仅类型、对 shared 为 type-only 引用"（P3-4）。

结论：分层实质达标、门禁独立复跑全绿、契约字节级未改、零行为变更有测试+diff 双佐证。放行前置 = 开发 AI 补 3 份 service 例外注释 + 修正 NOTES §四 → owner 确认目录风格 → 冻结 → 写 M1 文章。

---

## B-上传去重 后端代码审阅（2026-08-26，BackendArchitect）

被审：开发 AI 交付 `08-上传去重-交付文档.md` + 代码 `5252c3d`；设计基线 `06`+`07`（owner 决策锁定：全局/不做 content_hash 列/不做 backfill/接受同字节异 ext）。

**裁定：通过，含 1 P2（冻结前置）+ 2 P3（非阻塞）**。报告：`docs/node-backend/review/B-上传去重-后端代码审阅报告.md`。

判断逻辑要点：
1. **五门门禁独立复验全绿**：tsc0 / biome 113 文件 0 / vitest **132 passed**(126+6) / 契约结构门 OK / 语义门 **33 OK**；`openapi.v1.yaml` git diff **0 行**（字节级未改）；contentHash 未进 Attachment 响应（决策#2 守住）；randomUUID 已从 storage.ts 移除；仅 `storage.ts`+`attachment.ts`+`attachment.test.ts` 三文件改动。
2. **P2 关键抓点——静默行为变更**：`DELETE /attachments/{id}` 在 editor/admin 下删「不存在 id」由原 **404 变 200**，与冻结契约 `:2297-2303`（404 附件不存在）矛盾。根因链：`guard('editor',...)` 中 `roleOk` 满足即 `return next()`（auth.ts:53-54）→ editor 越权直达服务；新 `deleteAttachment` 对缺失 id `if(!row) return`(resolve) 而非原 `changes===0→throw 404`。开发 AI 将此作「幂等」写入测试却未标注为契约偏差（对比 sync 事务偏差有显式标注）。语义门是静态 YAML 检查，抓不到运行时行为差异——此点只能靠代码审阅发现。修复：复原 `attachment.ts:131` 为 `throw AppError(NOT_FOUND,404)`（方案A 推荐严守契约），或 owner 明示接受幂等 200 并留档（方案B）。**未解 P2 不得冻结**。
3. **P3-1 孤儿竞态——被迫偏差要认清**：better-sqlite3 事务回调须同步（async 会抛 "Transaction function cannot return a promise"），文件删除被迫移到事务外 → 极窄孤儿竞态（并发同字节上传在「count=0 提交后、FS 删前」插入新行→新行孤儿）。实则 `06` 原「文件删置于 async 事务内」在 better-sqlite3 上本就跑不起来，开发 AI 写法是唯一可行形态；DB 原子性（删行+计数）确在事务内。属「去重+引用计数+非事务 FS」固有代价，owner 已否决 ref_count 列（无迁移路径），建议文档化接受。
4. **P3-2 既有偏差**：守卫对缺失 id 返 403（auth.ts:60）而非契约 404，本次前已存在；本次使 editor 路径亦失 404。另立 issue，不计入责任。

**owner 裁决更新（2026-08-26 末）**：P2 **方案 A**（复原 404，去掉恒 true 的 `found` 字段）、P3-1 **接受**（文档化孤儿竞态、非阻塞、要求开发 AI 在 `deleteAttachment` 物理删处补注释）、P3-2 **要求开发 AI 修复**（守卫 `null→404` 全局纠偏，仅 attachments/comments/articles 三类带 resolveOwner 资源受影响、零回归）。审阅报告已**重写为「裁定 + 开发 AI 修正指令」形态**（`docs/node-backend/review/B-上传去重-后端代码审阅报告.md`），含三任务精确代码 diff + 测试配套 + 复批门禁 5 条；owner 直接交开发 AI 执行 → 架构师复批 → owner 视觉确认 → 冻结 M1 后端主线。

下一步：开发 AI 完成 #1（选 A 或 B 留档）→ 申请复批（复跑门禁+契约双门+确认缺失 id 回归 404 或 owner 留档）→ owner 视觉确认 → 冻结 M1 后端主线。
