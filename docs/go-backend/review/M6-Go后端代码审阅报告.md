# M6 Go 后端代码 · 审阅报告（第一轮）

日期：2026-10-08　·　被审对象：`go-backend/`（提交 `043fda2`，工作区干净）
审阅定位：**代码工艺 + 教学可读性**。功能正确性与契约一致性由既有 [交付与验收](../09-开发交付与验收.md)、[验证与兼容报告](../07-验证与兼容报告.md) 与 `reports/` 证据覆盖，本报告不重复评分。

---

## 1. 结论速览

| 维度 | 满分 | 得分 | 一句话归因 |
|---|---:|---:|---|
| 架构与分层 | 20 | **19** | 教科书级：`cmd`/`internal` 领域分包、`bootstrap` 唯一装配根、启动即校验 68 操作全覆盖 |
| 包与职责抽离 | 20 | **17** | 无上帝文件（最大 360 行）；仅 2 个 >80 行函数、8 个长闭包 |
| 公共逻辑抽离（去重） | 20 | **13** | 软删除谓词手写 15 处、路径参数样板 25 处、map 字面量每次调用重建 |
| **注释与教学可读性** | 25 | **10** | **中文注释 0 行**；22/59 文件零注释；91 个顶层导出无文档；`e` 899 次 vs `err` 39 次 |
| 整洁度与规范遵循 | 15 | **14** | `gofmt`/`vet`/`build`/`test` 全绿；无调试残留；无 `gorm.Model`/`AutoMigrate` |
| **合计** | **100** | **73** | 工程骨架优秀，**教学可读性这一项拖住了总分** |

**一句话结论**：这是一份**工程判断力很强、但「教学友好度」明显没跟上**的交付。作者在架构、契约纪律、事务边界、跨库兼容上的取舍都经得起推敲（`05-架构与关键决策.md` 甚至写出了「为什么不引入通用 Repository<T>」这种成熟判断）；但既然定位是**给初学者读的教学代码**，**零中文注释、`e` 代替 `err`、大量单行超长结构体字面量**这三件事会直接伤害目标读者。问题**集中在「可读性」一个切面**，不是能力问题。

> 与 Flutter 那轮的关键区别：那里的问题是「抽象没做」；这里抽象**做得很好**，缺的是**面向人的表达**（注释、命名、排版）。

---

## 2. 审阅方法与独立取证

**我没有采信任何自陈**（`README`、`09-交付与验收`、`07-验证报告` 只用来了解作者意图，不作证据）。全部结论来自我自己跑的：

| 项目 | 命令 | 结果 |
|---|---|---|
| 格式 | `gofmt -l cmd internal test` | **无输出**（全绿） |
| 静态检查 | `go vet ./...` | **无输出**（全绿） |
| 构建 | `CGO_ENABLED=1 go build ./...` | **通过** |
| 测试 | `go test ./... -count=1` | **12 个测试包全部 `ok`**（0 失败） |
| 契约一致性 | 冻结 YAML `operationId` 计数 vs 内嵌快照 | **68 = 68**，版本 **1.12.0** 双方一致 |
| 尺子 A（词法/行扫描） | Python 逐行解析（行数、行长、注释、重复字面量） | 见下 |
| 尺子 B（**真语法树**） | 自写 Go AST 分析器 [`check_go_ast.go`](check_go_ast.go)（`go/parser`+`go/ast`） | 见下 |
| 门禁 | 自写 [`check_go_quality.go`](check_go_quality.go)（13 条断言 + `--selftest`） | 真实代码 **PASS=3 / FAIL=10**（exit 1，非空跑） |
| 门禁自检 | `check_go_quality.go --selftest` | 注入 11 类缺陷，**13/13 全部转红，0 条未拦住** |

**两把尺子读数一致**（词法扫描与真语法树互证），故下列数字可判定成立：

| 指标 | 实测 | 判据 |
|---|---:|---|
| 生产代码规模 | **59 文件 / 4700 行 / 201 个函数** | — |
| 测试规模 | 21 文件 / 1731 行 / 34 个 `Test*` | — |
| 最大文件 | **360 行**（`internal/transfer/snapshot.go`） | ≤400 ✅ |
| 最大函数 | **99 行**（`snapshot.go` 的 `Normalize`） | ≤80 ❌ |
| >80 行函数 | **2 个** | =0 ❌ |
| 最大控制流嵌套 | **7 层**（`contract/contract.go` 的 `Load`） | ≤4 ❌ |
| 中文注释行 | **0** | — ❌ |
| 注释行合计 | **63 行**（其中 57 行为包级文档） | — |
| 零注释文件 | **22 / 59（37%）** | — |
| 顶层导出符号缺文档 | **91 个**（方法另有 109 个） | =0 ❌ |
| 无包级文档的包 | **6 / 24** | =0 ❌ |
| >120 字符的行 | **103 行**（>160 字符 50 行） | ≤20 ❌ |
| 最长单行 | **443 字符**（`article/view.go:23`） | — ❌ |
| 软删除谓词 `deleted_at IS NULL` | **15 处 / 散布 8 个文件** | ≤3 ❌ |
| 路径参数样板 `pathID(r,` | **25 处** | ≤8 ❌ |
| 标识符 `e` / `err` | **899 / 39** | `err≥100` ❌ |
| 调试残留 `TODO/FIXME/HACK/println` | **0** | =0 ✅ |

---

## 3. 做得好的 8 件事（每条附证据，先说不好的之前先说不容易的）

1. **装配根唯一且自校验** —— `bootstrap.New()` 在启动时遍历契约目录，任何一个操作没注册就返回 `operation not implemented`（`internal/bootstrap/app.go:60-64`）。这等于把「漏实现一个接口」从运行时故障变成了启动失败，是很成熟的做法。
2. **分层边界干净** —— `HTTP 不写业务 SQL`、存储适配器不认识用户与文章、ORM 行不直接当响应。`platform/model` 只有 15 张表的行结构 + `TableName()`，**没有 `gorm.Model`、没有 `AutoMigrate`**（我全仓扫描确认各 0 处），显式 `DeletedAt *int64` 手工管理 —— 代价见 §4，但**动机是对的**。
3. **文件粒度健康** —— 最大文件 360 行，绝大多数 ≤250 行，**没有上帝文件**。`internal/article/` 按 `query / mutation / discovery / view / toc` 切分，职责一眼可见。
4. **契约纪律机器化** —— 冻结 YAML 是唯一源，内嵌 JSON 快照 + `sync-contract.cjs --check` 防漂移；我复核 **68 = 68、版本 1.12.0** 一致。
5. **错误码集中且有语义** —— `fault` 包 12 个业务码 + `Status()` 到 HTTP 的映射 + `Message()` 文案，全部集中一处（`internal/fault/error.go`）；`Resolve()` 用 `errors.As/Is` 而非字符串比较（全仓 `err.Error() ==` **0 处**）。
6. **行锁抽象干净** —— `database.Lock(db)` 一行表达「PostgreSQL/MySQL 用 `FOR UPDATE`、SQLite 单写连接」的差异，且带注释说明拓扑限制（`platform/database/transaction.go`）。
7. **无残留、无危险模式** —— `TODO/FIXME/HACK/println` 0 处；唯一的 `panic(` 是 `Register` 里对未知 operation 的**启动期 fail-fast**（`httpapi/app.go:55`），位置恰当。`cmd/seed`、`cmd/data` 里的 `fmt.Print` 是 CLI 正常输出，非调试残留。
8. **测试有含金量** —— 抽查 `article/mutation_test.go`：一个用例覆盖「投稿降级为 pending / slug 归空 / 匿名 404 / 越权 403 / 状态机 409 / slug 释放后复用」六条不变量，**不是 getter 镜像测试**。

---

## 4. 问题清单（按教学定位分级）

> 分级口径：**P0 = 直接妨碍初学者理解**；P1 = 显著降低可读性/可维护性；P2 = 打磨项。

### P0-1　中文注释为 0 —— 对「中文教学代码」这是首要问题

- **位置**：全仓。`//` 注释共 **63 行，其中含中文 0 行**（独立验证：`//` 行含 CJK 匹配数 = 0）。**22/59 生产文件零注释**。
- **现状**：注释**全部是英文**且集中在包级文档（如 `// Package httpapi owns HTTP only: routing, validation, cookies and envelopes.`）。中文只出现在**错误文案字符串**（`fault.Message`）与测试夹具里。
- **为什么是问题**：目标读者是**中文初学者**。包级文档用英文尚可接受（Go 生态惯例），但**关键业务规则零注释**意味着：读者要靠反推代码才能知道「为什么会员投稿要降级成 pending」「为什么 refresh 重放要提交撤销」。这些恰恰是本项目最有教学价值的部分 —— 而作者已经在 `01/02/05` 文档里用中文写清楚了，**只是没搬进代码**。
- **判断依据（不是我的偏好）**：同一个作者的提交信息用 `type(scope): 中文描述`，9 份工程文档全中文 —— 说明**中文是既定沟通语言**，代码注释是唯一例外。而 `01-Go工程最佳实践.md` 把 gofmt/vet/DTO/事务/安全标准列了个遍，**唯独没写「注释用什么语言」** —— 这是个**没被显式决定的空白**，不是有意选择。
- **整改方向**：见 A-1。**至少覆盖**：领域服务的业务规则（为何这样判权限/状态）、事务边界（为何这个操作必须成为一个事务）、跨库差异点、以及 `01/05` 文档里已经写好的关键取舍的代码内锚点。

### P0-2　错误变量用 `e` 而非 `err`（899 : 39）

- **位置**：全仓，典型如 `cmd/server/main.go:25`（`c, e := config.Load()`）、`internal/config/config.go:36`、`internal/contract/contract.go:29`、`internal/article/mutation.go:71`。
- **为什么是问题**：`err` 是 Go 语言**最强的社区共识之一**（`if err != nil` 几乎是 Go 的视觉签名）。教学代码用 `e`，会让初学者学到**错的肌肉记忆**；更实际的是，将来读任何真实 Go 项目、或用 `errcheck` 等工具时会格格不入。
- **加重情节：同一函数内 `err` 与 `e` 混用** —— `internal/transport/httpapi/app.go` 的 `Register` 闭包里，L73/L77 用 `err`，L103/L108/L113 用 `e`；`article/mutation.go` 的 `Update` 里外层 `e :=`（L99）与内层 `var e error`（L100）/`:= e`（L119）**同名遮蔽**，`e` 同时是「事务返回值」和「局部错误」，读者要专门花力气跟踪作用域。这正是初学者最容易写出 bug 的地方（`:=` 静默遮蔽外层变量）。
- **整改方向**：见 A-2。

### P1-1　软删除谓词 `deleted_at IS NULL` 手写 15 处

- **位置**（8 个文件）：`article/discovery.go:35,56,121,129`、`article/query.go:25,72`、`taxonomy/categories.go:171,190,207`、`taxonomy/tags.go:15`、`administration/site.go:37,42`、`member/history.go:24`、`member/interactions.go:94`、`transfer/snapshot.go:283`。
- **为什么是问题**：**这是个真实的正确性隐患，不只是重复**。项目刻意不用 `gorm.Model`（为了显式，动机正确），但代价是**软删除过滤完全靠人记得写**：新增一个查询、忘了 `deleted_at IS NULL`，已删除文章就会出现在列表里，而**没有任何机制会报警**。`article/query.go:25` 已经局部收敛了一个 `q := db.Where("deleted_at IS NULL")`，但只覆盖该文件。
- **整改方向**：见 A-4（抽 `scope.Active(db)` 之类的统一入口，让「忘记」在架构上难以发生）。

### P1-2　路径参数样板重复 25 处

- **位置**：`transport/httpapi/member.go`（9）、`content.go`（8）、`discovery.go`（6）、`auth.go`（1）、`attachments.go`（1）。每处都是同一个三行模式：

```go
id, e := pathID(r, "articleId")
if e != nil {
    return nil, e
}
```

- **为什么是问题**：约 **75 行样板**，且样板里裹着 `e`（见 P0-2）。`BindMember` 因此长到 81 行（>80）。教学代码里让读者反复读同一段没有信息量的胶水代码，是明确的损耗。
- **整改方向**：见 A-5（给 `Register` 增加一个「带路径参数」的变体，或提供 `withID(r, key, fn)` 包装）。

### P1-3　超长单行 103 行（>120 字符），最长 443 字符

- **位置（最差 5 处）**：
  | 位置 | 长度 | 内容 |
  |---|---:|---|
  | `internal/article/view.go:23` | **443** | `Summary()` 返回 **16 字段的单行 map 字面量** |
  | `internal/article/mutation.go:86` | **369** | `model.Article{...}` **11 字段单行结构体字面量** |
  | `cmd/seed/main.go:66` | 336 | 种子文章单行字面量 |
  | `internal/article/view.go:10` | 334 | `SummaryColumns` SQL 白名单常量 |
  | `internal/platform/storage/r2.go:28` | 328 | S3 客户端单行配置 |
- **为什么是问题**：`view.go:23` 这种「16 个字段挤一行」对初学者几乎是不可读的 —— 它会横向滚动、无法逐字段对照契约、diff 时整行变化。DTO 组装恰恰是**最该被读懂**的地方（契约字段名 → 响应字段名的映射全在这）。
- **注**：`view.go:10` 的 `SummaryColumns` 是**白名单常量**（安全性需要），拆行是纯排版问题，优先级低于 `:23`。
- **整改方向**：见 A-6。

### P1-4　2 个 >80 行函数 + 1 个嵌套 7 层

| 位置 | 行数 | 嵌套 | 说明 |
|---|---:|---:|---|
| `internal/transfer/snapshot.go:68` `(*Snapshot).Normalize` | **99** | 5 | 反射驱动的列白名单/类型校验，单函数承担「版本检查+表枚举+列枚举+类型校验+空值校验」 |
| `internal/transport/httpapi/member.go:8` `(*App).BindMember` | **81** | 1 | 20 条注册平铺（真正的问题是 P1-2 的样板） |
| `internal/contract/contract.go:28` `Load` | 69 | **7** | `paths → method → operation → requestBody → content → schema` 六层 `if ok` 嵌套 |

- **`contract.Load` 尤其值得改**：7 层嵌套 + 大量 `.(map[string]any)` 裸断言，是**全仓最难读的函数**；而它的职责（从 OpenAPI 文档里提取 operation 元数据）本可以拆成 `operationAt(path, method, o)` 等小函数，把嵌套压到 2~3 层。
- **`BindMember` 行数的根因是 P1-2**，样板解决后自然回落。
- **整改方向**：见 A-7/A-8。

### P2-1　8 个 >40 行的匿名闭包

`mutation.go:99`（70 行，`Update` 的事务体）、`httpapi/app.go:58`（62 行，`Register` 的 handler）、`snapshot.go:222`（53 行）、`attachments.go:15`（49 行）、`comment/service.go:111`（46 行）、`taxonomy/categories.go:127`（46 行）、`tags.go:38`（44 行）、`mutation.go:188`（43 行）。

> **判断**：`app.go:58` 那个 62 行闭包是**中间件的真实逻辑**（鉴权→限流→解码→校验→派发），拆开反而更碎，**不建议动**。`mutation.Update` 的 70 行事务体**建议抽成 `updateTx(tx, ...)` 命名函数** —— 事务边界独立成函数，正是教学想强调的东西。

### P2-2　map 字面量每次调用重建

`fault/error.go:67` 的 `Message()`、`values/values.go:78/80` 的 `Actor.Rank()`/`Allows()` 每次调用都构造一个新 `map[...]`。教学代码里这是**反模式示范**（应提为包级 `var`）。`fault.Message` 还有一处 305 字符的单行 map。

### P2-3　包级文档缺口 6 个包

`cmd/server`、`cmd/migrate`、`cmd/data`、`internal/config`、`internal/platform/database`、`internal/testutil` 无包级文档（`internal/transport/httpapi`、`fault`、`values`、`contract`、`bootstrap` 等 18 个包有）。

### P2-4　需确认：一个 handler 覆盖三个操作

`transport/httpapi/member.go:85-87`：

```go
for _, id := range []string{"getSiteSettings", "adminGetSiteSettings", "adminUpdateSiteSettings"} {
    a.Register(id, func(r Request) (any, error) { return admin.Site(r.Context(), r.Input) })
}
```

三个语义不同的操作（读公开 / 读后台 / **改**后台）共用同一个 handler。`admin.Site` 内部很可能按 `r.Input` 区分，但**从调用点读不出来**，且 `adminUpdateSiteSettings` 是写操作。教学代码里这种「表面复用」最容易让读者误判；**建议展开为三个显式注册**（或至少加一行注释说明为何可共用）。

### P2-5　命名遮蔽标准库

`cmd/server/main.go:41` 的 `sql, _ := db.DB()` 让 `sql` 遮蔽 `database/sql` 包名。教学代码应避免（改 `sqlDB`）。

---

## 5. 可执行整改清单

> 分期建议：**第一批纯注释/命名（零行为风险）** → **第二批排版（零逻辑改动）** → **第三批抽 helper（需重跑测试）**。

| 编号 | 级别 | 位置 | 动作 | 验收断言 |
|---|---|---|---|---|
| **A-1** | P0 | 全仓领域服务 | 补**中文**注释：业务规则、事务边界、跨库差异；建议 ≥150 行 | `中文注释行 ≥ 120`（当前 0） |
| **A-2** | P0 | 全仓 | 错误变量统一改 `err`；消除 `err`/`e` 混用与同名遮蔽 | `err 出现 ≥ 100 且 err ≥ e`（当前 39 : 899） |
| **A-3** | P0 | 91 个顶层导出 | 为导出类型/函数补文档注释（`TableName()` 这类可免） | `顶层导出缺文档 = 0`（当前 91） |
| **A-4** | P1 | 15 处软删除 | 抽 `scope.Active(db)` 统一入口并按处替换 | `deleted_at IS NULL 出现 ≤ 3`（当前 15） |
| **A-5** | P1 | 25 处 `pathID` 样板 | 抽 `withID(r, key, fn)` 或给 `Register` 加带参变体 | `pathID(r, 出现 ≤ 8`（当前 25） |
| **A-6** | P1 | 103 行超长 | 拆 `view.go:23`（16 字段 map）、`mutation.go:86`（11 字段 struct）等多行；`SummaryColumns` 按列分组 | `>120 字符行 ≤ 20`（当前 103） |
| **A-7** | P1 | `snapshot.Normalize`(99)、`BindMember`(81) | 拆 `Normalize` 为「表枚举 / 列白名单 / 类型校验」三步 | `>80 行函数 = 0`（当前 2） |
| **A-8** | P1 | `contract.Load`(69 行/7 层) | 抽 `operationAt()` / `schemaAt()`，嵌套压到 ≤4 | `最大控制流嵌套 ≤ 4`（当前 7） |
| **A-9** | P2 | 6 个包 | 补包级文档 | `无包级文档的包 = 0`（当前 6） |
| **A-10** | P2 | `mutation.Update` 70 行闭包 | 抽成命名事务函数 `updateTx(tx, ...)` | `>40 行匿名闭包 ≤ 4`（当前 8） |
| **A-11** | P2 | `fault.Message` / `Actor.Rank` / `Actor.Allows` | map 字面量提为包级 `var` | 代码评审确认 |
| **A-12** | P2 | `member.go:85` 三操作共用 handler；`main.go:41` `sql` 遮蔽 | 展开为显式注册；改名 `sqlDB` | 代码评审确认 |

**目标值对照表（当前 → 目标）**

| 指标 | 当前 | 目标 |
|---|---:|---:|
| 中文注释行 | 0 | **≥120** |
| 注释行合计 | 63 | ≥250 |
| 顶层导出缺文档 | 91 | **0** |
| 无包级文档的包 | 6 | **0** |
| >80 行函数 | 2 | **0** |
| 最大控制流嵌套 | 7 | **≤4** |
| >120 字符行 | 103 | **≤20** |
| 单文件最大行数 | 360 | ≤400（已达标，保持） |
| `deleted_at IS NULL` | 15 | **≤3** |
| `pathID(r,` | 25 | **≤8** |
| `err` : `e` | 39 : 899 | **≥100 且 err ≥ e** |
| 调试残留 | 0 | 0（保持） |

**门禁用法**（脚本在 `docs/go-backend/review/`，不污染工程）：

```bash
cd go-backend
go run ../docs/go-backend/review/check_go_quality.go .              # 生产代码验收
go run ../docs/go-backend/review/check_go_quality.go . --with-tests # 含测试
go run ../docs/go-backend/review/check_go_quality.go --selftest     # 验证断言会红
```

### 明确「不建议改」的（显示判断力，避免为凑数字乱拆）

- `httpapi/app.go:58` 的 **62 行 `Register` 闭包**：这是鉴权/限流/解码/校验/派发的完整中间件链，拆开只会让读者在多个小函数间跳转才能拼出一次请求的生命周期。
- `article/view.go:10` 的 `SummaryColumns`：**SQL 白名单常量**，安全性要求它集中；只做排版优化（A-6），不拆成多个常量拼字符串（那会让白名单更难审计）。
- `transfer/snapshot.go` 的反射用法：离线迁移工具需要「按 gorm tag 反推列类型」，反射是合理选择；只需拆函数（A-7），**不必改成代码生成**。
- `cmd/seed`、`cmd/data` 里的 `fmt.Print`：CLI 工具的正常输出，不是调试残留。

---

## 6. 评分明细

| 维度 | 得分/满分 | 扣分归因 |
|---|---|---|
| 架构与分层 | 19/20 | 唯一扣分：6 个包无包级文档，读者进入 `internal/config` 时看不到该包职责 |
| 包与职责抽离 | 17/20 | 2 个 >80 行函数（`Normalize` 99 / `BindMember` 81）；`contract.Load` 7 层嵌套；8 个 >40 行闭包 |
| 公共逻辑抽离 | 13/20 | 软删除谓词 15 处（**有正确性隐患**）、`pathID` 样板 25 处、map 字面量每次重建 |
| 注释与教学可读性 | 10/25 | 中文注释 0；37% 文件零注释；91 个顶层导出无文档；`e:err` = 899:39；103 行超长行（最长 443 字符） |
| 整洁度与规范 | 14/15 | 四道门全绿、无残留、无 `gorm.Model`；小扣：`sql` 遮蔽标准库、命名不统一 |

**为什么不是 80+**：`注释与教学可读性` 占 25 分是这个项目**特有的权重**（用户明确定位教学）。这一维度只拿 10 分，且问题是**系统性**的（不是零星几处），直接把上限压住了。

**为什么不是 65 以下**：架构、契约纪律、事务边界、跨库兼容这四件事都达到了**生产级**水准，`05-架构与关键决策.md` 里对「为什么不用通用 Repository」「为什么不用 AutoMigrate」「为什么 refresh 重放必须提交」的论证，很多写了三五年 Go 的人也写不出来。**这些不是教学代码的加分项，而是它最值钱的部分。**

---

## 7. 评审方自我订正

按惯例，把我自己这轮的工具/口径错误记下来（每条可复现）：

1. **zsh 的 `grep --include=*.go` 失效** —— 首次统计重复模式时命令返回 `no matches found: --include=*.go`，**四个指标全报 0**。这是我在本项目里**已经记过一次的坑**（zsh 不给未加引号参数做 glob 展开），仍然踩了第二次。改用检索工具重跑。→ **代码统计一律用 AST 工具或 Python，不用 shell grep。**
2. **`deleted_at IS NULL` 首次数成 12 处** —— 实际 **15 处**。我在草稿里把「12」写进了结论，重数后修正。教训：**汇报前把每个数字回到源文件逐条点名**（后来我确实附了 15 处的完整位置清单）。
3. **「导出符号缺文档」口径第一次过粗** —— 我最初报「200 个」把 `TableName()` 这类自解释方法也算进去了。修正分析器把**顶层（91）与方法（109）分开**后，结论才是可执行的。
4. **门禁第一版把测试代码算进生产指标** —— 首次跑出「>80 行 = 4」，其中 159 行的 `TestAllOperations` 是测试。加了 `--with-tests` 开关、默认排除测试后口径才一致。
5. **门禁自检夹具第一版未越过全部阈值** —— 按我自己的纪律（「夹具必须真正越线，否则红了也说明不了断言有效」）检查后发现 `单文件 ≤400`、`>120 字符行 ≤20`、`gofmt` 三条在夹具里**没越线**，会误判为「未拦住」。补了一个 420 行文件、26 行超长行、一个非 gofmt 文件后才达成 **13/13 全红**。
6. **单文件行数 359 vs 360** —— `wc -l`（数换行符）与我的工具（`\n` 计数 +1）差 1。本报告统一采用工具口径 **360**。

---

## 8. 诚实边界声明

1. **本报告只评代码工艺与教学可读性**，不评功能正确性、不评契约实现完备度 —— 那些由 `07/09` 与 `reports/` 覆盖。
2. **我未做运行时验证**：没有起数据库、没跑 `make verify` / `make matrix`（三库全流程需要 Docker 与较长耗时）、没跑 `-race`、没跑 `govulncheck`、没做性能复测。作者的这些数字我**未采信也未质疑**，只是不在本报告结论内。
3. **我未改动 `go-backend/` 任何一行**（`git status` 可验），全部产出在 `docs/go-backend/review/`。
4. 量化依赖两把自写尺子（行扫描 + Go AST），二者互证但同属**静态**分析；动态分派、反射生成的代码路径存在共同理论盲区。
5. 「教学可读性」中「应当有中文注释」这一条，我给出的依据是**本项目内的语言一致性**（提交信息、9 份文档全中文）与用户明确定位，不是通用 Go 社区规范（社区普遍接受英文注释）。**若 owner 决定教学代码也用英文注释，A-1/A-3 的口径需要由 owner 重新裁定** —— 我在此明确标出这个前提。

---

## 9. 附：产出物

| 文件 | 作用 |
|---|---|
| 本报告 | 结论、问题清单、整改工单、评分 |
| [`check_go_quality.go`](check_go_quality.go) | 门禁：13 条断言 + `--selftest`；真实代码 `PASS=3/FAIL=10`（非空跑），自检 13/13 全红 |
| [`check_go_ast.go`](check_go_ast.go) | 纯量化探针（Go AST）：函数长度、嵌套、注释、导出文档、命名惯例 |
