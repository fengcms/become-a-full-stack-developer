# M1 后端 · 结构调优（B-结构调优）— 代码审阅报告

> 审阅方：总把控（BackendArchitect）｜日期：2026-08-26
> 对象：`docs/node-backend/B-结构调优-NOTES.md` + 目标结构规范 `docs/node-backend/04-目标目录结构.md` + 实际代码（提交 `15f516d`「完成目录结构水平分层重构」、前置 `d0e309b`「新增共享工具与领域服务层代码」）
> 纪律：不采信自陈。凡自述均回磁盘取证（Read 源码 / `wc -l` / `git show --stat` / `git diff` / 独立跑门禁 / grep 铁律 token / 契约双门复跑）。
> 背景：owner 裁决「功能完备 ≠ 可冻结」→ 进入结构调优期（未冻结）。本批为对开发 AI 所出 `B-结构调优-NOTES.md` 的独立审查，目标是确认分层规范（Option 1 水平分层）是否真实落地、五门门禁是否真绿、铁律是否逐条遵守。

## 一、总览裁定

**审查通过（可放行，待 owner 确认目录风格后冻结）。** 无 P2 阻塞项；发现 5 项 P3 非阻塞问题，**其中 2 项属交付文档（NOTES）事实错误，须随本批复一并修正**。

核心判断：分层重构**实质到位且零行为变更**——
- routes 已真·薄化（抽参 → 调恰好一个 service → `ok/paginate` 格式化），经无歧义 token 扫描证明**零 Drizzle 查询/执行符**；
- services 承载了全部下沉逻辑（抽样 `services/likes.ts` 确认幂等点赞/原子计数/去重语义**完整保留**，非丢失或改写）；
- shared / types / db / middleware / config 边界与 04 规范一致；
- 五门门禁**独立复跑全绿**（tsc0 / biome 110 文件 0 / vitest 126 / 契约结构门 OK / 契约语义门 33 OK）；
- `openapi.v1.yaml` 字节级未改（diff 0 行）。

P3 问题均不阻塞代码冻结，但 NOTES §四的两处事实错误（尺寸低估 + "全部已标注 services 例外"不实）会误导 owner 的冻结决策，建议在放行前修正文档。

## 二、独立复验证据

| 证据 | 结果 | 说明 |
|---|---|---|
| `tsc --noEmit` | ✅ 0 error | 独立复跑 |
| `biome check .` | ✅ **110 文件** 0 error / 0 warning | 独立复跑（NOTES 记 109，差 1 为 types/ 两文件已落位，属计数时差，非问题） |
| `vitest run` | ✅ **126 passed**（17 文件） | 独立复跑全绿 |
| 契约结构门 `openapi-spec-validator` | ✅ `docs/api/openapi.v1.yaml: OK` | venv 独立复跑 |
| 契约语义门 `check_contract.py` | ✅ **全部通过（33 OK）** | 结构+operationId+孤儿实体+死胡同状态+机器强制约束+错误码+R1/N5 限流+N2 字段约束全绿；venv 独立复跑 |
| `git show --stat 15f516d` | 84 文件 | routes 大面积瘦身（likes −141 / history −116 / categories-write −151 / comments-write −95 / users −93 …），services 对应膨胀（user +278 / article +197 / category +206 / likes +156 新 / history +127 新 / site +67 新 / notification +102 新 / tag +87 / attachment +84 / comment +140 …）→ 呈"逻辑下沉"态势 |
| `git show --stat d0e309b` | 24 文件 | `{lib => services}/…` 与 `{lib/jwt.ts => shared/auth.ts}` 等，**0 insertions / 0 deletions** → Step A 为纯文件移动，零逻辑改动 |
| `git diff --stat d0e309b~1 15f516d -- openapi.v1.yaml` | **0 行** | 契约字节级未改（铁律⑧） |
| 测试文件 diff（error-codes/category/codes/response） | 仅 import 路径 | 4 个测试文件改动经 diff 过滤后**只剩 `@/lib` → `@/shared|services` 的 import 路径变更**，无断言逻辑改动 → 佐证"零行为变更" |

## 三、铁律逐条核验（04 §2）

| 铁律 | 核验方法 | 结果 |
|---|---|---|
| ① 零行为变更 | vitest 126 + 契约双门 33 OK + yaml 0 diff + 测试 import-only | ✅ 成立 |
| ② routes 禁项（无 `getDb` / 无 `drizzle-orm` / 无 `select/insert/update/delete`） | `grep getDb(` routes → none；`grep drizzle-orm` routes → none；**无歧义 token 终验**（`getDb\|drizzle-orm\|\beq(\|\band(\|sql\`\|desc(\|asc(\|isNull(\|inArray(\|\.run(\|\.all(`）→ 唯一"命中"为 `upload.ts:11` 注释句，非代码 | ✅ 成立（铁证） |
| ② routes 不漏出非路由函数 | `grep '^export …' routes` 排除 `Route$` → 仅 `healthRoute`（属路由实例） | ✅ 成立 |
| ③ services 不拼 HTTP 响应 | `grep '\b(ok\|paginate)(\|c\.json\|c\.req\|c\.status'` services → 无 `ok(`/`paginate(`/`c.json` | ✅ HTTP 响应格式化全在 routes（见 §四 P3-1 残留耦合说明） |
| ④ shared 不查库、不引 services | `grep '@/services' shared` → none；`grep getDb( shared` → none | ✅ 成立 |
| ⑤ `AuthVars` 上提 `types/auth.ts` 且 middleware/codes 透出 | `types/auth.ts` 定义 `AuthUser`/`AuthVars`；`middleware/auth.ts` `import type … from '@/types/auth'` + `export type { AuthUser, AuthVars } from '@/types/auth'`；`shared/codes.ts` 同理透出 `BizErrorCode` | ✅ 成立（30+ 路由 `import { type AuthVars } from '@/middleware/auth'` 无感） |
| ⑧ 不改 `openapi.v1.yaml` | git diff 0 行 + 独立结构门 OK | ✅ 成立 |

**routes 行数核验**：23 文件、1300 行，最大 `auth.ts` 135 行、全部 ≤200（NOTES §四声明属实）。

**`types/` 层依赖方向**：`types/auth.ts` `import type { Role } from '@/shared/auth'`、`types/common.ts` `import type { ErrCode } from '@/shared/codes'`——均 `import type`（编译期擦除，无运行时依赖）；`shared/auth.ts` 仅运行时依赖 `shared/codes`/`shared/errors`，**不回依赖 types**。故 types→shared 为 type-only 引用，无运行时环（详见 §四 P3-4）。

**聚合层未动**：`app.ts` / `worker.ts` 仅 `import … from '@/routes/…'`，未触碰 services（04 "不动聚合层"落实）。

## 四、P3 非阻塞发现

### P3-1（既有残留耦合，非回归）：`services/article.ts` 仍接收 Hono Context `c` 并读 `c.req`

- `services/article.ts:214`：`buildSortSql(q.c.req.query('sort'))`；`services/article.ts:243`：`const id = Number(c.req.param('id'));`。
- 对照 `routes/articles-read.ts`：handler 已在路由层抽取 `keyword/tag/category` 后以纯字符串传入 `queryArticles`，唯独 `sort` 在 service 内从 `c` 取——**同一函数的入参解耦不一致**。
- **根因（已取证）**：旧 `lib/article.ts`（`d0e309b~1`）第 143/160/213/241-242 行**本就**让 `queryArticles` 收 `c` 并读 `c.req.query/param`，`resolveArticleOwner` 同理。本次调优**原样保留，非新引入**。
- 判别：不违反 04 铁律③（services 未拼 HTTP 响应），但 service 层对 HTTP 请求对象存在残留耦合，属"本次调优范围之外"的既有技术债。
- 建议（未来清理，非本批范畴）：在 `articles-read.ts` 也抽出 `sort`（与 keyword/tag/category 一致），使 `queryArticles` 收纯参数、彻底 HTTP 无关。

### P3-2（纪律一致性缺口）：`services 例外` 注释仅 article.ts 有，user/category/comment 缺

- `services/article.ts` 头部含「services 例外」注释；`services/user.ts`(335)、`services/category.ts`(373)、`services/comment.ts`(226) 头部**无**该注释（仅有"领域纯逻辑/与路由解耦"等通用说明）。
- 04 §2 约定：routes 严守 ≤200，services 超 200 须以「services 例外」注释显式豁免（沿用项目既有先例）。三份大文件未加注释，与约定不一致。
- 判别：功能性正确、不阻塞门禁；属文档纪律一致性瑕疵。

### P3-3（NOTES 事实错误）：§四尺寸与"全部已标注"均不实

- NOTES §四原文："services 存在文件超 200 行者（`article.ts` ≈252、`user.ts` ≈250）已按项目纪律以注释显式标注「services 例外」"。
- 实测行数（`wc -l`）：`article.ts` **451**（非 ≈252）、`user.ts` **335**（非 ≈250）、`category.ts` **373**、`comment.ts` **226**、`article-mutation.ts` **185**。
- 结合 P3-2：**仅 article.ts 标注了「services 例外」**，user/category/comment 均未标注——"全部已标注"与事实不符。
- 判别：纯交付文档准确性问题（与 B7 P3-1 "NOTES 事实错误"同源）。**建议修正 NOTES §四**：以真实行数替换，并据实说明注释落地情况（article 已标，其余三份待补）。

### P3-4（措辞精确化）：types 非"绝对最底层"，而是 type-only 引用 shared

- NOTES §四 / 铁律⑤称"types 处于依赖图最底层"。实测 `types/` 通过 `import type` 引用 `shared/auth`(Role)、`shared/codes`(ErrCode)。
- 判别：设计正确（type-only 编译期擦除、无运行时环），但"最底层"措辞易误导后续接手者误以为 types 与 shared 零引用。建议精确为"types 仅含类型、对 shared 为 `import type` 引用，无运行时依赖与环"。

### P3-5（观察，非缺陷）：`articles-read.ts` 在路由层抽取 IP/UA

- `articles-read.ts:42-44` 从 `x-forwarded-for`/`x-real-ip`/`user-agent` 抽取 IP/UA 后传入 `incrementViewCount`。属请求上下文适配（路由合理职责），非业务逻辑泄漏；仅记录备查，不阻塞。

## 五、与 NOTES §三「自报偏差」的核对（三项均成立）

| 自报偏差 | 核验 | 结论 |
|---|---|---|
| ① lib→services/shared 前置迁移不在主体批内（Step A 纯移动 + 主体批下沉逻辑，顺序异但结果等价） | `d0e309b` 0/0 纯移动；`15f516d` 为逻辑下沉；`git diff` 无 yaml 改动 | ✅ 成立，更低风险 |
| ② types 层 re-export 兼容策略（middleware/codes 透出，30+ 路由/3 测试零改动） | `middleware/auth.ts`、`shared/codes.ts` 均 `export type {…} from '@/types/…'`；测试 diff 仅 import 路径 | ✅ 成立 |
| ③ shared 命名收口、无 service 反向依赖 | `grep '@/services' shared` → none | ✅ 成立 |

## 六、结论

结构调优**实质达标**：水平分层（routes/services/shared/types）真实落地，routes 真薄、services 真承载、shared/types 边界清晰；五门门禁**独立复跑全绿**；契约字节级未改；零行为变更有测试 + diff 双重佐证。开发 AI 自报的三项偏差均经核实成立、且为更低风险选择。

唯一需纠之处在**交付文档准确性**（P3-3：NOTES §四尺寸与注释声明不实）与**纪律一致性**（P3-2：三份大 service 缺例外注释）。二者均不阻塞代码冻结，但若留不实记录会干扰 owner 冻结决策。

## 七、给开发 AI 的修正清单（随本批复执行，非阻塞代码）

| 级别 | 位置 | 修复 |
|---|---|---|
| 🟡 P3-2 | `services/user.ts` / `services/category.ts` / `services/comment.ts` 文件头 | 补一行「services 例外：本文件超 200 行，按项目纪律豁免（services 可承载领域逻辑+全部 DB 查询）」注释，与 `article.ts` 对齐 |
| 🟡 P3-3 | `B-结构调优-NOTES.md` §四 | 以真实行数（article 451 / category 373 / user 335 / comment 226 / article-mutation 185）替换 ≈252/≈250；据实改写"services 例外"标注说明（article 已标，其余三份按 P3-2 补后即为"已标"） |
| 🟡 P3-4 | `B-结构调优-NOTES.md` §四 / 铁律⑤ | "types 处于依赖图最底层"精确为"types 仅含类型、对 shared 为 `import type` 引用、无运行时依赖与环" |

P3-1（service 接收 `c`）与 P3-5（route 抽取 IP/UA）属既有/可接受，记入 TODO，不在本批范畴，未来清理即可。

## 八、交付物与下一步

- 本报告：`docs/node-backend/review/B-结构调优-后端代码审阅报告.md`
- 后续：`.workbuddy/memory/2026-08-26.md` 追加审阅记录；`REVIEW-LOG.md` 追加「B-结构调优 后端代码审阅」节。
- **放行建议**：代码层结构调优**审查通过**。P3-2/P3-3/P3-4 文档修正随本批复完成后，交 owner 确认目录风格 → 冻结 M1 后端 → 进入「写 M1 后端文章」（M1-01~M1-30）。
- 状态：本批**审查通过（待 owner 冻结前置的风格确认 + NOTES 文档修正）**，非首轮不通过。
