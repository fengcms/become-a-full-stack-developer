# M1 Node 后端 · 开发思考录（DEV-LOG）

> 随手记录的架构决策、权衡、踩坑与"为什么这么写"。按批次追加，不追求成文结构。
> 目的：让"后面的我"和接手的相关 AI 能直接学到这里的判断，而不是只看最终代码。

---

## B0 · 工程基座（2026-08-25）

### 1. 信封构造器为何返回原生 `Response` 而非 `c.json()`
最初直觉是 `ok(data)` 直接 `return c.json(...)`。但这样 `response.ts` 就被 Hono 耦合，单测要起 Hono 上下文。
改成返回原生 `Response.json(...)`：`ok/paginate/created/failResponse` 都是纯函数，任意运行时（Node / CF / 测试）通用。
Hono handler 直接 `return ok(data)` 完全合法（handler 允许返回 `Response`）。**结论：lib 层零框架依赖。**

### 2. 双层错误码：HTTP 码 + 业务 code
契约要求 `code`（业务细分，如 1002/1004）+ `HttpStatus`（给网关/浏览器）。我建了一张 `HttpForCode` 映射表，
把"业务码→HTTP 状态码"集中在一处，中间件只 `throw AppError(CODE)`，HTTP 码自动查表得出。避免在每个 handler 里手写 401/403/404。
**炫技点**：`ErrCode` 用 `as const` + `as const` 推导，`ErrorMessages`/`HttpForCode` 的 key 用 `[ErrCode.XXX]` 计算属性，
一旦契约加码，漏配会立刻类型报错——把"契约一致性"前移到编译期。

### 3. 统一错误 vs 字段校验错误
- 业务异常（资源不存在、无权限…）→ `throw AppError(CODE, details?)` → 顶层 `errorHandler` 包成信封。
- 入参校验失败（4001）→ zod 校验中间件的 `onError` 直接 `return failResponse(VALIDATION, 422, { errors })`，
  `errors` 形如 `[{ field, message }]`，对齐契约 `ValidationErrorList`。
两条路径都收敛到同一个信封构造器，保证形状 100% 一致。

### 4. 鉴权守卫：第 4 铁律 ④(a) OR ④(b)
`guard(minRole, resolveOwner?)` 是核心原语：
1. 先判角色阶梯：`ROLE_RANK[user.role] >= ROLE_RANK[minRole]` → 放行（④a）。
2. 否则若传了 `resolveOwner(c)` 且资源归属 == 当前用户 → 放行（④b）。
3. 否则 2001 无权限。
**这是会员作者能提交自己草稿、editor 能改自己文章的关键**。B2/B5 直接复用，无需每端点重写。

### 5. 环境配置单例化
中间件（如 auth）需要 `JWT_SECRET`。早期想用 `c.env`（CF 有、Node 没有），会割裂。
改为 `config/env.ts` 提供 `readEnv()` + `setActiveEnv/getActiveEnv`：应用启动时装好，全局取用。
测试在 setup 里装一份 test env，干净可复用。

### 6. DB 适配层边界
本地用 better-sqlite3（Drizzle），CF 用 D1（Drizzle）。二者返回类型不同，但共享 SQLite 内核。
`getDb()` 类型锁定为本地 `BetterSQLite3Database`，CF 入口在 `createD1Db` 处做一次 `as unknown as Db` 受控转换——
只在边界出现一次，业务代码永远只认 `getDb()`。**这是"适配层"最该有的样子：脏活收敛在边界。**

### 7. 迁移不靠多语句 exec
better-sqlite3 的 `prepare` 不支持多条 SQL；`db.run(sql.raw(stmt))` 单条执行，按 `;` 拆成语句数组循环 `run`。
D1 生产迁移走 `drizzle-kit generate + migrate`（deploy 阶段），`migrate()` 仅服务本地/测试。

### 8. 测试不引 supertest
Hono 自带 `app.request(path, init)` 发真实请求并返回 `Response`，足够覆盖契约一致性。少一个依赖，快且清爽。

### 9. 选 better-sqlite3 而非 node:sqlite
Node 22 有内置 `node:sqlite`，但需 `--experimental-sqlite` 启动；`dev` 脚本带 flag 不优雅。
better-sqlite3 有预编译二进制（Apple Silicon 直接装），且与 Drizzle 文档/类型最契合。B1 起密码哈希用 `bcryptjs`（纯 JS，免编译）。

### 10. 类型纪律
- `verbatimModuleSyntax: true` → 类型导入必须 `import type`，逼出干净依赖。
- `noUncheckedIndexedAccess: true` → `ROLE_RANK[role]` 是 `number | undefined`，必须 `??`。
- 全量避免 `any`；CF 的 D1 binding 类型用 `Parameters<typeof drizzleD1>[0]` 反推，省掉 `@cloudflare/workers-types` 依赖。

---

## B0 审阅修复（2026-08-25 晚）

> 背景：审阅专员出具 `review/B0-后端代码审阅报告.md`，指出 1×P0 + 5×P1 + 5×P2。本批次清零全部 P0/P1，并借机把"契约一致性"落成可回归测试。

### R1. "门禁全绿" 不等于 "正确"
自陈的 tsc/biome/vitest 只验"能编译 / 能跑 / 格式对"，验不了"逻辑/契约对不对"。本次 4001 被写成 422、ACCOUNT_DISABLED 被写成 403，三道门禁全过却都与契约相悖。
**教训**：涉及契约的项目，必须有一道"脚本化比对契约"的门禁（见 R3），人工审阅也会漏（本次审阅同样漏了 1005）。

### R2. `@/` 路径别名在 TypeScript 7 的坑
`baseUrl` 在 TS 7 被彻底移除，配 `paths` 会直接报错 `TS5102`。
**正确做法**：删掉 `baseUrl`，仅留 `paths: { "@/*": ["./src/*"] }`（paths 相对 tsconfig 解析）。vitest 侧用 `resolve.alias['@']` 指向 `./src` 对齐。
**价值**：全仓零 `../` 引用，重构/移动文件不再牵一发动全身；IDE 跳转稳定。约束：相对引用只允许 `./` 同目录，跨目录一律 `@/`。

### R3. 契约一致性测试是 B0 最值钱的新增
`test/contract/error-codes.test.ts` 用 `yaml` 解析 `openapi.v1.yaml`，抽取每个响应的 `example.code` 与 HTTP 状态，断言与 `HttpForCode` 完全一致。
它**一次性揪出 2 个此前所有关卡都漏掉的缺陷**：
1. **契约自身缺陷**：`POST /auth/{provider}/callback` 的 `501` 占位响应 `example.code` 误写 `5000`（应为 500），契约内自相矛盾且无 501 码。修正契约 `501 → 500`。
2. **本方代码缺陷**：`ACCOUNT_DISABLED`(1005) 误映射 `403`，但契约明文"禁用账号登录/刷新返回 401/1005（故意不用 403 以免暴露账号存在性）"。修正 `codes.ts` 1005→401。
**方向判断**：缺陷 1 改契约、缺陷 2 改代码——恰好说明"以契约为准"要在契约*自洽*前提下才有意义；契约若自相矛盾，先让契约自洽再谈代码对齐。

### R4. 双部署断裂的根因（B02）
`app.ts` 顶层 `export const app = createApp(readEnv(process.env))` 会在模块求值即读 `process.env`。Cloudflare Workers 不保证 `process.env`（需 `nodejs_compat`），导入 `app.ts` 即崩。
**修法**：`app.ts` 只导出工厂 `createApp`；默认实例下沉到 `index.ts`（Node）与 `worker.ts`（CF）各自构造。模块顶层零副作用，双部署才稳。

### R5. 路径遍历防御（B04）
`LocalStorage.get/delete(key)` 若 `key` 直接 `join(root, key)`，攻击者可传 `../../etc/passwd`。`put` 生成的 `key=randomUUID()` 天然安全，但**读/删入参必须校验**。
**修法**：`resolveKey` 仅放行 `^[A-Za-z0-9._-]+$`，非法即抛错。即便将来 `key` 来自请求参数也安全。

### R6. CORS 的规范红线（B05）
规范禁止 `Access-Control-Allow-Origin: *` 与 `Access-Control-Allow-Credentials: true` 同时出现，否则浏览器拦截凭据请求。
**修法**：dev → `*` + 无凭据；非 dev → 白名单 + 凭据；**留空/`*` 视为未配置，不返回任何 CORS 头（拒绝跨域）**。凭据请求的安全姿态是"明确白名单"，不是"放开 `*`"。

### R7. 角色类型收紧（B11）
`jwt.ts` 原 `role: string` 宽松，存在 role 注入隐患。`AccessToken.role` / `AuthUser.role` 收敛为 `Role` 字面量联合，签发时即断言 `ROLES.includes(role)`。
`ROLE_RANK` 内部 0-based（member=0/editor=1/admin=2），对应契约文档的 1/2/3，注释标明以免接手 AI 混淆。

### R8. 文件组织约定（重申）
- 每个文件头有说明块；每个函数 TSDoc；单文件 ≤200 行（最长 91 行）。
- pnpm + 箭头函数，零 `function` 声明。
- biome 全开含 `noExplicitAny`；`verbatimModuleSyntax` 强制类型导入 `import type`。

---

## B1 鉴权批次（2026-08-25 晚）

> 6 端点全部落地；门禁 tsc/biome/vitest 全绿；33 测试（B1 新增 16）。

### B1-R1. 刷新令牌：有状态表 vs 无状态 JWT 的抉择
计划曾给过"无状态从简"的退路，但裁决（Q3）选了有状态 `refresh_tokens` 表。落地后回头看，有状态的优势不止"能旋转"：
- **重放可防**：旧令牌一旦被旋转作废，再次使用即 `1003` 且连带作废家族——纯无状态 JWT 做不到（JWT 无吊销概念，除非引入黑名单）。
- **即时作废**：`logout` 一键废掉用户全部会话，而无状态 JWT 在 exp 内仍有效（logout 形同虚设）。
- **审计友好**：`revoked_at` 留痕，且物理不删，便于安全溯源。
代价仅是一次 DB 写（签发/旋转各一写），对教程项目可忽略。结论：凡"需要吊销/旋转"的凭证，有状态模型更稳，别为了省事走无状态。

### B1-R2. `c.req.valid` 在 zod v4 下退化成 unknown
`@hono/zod-validator@0.9` 对 `zod@4` 的 `c.req.valid('json')` 推断失效（返回 `unknown`），Hono 的 valid 类型链没接住。临时解是在 handler 里 `as z.infer<typeof schema>`——**但这是 workaround，不是根治**。
更正的做法有两种，留给后续批次评估：
1. 降级 `zod` 到 v3（与 zod-validator 0.9 类型最稳），但 v4 是新标准，降级代价大；
2. 自己封装 `v.json`，在中间件里把校验结果挂到 `c.set('validJson', data)`，handler 从 `c.get('validJson')` 取——类型可控，且不依赖 Hono valid 链。
当前 B1 用 `as` 能跑且 middleware 已做运行时校验，安全；但 B2 起若频繁遇到，建议直接走方案 2 重构 `validate.ts`，一劳永逸。

### B1-R3. 专用 401 码不是"啰嗦"，是安全语义
`login` 的 1001（密码错）与 1005（禁用）刻意区分：前者"不暴露账号是否存在"，后者"禁用但账号确实存在却不让登"。若统一成 1001，攻击者就无法区分"账号是否被注册/禁用"——这正是契约铁律的用意。
测试里对 `1001/1003/1004/1005` 逐一支断言，等于把"专用码未被统一化"变成**机器验收**（批次门禁 4）。这比人工 code review 可靠：将来若有人"好心"合并错误码，测试立刻红。

### B1-R4. 测试文件 >200 行必须拆
B1 初版 `auth.test.ts` 252 行，踩到规范红线。拆成"注册/登录"与"刷新/me/登出/回调"两份后，单文件 ≤200 且阅读动线更清晰（一份看准入、一份看会话生命周期）。**经验：测试也是代码，同样受 ≤200 行约束，不要因为"测试无所谓"就堆长文件。**

### B1-R5. nullable 唯一索引的"假唯一"
`email` 列可空 + `UNIQUE` 索引，SQLite 允许多行 `NULL` 共存。注册 `email` 必填故等价非空唯一，但**若未来允许 email 为空，两个空 email 用户不会冲突**——这是潜在坑，已在 NOTES 点明，B5 涉及 email 唯一性时务必记得此语义。

---

## B1 审阅修复（2026-08-25 晚，P2 收口）

> 审阅 4 项 P2 全部收口：P2-1 真修、P2-2 修契约散文、P2-3 改注释、P2-4 保留（审阅认定非缺陷）。

### B1-F1. 并发唯一冲突不能靠"先查后插"兜底，必须 try/catch 收口
查重 `select` 与 `insert` 之间存在 TOCTOU 窗口：两个并发同键请求可同时过查重，其一插入命中唯一约束。优雅做法是把 `insert` 包 `try/catch`，捕获底层 `SQLITE_CONSTRAINT_UNIQUE` 后收敛成契约约定的 409/3002。**教训：任何"先查后写"的查重逻辑都只是快乐路径优化，真正的约束兜底必须落在 DB 抛错的那一层。** 顺手把"识别唯一约束错误"抽成 `src/lib/db-error.ts` 的 `isUniqueConstraintError`——B2 文章 slug 唯一冲突等同样会用到，复用优先于就地嗅探字符串。

### B1-F2. 识别底层驱动错误要零 `any` 又不能宽松
`isUniqueConstraintError(err: unknown)` 不能 `err as any`，而是用 `'code' in err && typeof === 'string'` 结构化判定，再比对白名单 `['SQLITE_CONSTRAINT_UNIQUE','SQLITE_CONSTRAINT']`。这既满足 biome `noExplicitAny`，又对"无 code 的非 Error 异常"安全返回 false（不会误判）。**经验：跨驱动的错误识别，结构化收窄比 `any` 强转稳。**

### B1-F3. 契约散文矛盾也是真缺陷，且会跨端传染
P2-2 中 refresh"令牌缺失"在描述写 1003、在示例/共享组件/代码写 1004。代码其实是对的（与示例一致），但描述散文会误导 Go/M3 等后续端实现者。修复只动描述散文、不改 schema，复跑契约双门禁确认零回归。**经验：对冻结契约基线的"非语义散文纠错"是允许的，但必须复跑结构门+语义门证明没动语义；这是"变更先改 OpenAPI 再改实现"纪律的延伸。**

### B1-F4. 注释随契约演进而 stale，是沉默的技术债
P2-3（测试"501 占位"实为 500）与 auth.ts 头注释"首波返回 501"都是 B0 把契约 501→500 后没同步的残留。这类 stale 注释不报错却误导，属于"只在散文"类缺陷的近亲。**经验：凡改契约语义，grep 全仓相关文案（注释/文档/测试描述）一并更新，别只改代码。**

---

## B2 文章核心批次（2026-08-25 晚）

> 11 端点全部落地；门禁 tsc/biome/vitest 全绿；51 测试（B2 新增 18：articles 10 + articles-admin 8）。B1 第二轮复审批复正式放行本批次。

### B2-R1. 写操作 `.run()` 与读操作 `.all()` 的 Drizzle 分野（最值钱的坑）
`create` 端点用了 `.returning().all()` 一直正常，让人误以为所有写都能 `.all()`。实际 Drizzle better-sqlite3 里：`SELECT` 与 `INSERT...RETURNING` 才返回行集（`.all()`），而 `UPDATE...SET` / `INSERT...VALUES`（无 returning）是写语句，必须 `.run()`。`.all()` 在写语句上抛 `This statement does not return data. Use run() instead`，**且只在运行时暴露**——tsc、biome、契约双门全拦不住，只有 vitest 抓到。B2 的 `submit/view/update/delete/approve/setStatus` 共 7 处写语句全部踩中，统一改成 `.run()`。**铁律记死：写 `.run()`、读 `.all()`、要回读 `.returning().all()`。** 这比"记住某次报错"更稳，因为后续 B3/B5 写操作一多极易复发。

### B2-R2. JWT 角色是"登录快照"，提权必须先于签发
`authMiddleware`/`guard` 直接读 `claims.role`，登录后改库里的 `role` 不会反映到已签发的令牌。测试里若 `tokenOf`（登录）后再 `elevate`（改库），令牌仍持旧 `member` 角色，admin/editor 受保护端点必 403。**因此任何"提权后再发请求"的用例，顺序必须是 `register → elevate → tokenOf`（elevate 在 login 之前）。** 这条对"用直接改库模拟提权"的测试套路是普适约束，B3/B5 写权限测试时照做。

### B2-R3. 测试 `tokenOf` 必须自包含（先 register 再 login）
早期 `tokenOf` 只 `login`，但用例从未 `register` 该用户名 → `login` 命中"用户不存在→1001→`data:null`"，连累 `r.data.accessToken` 抛 `TypeError`。修正为 `tokenOf` 内先 `register`（409 可忽略）再 `login`，幂等且自包含。**经验：测试 helper 不要依赖"调用方先做了某步"，把前置动作收进 helper 内部，调用处才不会漏。**

### B2-R4. 共享 `:memory:` 库的用例污染
`setup.ts` 每测试文件建一份内存库，文件内用例共享。计数断言（`total === N`）会被前置用例的文章干扰。B2 两测试文件各自加 `beforeEach` 重建全新 `:memory:` 库并 `migrate`，用例间零污染。**经验：路由/状态类测试默认每用例重建 DB，比"相信文件内顺序"稳得多；也避免 test 间隐含时序耦合。**

### B2-R5. 领域规则正确 ≠ 测试假设正确
「公开列表仅返回 published」「关键词过滤」两测试最初以 member 创建 `status:'published'`，被 `resolveNewStatus` 降级成 `pending`，公开列表 0 条。这是**测试假设**（"member 能发 published"）与领域规则（"member 不可自发布"）冲突，领域规则本身正确，改的是测试（改用 admin 创建已发布）。**经验：测试失败时先确认"挂的是断言还是领域规则"，别一红就改实现——很可能错的是测试的假设。**

### B2-R6. slug 部分唯一索引的"伪唯一"是特性不是 bug
`uniq_article_slug` 建在可空 slug 列，SQLite 允许多行 `NULL` 共存 → 天然"部分唯一索引"，软删后 slug 释放可复用（与 B1-R5 的 email 可空唯一是同一机理）。B5 涉及附件/评论唯一性时复用此认知：**可空唯一索引对 NULL 不冲突，是预期行为，不是缺陷。**

---

## B2 复批修复（2026-08-25 深夜）

> 后端架构师首轮裁定 B2 不通过：1 项 P1（/view 去重返回 500）+ 3 项 P2。全部确证真修复、零回归，复批放行 B3。复盘这次"门禁全绿却漏 P1"最值钱。

### B2-R7. 门禁全绿 ≠ 没缺陷：去重"冷却"不能靠 created_at 范围判断
`/view` 去重的唯一约束是**永久**的 `(article_id, dedup_key)`，而 24h 冷却却靠应用层 `createdAt >= now-24h` 范围判定。24h 后旧记录仍在 → 再插同 key → 撞永久唯一约束 → 无 catch → 500。对真实博客，几乎所有"24h 内看过一次"的回访流量都 500。**根因是"把冷却语义放在错误的地方"：冷却应编码进 key（如 `baseKey#floor(now/24h)`），而非依赖 `created_at` 范围。** 改后 `dedupKey` 含时间桶，冷却过桶号变化 → 不再撞旧记录 → 500 根除；同窗口并发才靠 `isUniqueConstraintError` 兜底。同构经验：任何"窗口/冷却/限频"语义，优先进**键**或**计数桶**，别用"查时间范围"去模拟——范围查询和唯一约束会打架。测试当时只覆盖"测试内连续两次"，没覆盖"24h 后"和"并发"，所以门禁全绿照漏。**经验：补测试要专门打"边界时刻 + 并发"，否则门禁只是"能编译 + 正常路径对"。**

### B2-R8. BE11 列表 DSL 文章在本项目是真有用，不是摆设
复批对照用户《BE11 通用列表查询 DSL》文章，补了两道该文明确主张的护栏：(1) **DB-01 scanLimit**——keyword 模糊搜索的 count 必须封顶（本项目 `SCAN_LIMIT=2000`，用 `.select({id}).limit(2000).all()` 取长度，类型安全且语义与子查询 count 封顶等价；注意 better-sqlite3 Drizzle 无顶层 `db.get()` 裸 SQL，别臆测 API）；(2) **投影**——列表只 `select` 摘要列，不拉 `content` 长文本（新增 `ArticleSummaryRow` Pick 类型，`toArticleSummary` 签名收窄，详情接口仍走完整 `toArticle`）。文章"白名单优于黑名单""base 永远 AND""MAX_SIZE 封顶"三条 B2 本就做对了（给 credit）。**判断：本项目公开列表只有 4 个固定维度，不上通用 `field__op` DSL 是对的（避免过度下沉）；但 B3+ 后台列表（用户/评论/订单类）一多，就该抽 `buildListQuery` 纯函数 + `runList` 执行器把白名单/scanLimit/投影/base AND 一次性收口，`queryArticles` 迁移为特例。** 这条是"用户文章 → 本项目落地"的示范，值得在 B3 评审时复述。

---

## B3 分类 / 标签批次（2026-08-25 夜）

> 11 端点全部落地；门禁 tsc/biome/vitest 全绿；68 测试（B3 新增 14：categories 9 + tags 5）。B2 第二轮复审批复正式放行本批次。

### B3-R1. Drizzle 自引用 FK 会让生成类型"成环"，自关联树别用 `.references`
`categories.parentId` 若写成 `.references(() => categories.id)`，TS 推断时 `categories` 在自身初始化器内被引用 → `TS7022` 隐式 any，并连带下游 insert 链报 `DrizzleTypeError(".all() cannot be used without .returning()")`（类型崩坏后 `.returning().all()` 也判错）。**经验：无限级自关联树（parentId 指向自身）不要在 schema 里声明 `.references`**——SQLite FK 默认不强制，父存在性/成环/级联由应用层保证（本项目删除守卫已查子节点与文章引用）。同理 `articleTags` 引用 `articles/tags`（已定义表）则正常，只有"指向自身"才成环。迁移 raw SQL 的 `FOREIGN KEY` 子句同步去掉，保持 schema 单一事实源一致。

### B3-R2. 树/环/深度/面包屑都是"先取全量再纯函数算"
`buildTree` / `wouldCreateCycle` / `depthOf` / `toBreadcrumb` 全部吃**全量分类数组**做纯函数（无 DB 调用），好处：可单测、可组合、删除/更新时一次 `allCategories()` 复用。深度与成环都在"变更 parentId 之前"用这份全量校验，避免 N 次递归查库。**经验：自关联树的运算别在 SQL 里递归（SQLite 无 CTE 递归友好生态），一次取全量在内存里算，万级数据内毫无压力，代码还更易测。**

### B3-R3. 删除守卫用"引用存在即拒"（x-cascade: none）而非"先查后删"
分类/标签删除前先查"有没有子节点 / 有没有文章(关联)引用"，有则 409（3002）拒绝；无则硬删。这是契约 `x-cascade: none` 的语义（不让后端替调用方级联），也避免悬空 `parent_id` 或孤儿中间表行。**注意：查引用要用 `isNull(deletedAt)` 排除软删文章，否则已删文章仍算"引用"会误拒。** 标签则查 `article_tags` 关联行（该表本身无软删概念）。

### B3-R4. articleCount 走"关联表 JOIN 已发布文章"才是精确计数
`Tag.articleCount` 由 `article_tags` JOIN `articles`（仅 `status='published' AND deleted_at IS NULL`）`GROUP BY tag_id` 得到，彻底告别 B2 的 `articles.tags` JSON 子串匹配（B2 P3 的 tag 子串误匹配根源）。**本批按 B3「禁止项」未引入"文章打标签"写入入口，故 junction 暂空、计数自然为 0**；计数是"前向兼容"设计——待 B2/B4 增强文章提交时同步 `article_tags`，articleCount 自动生效，本批零改动。测试用白盒直插 `article_tags` 验证聚合正确性（含"草稿不计入"断言）。**经验：计数/统计类字段优先从规范关联表聚合，别从去规范化 JSON 里 substring；即便当前上游未回填，查询层先就位，回填只是数据问题。**

### B3-R5. 测试提权顺序 + 共享内存库 仍是铁律（与 B2-R2/R4 一致）
B3 写权限测试严格沿用 `register → elevate → tokenOf`（elevate 必须在 login 前，因 JWT 角色是登录快照），每用例 `beforeEach` 重建 `:memory:` 库防污染。**新增认知：断言删除守卫时，要先想清"引用到底还在不在"**——初版测试把"有文章引用的目录"再次删除期望 200，忘了引用仍在 → 假绿转红；拆成"有子节点 409 / 有引用 409 / 干净叶子 200"三个独立用例才稳。

### B3-R6. 单文件 ≤200 行是硬门禁，超限要主动拆分而非硬挤
初版 `routes/categories.ts` 实写 **235 行**（>200 铁律），险些随自验报告一起漏报。正确做法是按"公开读 vs editor 写"职责切分：`categories-read.ts`（75 行，4 个 GET）+ `categories-write.ts`（192 行，3 个写端点），二者在 `app.ts` 同挂 `/api/v1/categories`，`allCategories` 抽到 read 侧由 write 复用。**教训：自验收尾必须 `wc -l` 过一遍所有新文件**，门禁清单里补一行"文件粒度"，不让行数超限悄悄溜过复验。




### B3-R7. 复批 P2-1/P3-1：移动子树深度要算子孙高度，buildTree 要防数据环
B3 复批（2026-08-25 晚）指出两处：P2-1 变更 parentId 仅校验 `depthOf(新父)+1`（被移动节点自身新深度），漏算其**子孙子树高度**——把「A(深3)→B(深4)」挂到另一深3节点下，A 变4、B 变5 越过 x-max-depth:4；P3-1 `buildTree` 递归无 `seen` 集，数据腐化成环会死循环。
修复：`lib/category.ts` 增纯函数 `subtreeHeight(rows,id)`（含自身、单节点=1）；`categories-write.ts` PUT 校验改为 `depthOf(新父) + subtreeHeight(被移动节点) ≤ MAX`；`buildTree` 递归内持 `seen` 集命中自身即截断。`test/lib/category.test.ts` 锁两修复 + `test/routes/categories.test.ts` 增「移动带子孙的子树使子孙超界 → 409」集成测试（含「叶子移到同深父允许」正对照）。
**核心认知**：x-max-depth 约束的是「树中任意节点深度」，移动子树时整棵被移子树的底最深节点都会跟着下沉，必须按子树高度整体校验，不能只看被移根。同时「交付说明过度声称已覆盖」是 P2-1 的放大器——不采信自陈不仅针对门禁，也针对 NOTES 的措辞。

### B3.5-R1. article_tags 从死表变生效：写同步 + 存量回填双路
B3.5（2026-08-25）：B3 建了 `article_tags` 但全代码零 INSERT，是死表。本批补两条写入路径：
(1) 写同步——`lib/article-tags.ts` 的 `syncArticleTags(articleId, names)`：清旧 + 按 `slug==name` 解析出的已存在 Tag.id 覆盖插（`onConflictDoNothing`），create/update/软删均接入（软删一并清关联）；仅链接已存在 Tag，不自动建 catalog 标签（越权）。
(2) 存量回填——`scripts/backfill-article-tags.ts` 包装 `lib/article-backfill.ts` 的 `backfillArticleTags(db)`，扫未删文章 `parseTags`→`resolveTagIds`→`INSERT OR IGNORE`，依赖唯一索引幂等可重跑；运行方式选「部署后由人跑一次」（`pnpm backfill`），D1 走 `wrangler d1 execute` 等价 SQL（脚本注释给出）。
**核心认知**：去规范化 JSON 字段（articles.tags）与关联表（article_tags）并存时，必须有一个「规范写入入口」否则关联永远落后；回填脚本是存量债的一次性清偿，增量靠 create/update 同步，二者共用 `resolveTagIds` 保证语义一致。

### B3.5-R2. 列表标签过滤切 JOIN + 排序歧义修复
`lib/article.ts` 的 `queryArticles` 把 `q.tag` 从 `articles.tags LIKE` 改为 `article_tags innerJoin` 精确匹配；无对应 catalog 标签直接返回空列表（关 B2 P3 子串误匹配，如 `js` 误命中 `json`）。
连带坑：`from(articles)` 再 `innerJoin(articleTags)` 后，`created_at`/`published_at`/`id` 出现歧义列，`buildSortSql` 的排序片段（含默认 `-publishedAt`→`COALESCE(published_at, created_at)` 与稳定键 `id DESC`）报 `ambiguous column` 500。修复：`pagination.ts` 的排序列统一加 `articles.` 限定（含 `articles.id DESC`）。
**核心认知**：凡在查询里 `JOIN` 同名表（都有 `created_at`/`id`），所有裸列引用（尤其 ORDER BY 与聚合）都必须显式限定基表，否则只在 JOIN 分支偶发 500。

### B3.5-R3. articles.ts 拆分（358→123+147）与共享逻辑下沉
按「公开读 vs 登录写」拆为 `articles-read.ts`(123) + `articles-write.ts`(147)，`app.ts` 同挂 `/api/v1/articles`。写侧四端点各自带权限/状态/标签同步逻辑，强拆会迫使 slug 校验/状态解析/标签同步在 files 间重复，故下沉到 `lib/article-mutation.ts`（状态/slug 解析 + `createArticleRow`/`updateArticleRow`）+ `lib/article-tags.ts`，路由退化为薄委托层。`articles-write.ts` 147 行 < 200，达标。
**核心认知**：200 行铁律不是「每个文件都拆到 200 内」的教条，而是「超出要有可辩护理由或已抽出共享层」；本批把重复逻辑抽到 lib 后路由自然瘦身，比机械切两半更稳。

### B4-R1. 评论默认态冲突：以冻结契约为准，任务包"默认 reviewing"被覆盖
B4（2026-08-25）：任务包 `04-comments.md` 写"会员投稿默认 reviewing"，但**冻结契约** `Comment` schema 与 `createComment` 描述明确"自动流只产出 approved / rejected，reviewing 仅由 PATCH 人工置位"。项目纪律"实现不得偏离契约"优先，故发表走敏感词自动流 → approved/rejected，reviewing 仅 PATCH 进出。任务包口径视为被契约取代，已在 B4-NOTES 登记偏差。
**核心认知**：当批次任务包与冻结契约表述冲突时，契约是单一事实源，偏差要在 NOTES 显式登记而非默默二选一，否则复验者无从判断意图。

### B4-R2. 敏感词过滤"等长城号 + 比率阈值"双动作
`lib/comment.ts` 的 `moderateContent`：命中词整体替换为等长 `*`；算违规比率 `命中字符数/原文长度`，>0.3 → rejected 否则 approved。存库即转义后展示文本，原文不落库。阈值 0.3 为可解释默认：短评论命中即易超阈，长评论零星命中仍放行。
**核心认知**：自动审核不要二元"有脏词即删"，用"比率"区分偶发口误与刷屏广告；展示层先转义再存，避免回显原始违规文本。

### B4-R3. ownerOverride + 404 的协作：先 loadComment 再 guard
`DELETE /comments/:id` 用 `loadComment` 中间件预载评论到 `c.set('comment')`，缺失直接 404；`guard('editor', c => String(cm.userId))` 据此判归属。若先 guard 后查，缺失资源会错返 403 而非契约规定的 404——顺序决定错误码正确性。
**核心认知**：x-authz 的 ownerOverride 与"资源存在性 404"是两个正交关注点；用预载中间件把存在性检查提前，guard 只管归属，错误码才不会被串台。

### B4-R4. 边界守约：评论批次不碰 articles.ts
B4 严格按复审要求"不碰 articles.ts"。5 端点集中在新建 `routes/comments.ts`（约 185 行 < 200），于 `app.ts` 另挂 `/api/v1`，藉 `/articles/:idOrSlug/comments` 子路径复用 articles 路由前缀而不改其文件；公开评论列表的"未发布文章匿名 404 / 作者-admin 可见"复用 `articles.deletedAt/status/authorId` 只读判定，零写入。

### B4-R5. 审阅后修复：拆文件守 200 行 + ownerOverride 机制纠偏 + 去重查
B4 首轮交付因 Bash 故障漏跑门禁，暴露两处真实问题：① `comments.ts` 实长 219 行 > 200 铁律，且 NOTES 自报"≈185 行"与磁盘不符；② 实现用了 `loadComment` 中间件 + `c.set('comment')` 自定义变量，破坏 `AuthVars`（仅声明 `user`），该写法在下一轮修复轮已被剔除、改用 `guard('editor', resolveCommentOwner)`。本次（2026-08-25 审阅回复）据此整改：
- 拆 `comments.ts`(219) → `comments-read.ts`(72, 2 GET) + `comments-write.ts`(127, POST/DELETE/PATCH)；共享 `resolveArticle`/`userNameOf` 抽 `lib/comment-query.ts`(40)。路由文件均 ≤200，复用 articles/categories 现成范式。
- ownerOverride 机制（**取代 B4-R3 的 loadComment/c.set 描述**）：`DELETE` 用 `guard('editor', resolveCommentOwner)`，`resolveCommentOwner` 加载评论、缺失抛 404、返回 `String(cm.userId)` 供 `guard` 比对；不引入 `c.set('comment')`（否则破坏 `AuthVars` 类型）。
- P3-2 去重查：`DELETE` handler 不再 `select` 重查存在性，改复用删除 `run()` 的 `res.changes === 0` 兜底 404（editor 路径 guard 短路不调 resolveCommentOwner，由 changes 判定）。少一次 SELECT，行为不变。
- P3-1 补 2 例 parentId 测试（指向不存在 / 他文评论 → 404）。
**核心认知**：200 行铁律靠"自陈已守"会滑坡，必须以独立 `wc -l` + 独立复跑门禁为准（"不采信自陈"）；`c.set` 自定义变量是 Hono 类型反模式（破坏 AuthVars），ownerOverride 优先用 `guard` 的 `resolveOwner` 闭包传值，而非往上下文塞自定义 key。

### B5-R1. 用户 / 资料 / 上传批次（11 端点）
B5 严格按 `05-users-upload.md`：users 管理（admin 列表/详情/PATCH 升 editor）、`me` 资料 + 改密码、公开 `members/{id}` 脱敏主页、`upload` + 附件管理。
- **角色边界**：用户管理端点全 `guard('admin')`，editor 自然被拒（与 §3.3 一致）；`PATCH /users/{id}` 可改 `role/status/level`，admin 经此升 member→editor。
- **脱敏**：`GET /members/{id}` 仅返 MemberProfile（id/nickname/avatar/level/articleCount/articles），不含 email/passwordHash/role/status；`disabled` 会员 404 防枚举；`me/profile` 与 admin 列表/详情返完整 User（含 email）。
- **双存储**：`POST /upload` 经 `createStorage(env)` 落 `attachments` 表，`storage` 记实际后端、`storageKey` 仅供删除定位（不进响应）；local 兜底落 `./uploads`，url=`/files/{key}`；R2 分支 Node 测试抛错（D10/B10 deferred）。
- **删除附件**：`guard('editor', resolveAttachmentOwner)`（member 须本人），`res.changes===0` 兜底 404；底层 `storage.delete` 尽力执行、失败不阻塞行删（双存储真实边界）。
- **幂等号**：沿用 B4 的 `changes===0` 兜底 + `resolveOwner` 抛 404 模式，未引入 `c.set`。
- **文件校验**：multipart 在信任边界手动校验（类型白名单 + 10MB），不合法 → 4001 `data.errors`。
- **门禁（自跑）**：tsc 0 / biome 0（69 文件）/ vitest 104 passed（B5 14 例）/ 契约双门 OK（openapi.v1.yaml 未动）。
- **新增**：`attachments` 表（schema+migrate）；`lib/attachment.ts`；`routes/users.ts`(87)/`users-admin.ts`(47)/`me.ts`(119)/`members.ts`(59)/`upload.ts`(148)；`test/routes/users.test.ts`；`node-backend/.gitignore`（`/uploads/`）。
- **结论**：11 端点全实现，门禁全绿，待总把控复验后进 B6（收藏/历史/点赞/通知）。

### B5-R（P3 整改，用户要求优化后补）
审阅报告 `review/B5-后端代码审阅报告.md` 裁定放行 B6，并给 5 项 P3。用户要求逐项优化，全部真修：
- **P3-1**：新增 `routes/files.ts`(52) + `app.ts` 挂 `app.route('/files', filesRoute)`；仅 `STORAGE_DRIVER==='local'` 直出 `./uploads/{key}`，`SAFE_KEY` 防路径遍历；生产 r2 直接 404 不服务。本地预览上传素材不再 404。
- **P3-2**：`members.ts`(59→37) 弃 `.all()` 全量，改复用 `queryArticles({c,authorId,forcedStatus:'published'})`；`articleCount` 取 `page.pagination.total`。
- **P3-3**：`upload.ts` 内 `parseUpload` 单次 `parseBody` 一并返回 `articleId`，删 POST handler 二次 `parseBody`；`form['x']`→`form.x` 清 biome info（148→150）。
- **P3-4**：`users.ts`(87→116) PATCH 加双护栏——① 自我护栏：对自身做 role/status 变更 → 403(FORBIDDEN 2001)；② 最后 admin 保护：被操作者为 admin 且将失去 admin/被禁用、活跃 admin ≤1 → 409(CONFLICT 3002)。纯 level 变更不受限。
- **P3-5**：`files.ts` 对 svg 强制 `Content-Disposition: attachment` + 统一 `X-Content-Type-Options: nosniff`；CDN 侧策略另行运维配置。
- **门禁（自跑）**：tsc 0 / biome 0（70 文件，0 info）/ vitest **108 passed**（B5 18 例，P3 新增 4）/ 契约双门 OK（openapi.v1.yaml 未动）。
- **回复文档**：`review/B5-代码审阅-回复.md`（仿 B4 回复格式：逐项回应 + 门禁表 + 文件清单）。

### B6（收藏/历史/点赞/通知，15 端点）
- schema 新增四表 `favorites`/`view_history`/`likes`/`notifications`（均为 `(user_id, …)` 唯一或 owner 限定）；migrate 补对应 DDL + 3 唯一索引。
- 路由拆 4 文件（铁律 ≤200）：`favorites.ts`(103) / `history.ts`(152) / `likes.ts`(163) / `notifications.ts`(108)，`app.ts` 同挂 `/api/v1`。
- 关键：收藏/点赞写入幂等（onConflictDoNothing / 查存后写）；history upsert 唯写路径（progress 仅携带时覆盖）；`articles.like_count` 应用层维护与 likes 行数一致；like/status 公开（匿名 liked=false）；PATCH 通知非本人 → 404（不泄露存在性）。
- 契约侧观察（登记不改）：`GET /me/likes` 响应为裸数组但声明 page/pageSize 参数（不一致），按契约返裸数组+limit/offset 截断；`schema.ts` 336 行超 200 软上限但属「全表单一事实源」，沿用 B2–B5 先例不拆（如需拆可单独立项）。
- **门禁（自跑）**：tsc 0 / biome 0（77 文件）/ vitest **116 passed**（B6 行为级 8 例 + 存量 108）/ 契约双门 OK / **未改契约**。
- 交付：`docs/node-backend/B6-NOTES.md`；测试 `test/routes/interactions.test.ts`（8 例）。
- 通知生成端（文章发布/评论审核 → 写 Notification）不在本批（任务包禁止项），留对应业务批次或后续补。

### B6-R（审阅整改，P2-1 / P3-1 / P3-2 清零）
审阅 `review/B6-后端代码审阅报告.md` 裁定通过、放行 B7，建议先清零 P2-1。整改：
- **P2-1（likeArticle 并发 500 + like_count 漂移）**：`likes.ts` 的 `likeArticle` 由「查存后裸 insert + 应用层读改写 +1」改为 `onConflictDoNothing()` + `res.changes>0` 才原子 `sql\`like_count + 1\``；`unlikeArticle` 改原子 `CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END` 下限夹 0。并发双发不再撞 `uniq_like` → 500，`x-idempotent` 在 DB 层真成立。
- **P3-1（history upsert 竞态）**：`history.ts:reportReadingProgress` 由「查存后 insert」改 `insert … onConflictDoUpdate({ target:[userId,articleId], set:{lastReadAt, progress?} })`，progress 仅请求携带时覆盖，与旧语义一致。
- **P3-2**：已并入 P2-1（原子 ±1）。
- **P3-3 / P3-4 / P3-5**：非阻塞，无代码改动。P3-3(`/me/likes` 契约参数/响应矛盾) 与 P3-5(NOTES §六 自陈过度：实际仅 addFavorite/removeFavorite/likeArticle/unlikeArticle 标 x-idempotent，clearMyHistory/removeHistoryItem 未标) 留**契约维护批次**统一；P3-5 已同步纠正 `B6-NOTES.md` §六。P3-4(`schema.ts` 336 行) 沿用「全表单一事实源」先例不拆。
- **门禁（自跑）**：tsc 0 / biome 0（80 文件）/ vitest **117 passed**（B6 行为级 9 例 + 存量 108，新增并发双发回归测试稳定 3/3）/ 契约双门 OK / **未改契约**。
- 交付：`review/B6-代码审阅-回复.md`；`test/routes/interactions.test.ts` 增并发回归测试。
- 结论：B6 全部实质性问题清零，放行 **B7（辅助接口 / 站点，07-*.md）**。

---

## B7 辅助接口 / 站点批次（2026-08-26，简述）

> 本批次落地 辅助接口（adjacent / related / toc / breadcrumb / categories-stats / stats / search + like / notifications 端点）与 站点配置（SiteSetting：`GET /site/settings` 公开 + `GET/PATCH /admin/site/settings` admin）。
> 详细逐决策 reasoning 未在本窗口内捕获（属早期开发），这里只记已验证结论，深推演见 `docs/node-backend/B7-NOTES.md`。
> **门禁（自跑）**：tsc 0 / biome 0 / vitest **126 passed**（B7 行为级 9 例 + 存量 117）/ 契约双门 OK（openapi.v1.yaml 未动）。
> 后端架构师独立复验结论：**功能验收通过、冻结暂缓、待调优（未冻结）**——即"功能完备 ≠ 可冻结"，目录结构与组织风格需先经 owner 视觉确认。

---

## 结构调优 · 水平分层重构（2026-08-26）

> 触发：用户作为 master coordinating AI，与 统筹AI + 后端架构师AI 协作产出 `04-目标目录结构.md`（水平分层 routes/services/shared/types）+ `05-结构调优任务包.md` + `03-统筹AI复审批复.md`。开发 AI 据此施工，统筹 AI 独立复验门禁证据。
> **两条绝对铁律**：① 零行为变更（只移动/重命名/抽层，**不改任何请求-响应与领域规则**）；② 契约只读（`docs/api/openapi.v1.yaml` 字节级零变更）。

### T-R1. 分层边界是"职责边界"不是"目录装饰"
重构把 `src/lib/*` 拆进三层，每层有清晰禁令：
- **routes（薄）**：只解析参数、调 service、包信封。**禁止 `getDb` / 写查询 / 写业务规则**。
- **services（领域 + DB）**：承载查询、事务、领域规则。**禁止拼 HTTP 响应**（返回领域对象/DTO，由 routes 包信封）。
- **shared（基础设施）**：`storage` / `jwt` / `config` / `db-error` 等。**禁止引 services、禁止查库**。
- **types（共享类型）**：`AuthVars` / `AuthUser` / `ErrorCode` / `Envelope` 等纯类型。
**核心认知**：分层重构的价值不在"文件挪了窝"，而在"每层能说什么不能说什么"被机械强制；routes 一旦碰 `getDb`，单测就必须起 DB，分层即破产。门禁里加一条隐式校验——`grep routes -l getDb` 必须空。

### T-R2. 机械迁移安全的前提：lib 内部零相对导入
全局把 `src/lib/*` → `src/{services,shared}` 能安全做，前提是 lib 内部**全部用 `@/` 或 `./` 同目录**，没有 `../../` 跨目录引用。若有相对引用，移动文件会牵一发动全身且 tsc 不即时报错（要到具体引用处才爆）。**经验：`@/* → ./src/*` 别名 + 相对引用仅限同目录，是大规模重命名的保险丝；迁移前先 `grep '\.\./\.\./'` 确认零命中。**

### T-R3. `@/` 别名已在 B0 审阅修好，本批直接受益
B0 审阅 R2 已把 `baseUrl` 删除、只留 `paths`，vitest 侧 `resolve.alias['@']` 对齐。结构调优大量移动文件却零引用断裂，正是这条纪律的红利。**印证：架构债务（如路径别名坑）早还，后面的大重构才不崩。**

### T-R4. 循环依赖要提前识别，不是等 tsc 报
`comment.ts` ↔ `comment-query.ts` 一度出现循环引用风险（comment 路由要查评论、query 层要依赖 comment 类型）。**经验：抽层时先画"谁依赖谁"的箭头，A→B 且 B→A 的环要在动手前用"类型与实现分离"或"下沉到 shared"解开，别等 50 个文件移完 tsc 才报环。**

### T-R5. 单文件 ≤200 的"硬"与"软"
routes 严守 ≤200（薄层天然短）；services 因含多领域函数易超 200，采用"注释例外"——在 `NOTES §四` 标注真实行数并说明不拆理由（如"全表单一事实源"先例）。**核心认知：200 行是"超出要有可辩护理由"，不是机械切两半；routes 必须硬守（薄），services 可软守（有理由）。**

### T-R6. 五门门禁是重构的"安全带"
tsc0 / biome0 / vitest126 / 契约结构门 OK / 契约语义门 33 OK。**核心认知：零行为变更重构的唯一可信证据就是"五门全绿 + 契约字节级 diff 为零"**——任何一门红或 yaml 被动，就是行为被悄悄改了，立刻停手回查。

---

## 结构调优 review（P3 修订 + 分拆合并，2026-08-26）

> 审阅 `review/B-结构调优-后端代码审阅报告.md` 裁定：5 项 P3 非阻塞（可冻结前置）。逐项落实。

### T-R7. P3 不是"小问题"，是文档债的显影
P3-2/3/4 全是注释/文档不精确（services 例外注释漏 3 处、`NOTES §四` 真实行数未标、`types` 措辞含糊）。**经验：重构动的不是代码是结构，重构后的"描述结构的话"比代码更易 stale；P3 类问题本质是"代码改了、说代码的文字没改"，必须 grep 同步。**

### T-R8. 分拆是"超 200 行"的应激，行数降下来就应收回
早期 `categories` / `comments` 因超 200 行拆成 read/write 四文件。结构调优后两文件都变短（categories ~89、comments ~102），分拆反而增加阅读跳转成本。**决策：合并回单文件 `categories.ts` / `comments.ts`，`app.ts` 改单挂，删 4 个分拆文件。** 用 AskUserQuestion 先确认合并方向再动手——因为"删文件"是破坏性操作，且涉及 routes 挂载方式变更，owner 确认优于 AI 自作主张。**核心认知：分拆/合并都是手段，目标是"每文件一个清晰职责且不过长"；行数回落时应主动回收过度分拆，别让历史应激变成永久结构噪音。**

---

## 结构调优 · 崩溃重做（2026-08-26）

### T-R9. "跑崩溃了"先信证据，不信自陈
用户反馈"你刚把自己跑崩溃了"。复跑 biome 仅修复格式化（`.post(` / `.put(` 多行折叠，89→77 行是 biome 折叠非逻辑丢失），端点逻辑实际完整。但仍不轻信——**对"自陈已正常"保持怀疑，以 `wc -l` + 独立复跑门禁 + 实际请求抽查为证。**

### T-R10. 合并文件"不正确"时，以 services + 契约为事实源重建
用户指出 categories/comments 两合并文件"不正确，是崩溃时没处理好"。不猜哪行错，直接以 `src/services/*`（领域真相）+ `openapi.v1.yaml`（契约真相）为事实源**重建两文件**，排除任何残留。门禁全绿后确认干净。**经验：当"修过的文件是否真的对"存疑时，最稳的不是 patch，是"用权威源重写"——services 与契约就是后端的两份权威源。**

---

## 上传去重批次（06/07 → 08，2026-08-26）

> 用户先问"同图不同时间上传，服务器存两份还是一份？"——读 `storage.ts` 答：**两份**（`key = randomUUID()`，无内容去重）。用户随即给 `06-上传去重优化方案.md` + `07-上传去重-批次任务包.md`，评估合理 → 直接开干。

### U-R1. 内容寻址：key 从 randomUUID 改为 sha256(buffer)
`LocalStorage.put` 的 key 由 `randomUUID()` 改为 `sha256(buffer) + ext`；写入前 `get(key)` 命中即复用、跳过写盘。同字节内容天然去重（同图 N 次上传 → 1 份物理文件 + N 行 attachment 记录）。**核心认知：去重的"身份"应是内容哈希而非随机 ID；内容寻址是对象存储的通用范式（S3 ETag 同理），不是本项目发明。**

### U-R2. 删除用"引用计数护栏"消除孤儿文件（最值钱的坑）
`deleteAttachment(id)` 逻辑：同步事务内查行 → 缺失抛 `NOT_FOUND` → 删行 → 数同 `storageKey` 的兄弟行 `remaining` → **事务外**仅 `remaining === 0` 才 `storage.delete(key)`（catch 吞错）。**为什么不在事务内删物理文件**：better-sqlite3 事务只管 DB，文件系统删除失败应不影响行已删（双存储真实边界）；且物理删除是"尽力"，孤儿文件风险远低于"行在文件没了的不可用态"。**核心认知：DB 行是"真值"，物理文件是"缓存"；删除顺序永远"先真值后缓存"，引用计数决定缓存何时真正释放。**

### U-R3. better-sqlite3 的 transaction 必须同步回调（血泪坑）
初写 `await getDb().transaction(async (tx) => { ... })` → 抛 **"Transaction function cannot return a promise"**。改同步回调后又误加末尾 `()`（写成 `getDb().transaction(fn)()`）→ 事务根本没执行。最终正确写法：`const result = getDb().transaction((tx) => { ... return row })()`——**同步回调、末尾必须 `()` 触发执行、返回值即同步结果，不能在回调里 `await`**。
**经验：better-sqlite3 的 `transaction` 是同步 API 的语法糖，不是 async 事务；任何"事务里要 await"的需求（如跨存储删文件）必须挪到事务外。这条值得单独存 skill，新人必踩。**

### U-R4. 测试 FOREIGN KEY 与 ESM spy 的两处坑
- attachments.userId 外键指向 users，测试未建用户行 → 插入拒。修正：测试内先 `insert` 用户。
- `vi.spyOn(storage, 'writeFile')` 在 ESM 命名空间上不可行 → 改用 `vi.mock` 包 `writeFile` 间谍，断言"同内容仅写盘 1 次"。
**经验：外键测试遗忘用户行是老坑（B2-R4 同构）；ESM 下 spy 模块函数优先 `vi.mock` 而非 `vi.spyOn` 实例方法。**

### U-R5. 交付文档 08 记偏差与证据
`08-上传去重-交付文档.md`：改动清单（storage.ts / attachment.ts + 2 test）、grep 自验、五门门禁、契约零变更、6+1 测试、偏差说明（同步事务）。**门禁：tsc0 / biome0 / vitest 132 / 契约双门 OK。**

---

## 上传去重 review 修正（2026-08-26 下午）

> 审阅 `review/B-上传去重-后端代码审阅报告.md`。三项修正，其中 P2 属冻结前置（必须改）。

### U-R6. P2：缺失 id 静默 resolve→200 是契约违例，必须 404
初版 `deleteAttachment` 对缺失 id 走 `found` 标志静默返回成功（200 + data:null），违反契约"资源不存在即 404"。修正：去掉 `found` 字段，缺失直接 `throw AppError(NOT_FOUND, 404)`。**核心认知：删除类端点的"不存在"是 404 不是 200——200 会让调用方误以为"删成功了"，幂等语义错位；这跟 B4-R3/B5-R 的 `changes===0` 兜底 404 是同一铁律。**

### U-R7. P3-2：guard 工厂要区分"资源不存在"与"存在非归属"
原 `guard` 对 `resolveOwner` 返回 `null` 也返 403，但契约要求"资源不存在→404、存在但非本人→403"是正交两态。修正：全局 `null → 404`、`非 null 非归属 → 403`。`AuthUser` / `AuthVars` 从 `@/types/auth` 重导出，避免 routes 重复 import。`guard.test.ts` 新增 `GET /missing` 路由（`() => null`）断言 404，保留非归属者→403。
**核心认知：x-authz 的 ownerOverride 与"资源存在性 404"是两个正交关注点（B4-R3 已记）；guard 原语必须把"查不到"和"查到但不是我的"用类型区分（null vs string），否则错误码会串台。**

### U-R8. P3-1：孤儿竞态只文档化，不强行加锁
删除事务内删行后、事务外物理删除前，若并发同 `storageKey` 新上传 → 新行 committed、旧物理文件被删 → 新上传指向已删文件（瞬时孤儿）。评估：概率极低（引用计数已极大降概率）+ 加锁代价高（跨 DB/FS 分布式锁超出本项目范围）→ **仅注释文档化，不实现锁**。
**经验：不是所有竞态都要"修"，要先算发生概率与修复代价；罕见且可逆（下次访问 404 可重试上传）的竞态，文档化优于过度工程。这与项目"文章是产品、代码是素材"的克制基调一致。**

### U-R9. 越界文件零 diff 是"零行为变更"的硬证
修正后 `git diff` 收敛为 **4 文件**（auth.ts + attachment.ts + 2 test），schema/migrate/files/upload/yaml 全部零 diff。**门禁：tsc0 / biome0 / vitest 133 passed（126 + 6 去重 + 1 guard404）/ 契约双门 33 OK。**
**核心认知：每次"修报告里的问题"后，git diff 的范围本身就是证据——如果只动报告点名的文件、其他纹丝不动，说明没引入越界改动；若 yaml 被动了，立刻警觉"是不是又碰了契约"。**

---

## 当前状态（2026-08-26 收尾）

- M1 后端：**开发完成 + 结构调优完成 + 上传去重完成**，五门门禁全绿、契约双门 33 OK、yaml 字节级零变更。
- 状态：**待调优（未冻结）**——owner 需先视觉确认目录风格（routes/services/shared/types 水平分层）符合预期，**确认后才冻结**。
- 下一步路径：owner 确认 → 冻结 M1 后端主线 → 转「写 M1 后端文章」（M1-01~M1-30）。M2/M3/M4/M6/M7 五端复用"契约→主计划→批次任务包"工作流。
- 两处非阻塞遗留（统筹跟进，非本会话范围）：① `GET /me/likes` 契约内部矛盾（裸数组 vs page/pageSize）→ 排「契约维护批次」；② nullable 唯一索引「假唯一」→ 记入 Go/Python 跨端协调清单。
