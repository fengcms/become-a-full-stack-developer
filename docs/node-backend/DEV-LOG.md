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


