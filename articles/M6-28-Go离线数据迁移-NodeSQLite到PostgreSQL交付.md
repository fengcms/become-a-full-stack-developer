# 成为全栈·Go 后端篇·从 Node SQLite 到 PostgreSQL：把迁移做成独立交付物

> 数据搬迁不是把表导成 JSON 再导入。它要锁定源快照、定义字段规范、遵守父子顺序、拒绝危险目标，并在真实写入后核对关系和计数。

{{IMG:M6-28-封面}}

> 本文代码快照：提交 ceac4e0。工具支持本地离线演练；不代表生产数据库已经切换。

## 前言：跨数据库搬迁改变的是整组数据关系

从 Node 的 SQLite/D1 环境迁往 Go PostgreSQL，不仅要复制 users 和 articles。账号可能有微信身份映射，文章与标签有关系，评论有父子结构，附件记录指向外部对象 key，互动计数还应与关系表一致。漏一张表、改变一个 nullable 或打乱父子顺序，都可能让导入后的系统返回数据，却违反业务不变量。

M6 提供独立 data 命令与版本化 JSON Snapshot。导出采用只读事务；快照只包含明确白名单的 13 张业务表，不包含有效 refresh token 和阅读去重行，也不复制 R2/local 文件内容。导入只接受已迁移的空目标，先规范化、检查再执行事务，并在提交前做关系审计。dry-run 完整执行导入路径后回滚。

本文讲述这个工具能证明什么、不能证明什么，以及一次真实切换还需要怎样的冻结、附件搬迁、序列和回退计划。

## 一、先定义迁移范围，而不是尽量全拷贝

Snapshot v1 包括 users、categories、tags、wechat_identities、articles、article_tags、comments、attachments、favorites、view_history、likes、notifications 和 site_settings，共 13 张表。

这份名单写死在代码里：

~~~go
// internal/transfer/snapshot.go（节选）
// Snapshot 离线版本化业务快照，不包含有效会话和对象内容。
type Snapshot struct {
	Version   int                         `json:"version"`
	Source    string                      `json:"source"`
	CreatedAt string                      `json:"createdAt"`
	Tables    map[string][]map[string]any `json:"tables"`
}
type table struct {
	name string
	row  any
}

var tables = []table{
	{"users", model.User{}}, {"categories", model.Category{}}, {"tags", model.Tag{}},
	{"wechat_identities", model.WechatIdentity{}}, {"articles", model.Article{}},
	{"article_tags", model.ArticleTag{}}, {"comments", model.Comment{}},
	{"attachments", model.Attachment{}}, {"favorites", model.Favorite{}},
	{"view_history", model.History{}}, {"likes", model.Like{}},
	{"notifications", model.Notification{}}, {"site_settings", model.SiteSetting{}},
}
~~~

`tables` 是一份编译进二进制的白名单。每个元素是表名加该表的模型零值，前者用于构造 SQL，后者用于校验列名。表名的唯一来源是这份列表，导入时构造的语句不会拼接任何来自快照的字符串，所以快照无法通过伪造表名让工具去操作别的表。

数一下正好 13 项。`refresh_tokens` 与 `article_view_dedup` 都不在其中，它们既不会被导出，也不会在导入时被写入。`Snapshot` 结构除了 `Tables` 就是版本、来源和创建时间三个元数据字段，没有给“附件字节”或“会话”留位置。

每类状态是否进快照，理由各不相同：

| 数据 | 是否进快照 | 理由 |
|---|---|---|
| 13 张业务表 | 是 | 业务数据需要延续 |
| `refresh_tokens` | 否 | 避免旧会话延续到新后端，强制重新登录 |
| `article_view_dedup` | 否 | 迁移后阅读冷却重新计时 |
| 对象字节（local / R2） | 否 | 快照只存元数据，字节走独立搬运通道 |

refresh_tokens 不搬迁，避免把活跃会话从旧后端延续到新后端；用户需要重新登录。article_view_dedup 也不搬迁，迁移后阅读冷却窗口重新计时。对象本体不在 JSON 快照里，attachments 行只保留 key、storage、URL、MIME、size 等元数据，因此附件内容需要单独搬运并校验。

这项范围选择必须提前说清。复制 users 而漏掉 wechat_identities 会让微信用户找不回原账号；复制附件元数据但不复制对象字节会得到损坏引用；复制 refresh token 可能让旧安全会话继续有效。迁移策略要先描述每类状态的保留与重置。

## 二、导出要只读且尽量取得一致快照

Export 在只读、repeatable read 事务中按固定表白名单和 ID 顺序读取所有记录。源端 SQLite 使用 read-only DSN，避免工具无意创建缺失文件或修改 journal mode；其它数据库采用只读事务选项。每张空表输出 []，不是 null，快照附带版本、来源 driver 与创建时间。

~~~go
// internal/transfer/snapshot.go（Export，节选）
// Export 在只读一致性事务内导出白名单业务表，源数据库不被修改。
func Export(ctx context.Context, db *gorm.DB, source string) (*Snapshot, error) {
	out := &Snapshot{
		Version:   1,
		Source:    source,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Tables:    map[string][]map[string]any{},
	}
	txErr := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range tables {
			var rows []map[string]any
			if err := tx.Table(table.name).Order("id ASC").Find(&rows).Error; err != nil {
				return fmt.Errorf("export %s: %w", table.name, err)
			}
			if rows == nil {
				rows = []map[string]any{}
			}
			for _, row := range rows {
				for k, v := range row {
					if b, ok := v.([]byte); ok {
						row[k] = string(b)
					}
				}
			}
			out.Tables[table.name] = rows
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return out, txErr
}
~~~

所有读取都在一个事务里完成，事务选项是 `&sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true}`。`ReadOnly` 声明这个事务不会写，`LevelRepeatableRead` 让同一事务内多次读取看到一致的数据快照。13 张表如果在没有事务的情况下依次读取，两张表之间可能有新写入落进来，导出的数据就会处在两个时刻的混合状态。

循环按 `tables` 的顺序、每张表再按 `Order("id ASC")` 读取，导出的文件因此有稳定的排列，便于逐表核对。`if rows == nil { rows = []map[string]any{} }` 把空表规范化成空数组，这样 JSON 里出现的是 `[]` 而不是 `null`，避免下游收到一个类型不同的值。

内层循环把所有 `[]byte` 转成 `string`。SQLite 驱动返回文本列时可能给出字节切片，直接序列化成 JSON 会变成 Base64 字符串，既不可读也无法与目标端比对。转换之后，密码哈希和正文都以其本来面貌出现在快照里——这也是为什么快照文件必须按敏感数据保护。

导出后 Normalize 将数据库驱动返回的 []byte 字段转成字符串表示，并校验字段属于模型列白名单、数值可解析、布尔只能是 0/1 或 bool、nullable 列允许 null、ID 正数且不重复。快照以 JSON 文件写出时使用排他创建和受限权限，避免覆盖已有备份；文件包含密码哈希与微信身份信息，仍需视作敏感数据保护。

Repeatable read 的实际能力依赖数据库驱动和隔离级别。SQLite 源快照及 PostgreSQL/MySQL 读事务要按目标数据库实测；导出文件创建本身不是加密备份。文件应该有访问权限、校验和、保留时限及安全删除方式。

## 三、规范化兼容历史字段并检查拓扑顺序

Snapshot.Normalize 校验版本必须等于 1，且只接受声明的 13 张表和模型列。不认识的列或额外表会拒绝；这样能阻止快照偷偷带入 session/dedup 等本次不迁移数据。

值域校验分布在按表分发的函数里：

~~~go
// internal/transfer/snapshot.go（productValues，节选）
func productValues(table string, row map[string]any) error {
	allowed := func(key string, values ...string) error {
		if row[key] == nil {
			return nil
		}
		for _, value := range values {
			if row[key] == value {
				return nil
			}
		}
		return fmt.Errorf("invalid enum %s.%s", table, key)
	}
	switch table {
	case "users":
		if err := allowed("role", "member", "editor", "admin"); err != nil {
			return err
		}
		return allowed("status", "active", "disabled")
	case "articles":
		if err := allowed("status", "draft", "pending", "published"); err != nil {
			return err
		}
		for _, key := range []string{"view_count", "like_count"} {
			if row[key] != nil {
				n, _ := integer(row[key])
				if n < 0 {
					return fmt.Errorf("negative counter articles.%s", key)
				}
			}
		}
	case "comments":
		return allowed("status", "approved", "rejected", "reviewing")
	case "attachments":
		return allowed("storage", "local", "r2")
	case "notifications":
		return allowed("type", "article_published", "comment_approved", "system")
	}
	return nil
}
~~~

`allowed` 是个闭包，接收字段名和一组允许值。字段为 nil 时直接放过——可空列没有值就不做枚举校验；有值时逐个比对，命中任何一个就通过，全都不是就返回错误。

按表分发用 `switch table`。users 校验 role 与 status，articles 校验 status 并额外要求 view_count 和 like_count 不为负，comments 校验三态 status，attachments 校验 storage 只能是 local 或 r2，notifications 校验 type。没列进 switch 的表直接返回 nil。

这段代码挡的是“快照里出现一个业务上不存在的值”。把文章 status 改成 `archived`、把 storage 写成 `s3`，都会在这里被拒绝，而不是等数据落到库里、被某次查询读出奇怪结果之后才发现。校验发生在导入事务内，被拒绝等于没有任何写入发生。

旧版 Node 备份可能没有微信扩展后新增的 credentials_configured 字段。规范化规则对缺失字段补 true，使历史密码账号继续使用既有登录方式；已有字段则保留。MySQL/SQLite 导出的 0/1 布尔也转为 Go bool。每次补默认值都是兼容决策，必须有版本来源和迁移测试，不能对未知字段一律静默补值。

categories 和 comments 都含 parent_id。导入使用 parentsFirst 逐层排列，父项先写、子项后写；若有缺失父节点或循环，无法推进时拒绝快照。分类还验证深度不超过四级。排序由关系拓扑决定，不能仅按 ID 顺序假设父项一定更早。

~~~go
// internal/transfer/snapshot.go（parentsFirst）
func parentsFirst(rows []map[string]any) ([]map[string]any, error) {
	pending := append([]map[string]any(nil), rows...)
	out := []map[string]any{}
	done := map[int64]bool{}
	for len(pending) > 0 {
		next := []map[string]any{}
		for _, row := range pending {
			parent := row["parent_id"]
			pid, _ := integer(parent)
			if parent == nil || done[pid] {
				id, _ := integer(row["id"])
				done[id] = true
				out = append(out, row)
			} else {
				next = append(next, row)
			}
		}
		if len(next) == len(pending) {
			return nil, fmt.Errorf("missing parent or cyclic relationship")
		}
		pending = next
	}
	return out, nil
}
~~~

算法是反复扫描的逐层剥离。`done` 记录已经排好的 ID，`pending` 装还没排的行。每轮遍历 `pending`：一行的 `parent_id` 为 nil（根节点），或者它的父已经排好（`done[pid]` 为真），就把这一行放进 `out` 并标记完成；否则留到 `next` 里下一轮再说。`pending` 换成 `next` 后继续，直到没有剩余。

终止条件有两种。正常情况下每轮至少排掉一批，`pending` 逐渐清空。异常情况下会出现“一轮下来一个都没排掉”——`len(next) == len(pending)`——这只有两种可能：某个父节点在快照里不存在，或者父子关系形成环。两种情况返回同一个错误，因为此时的补救动作一样：回到源端检查数据。

为什么不能按 ID 排序就算完事？因为 ID 大小与树深度没有必然关系。一个后建的子类目完全可以有比父类目更小的 ID，此时按 ID 顺序写入会先插子项，撞上外键约束。

## 四、导入必须拒绝覆盖已有账号

Import 首先 Normalize，再进入目标数据库事务。目标表必须为空；唯一例外是迁移初始化已创建的 site_settings 单例行，工具按 id=1 更新它。refresh_tokens 和 article_view_dedup 即使不在 Snapshot 里也会检查为空，避免在新目标中意外保留其它会话或旧去重数据。

~~~go
// internal/transfer/import.go（ensureEmptyTarget）
// ensureEmptyTarget 拒绝覆盖或合并旧账号，站点初始化单例是唯一例外。
func ensureEmptyTarget(tx *gorm.DB) error {
	// 目标必须为空；不自动合并 ID，不覆盖账号，不重复插入历史内容。
	for _, name := range append(tableNames(), "refresh_tokens", "article_view_dedup") {
		if name == "site_settings" {
			continue
		}
		var count int64
		if err := tx.Table(name).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("target %s is not empty", name)
		}
	}
	return nil
}
~~~

循环的表名是 `append(tableNames(), "refresh_tokens", "article_view_dedup")`——13 张白名单表之外，额外把两张不在快照里的表也加进来检查。这样即使这两张表不会被导入，只要它们已经有数据，也会被拦下。原因是它们代表“新目标上已经发生过登录或阅读”，此时导入等于把两批状态混在一起。

`site_settings` 在循环里被 `continue` 跳过，因为它是唯一允许非空的表：迁移初始化会先建这一行，导入时按 `id = 1` 更新而不是插入。其余每张表只要 `Count` 不为零就返回错误，错误信息里带上表名，让操作者知道是哪张表挡住了导入。

这个检查是“拒绝合并”的落地方式。工具不提供按用户名对齐、不重排 ID、不覆盖已有账号的任何分支——目标不是空的就停下，把是否合并交给一次独立的、需要人为决策的数据处理。

这不是自动合并工具。用户 ID、微信身份、文章 ID 和关系都按快照原值导入；若目标已经有账号或业务记录，工具拒绝执行。强行 ID 对齐或按用户名合并会改变身份归属，需先做独立的数据决策。

导入按表顺序和父子顺序写入。全部写完后运行关系审计：文章作者必须存在；有效文章引用的分类存在；评论父子文章一致；附件引用文章存在；文章 like_count 与 likes 行数相符。任一审计失败就整个事务回滚。

PostgreSQL 导入成功后会重置各表自增序列到现有最大 ID，避免下一条 INSERT 使用重复 ID。该操作只对真实提交执行；dry-run 在 audit 完成后返回内部回滚信号，不重置序列、不保留导入数据。

## 五、dry-run 检查完整导入路径但不持久化

预演并非只解析 JSON 文件。它会执行目标空库检查、所有行写入和关系审计，然后故意返回哨兵错误触发事务回滚；Import 将这个预期哨兵识别为 dry-run 成功。其他错误仍向上返回。

因此 dry-run 可以证明：该快照通过当前 schema 规范化，目标满足空库规则，当前驱动能够执行全部写入 SQL，关系审计通过，事务按设计回滚。它不能证明实际写入后重启仍可读取，不能验证附件字节已迁移，也不能替代生产环境的备份、停写和回退演练。

一次真实导入之后要再次独立运行行数和关键关系核对，并启动新后端执行接口 smoke。不能只凭工具输出 imported counts 宣布迁移完成。

## 六、离线命令示例与敏感数据

概念上的导出命令如下：

~~~sh
TRANSFER_DATABASE_URL=/absolute/path/to/source-copy.db \
  go run ./cmd/data -mode export -driver sqlite -file /secure/path/snapshot.json
~~~

导入预演则指定目标 DSN、驱动和 dry-run：

~~~sh
TRANSFER_DATABASE_URL='postgres://USER:PASSWORD@HOST/EMPTY_DB?sslmode=require' \
  go run ./cmd/data -mode import -driver postgres -file /secure/path/snapshot.json -dry-run
~~~

实际 DSN 格式按 database driver 文档和当前工具实现核对。命令行环境可能进入 shell history、进程列表或 CI 日志，不要把生产密码直接作为可见文本。snapshot 本身也要加密传输和限制访问，因为其中包含密码哈希和个人信息。

## 七、真实切换还需要应用层停写和回退

一个安全的生产切换过程至少还要处理：

1. 选定数据冻结时间，停止旧后台和客户端写入；
2. 对 SQLite/D1 源做一致性备份并校验源版本；
3. 导出快照，计算哈希，检查全部 13 表行数；
4. 将 local/R2 对象按 key 单独复制并逐个校验内容/MIME；
5. 在目标 PostgreSQL 执行迁移，再跑 dry-run；
6. 真实导入并做行数、关系、外键、计数和序列检查；
7. 启动 Go 服务，对只读和受控写入做 smoke；
8. 切换流量并监控；
9. 若回退，明确新后端已产生的写入如何保留或丢弃。

默认不复制活跃 refresh token，因此用户需要重新登录。若旧后端冻结后仍接收写入，快照会漏掉增量数据；不能让两套后端同时任意写同一业务库再指望事后自动合并。本文快照只证明离线工具路径，不代表线上服务已迁移。

## 小结：迁移命令是工具，切换才是运营过程

M6 的 Snapshot 白名单覆盖 13 张业务表，排除活跃会话、阅读去重和对象字节；导出只读，导入针对已迁移空目标，规范化历史字段、拓扑排序并审计关系，dry-run 写完后回滚。它使数据处理可审阅、可演练，但不能替代停写、附件搬运、上线验收和回退准备。

跨数据库迁移要把身份、关系、计数、外部对象和会话逐类定义清楚。只有把所有写入冻结、目标核验并完成客户端 smoke，才能讨论切流。工具报告的一次成功远远不够。

## 延伸阅读

- [版本迁移与模型设计：为什么启动不执行 AutoMigrate]({{LINK:M6-17}})
- [local 与 R2 存储抽象：接口应该小到什么程度]({{LINK:M6-26}})
- [文件与数据库没有共同事务：共享附件怎样补偿]({{LINK:M6-27}})
- [从 Node SQLite 到 PostgreSQL：迁移数据的停写边界](https://blog.csdn.net/fungleo/article/details/165111053)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、数据库迁移、PostgreSQL、SQLite、数据一致性

### 文章简介（250 字以内）

M6 的离线迁移工具如何把 Node SQLite 数据带到 Go PostgreSQL？本文介绍 13 张白名单表、只读 repeatable-read 导出、旧字段规范化、父子关系拓扑排序、空目标导入、审计和 dry-run 回滚机制，并说明 refresh token、阅读去重和对象字节为何不在快照中。文章区分工具预演与真实线上切换，给出停写、附件搬运、核查和回退顺序。

### 建议发布分类

后端 / Go

### 封面短标题

搬迁的是关系和状态

### 配图 AI 提示词

1. M6-28-封面：Node SQLite 只读导出快照，规范化 13 张业务表后导入 PostgreSQL；附件对象通过独立迁移路径复制；以浅蓝白风格呈现。
2. M6-28-导入校验：目标空库、parents-first、关系/计数审计、dry-run rollback、真实导入序列校正的步骤图。

### 发布前核对

- [ ] 核对 Snapshot 表数、排除表、legacy default 和关系审计 SQL。
- [ ] dry-run 不应描述成已持久化或线上迁移完成。
- [ ] 文件快照保护密码哈希与个人信息。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
