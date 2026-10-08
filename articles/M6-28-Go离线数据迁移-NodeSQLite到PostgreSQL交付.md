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

refresh_tokens 不搬迁，避免把活跃会话从旧后端延续到新后端；用户需要重新登录。article_view_dedup 也不搬迁，迁移后阅读冷却窗口重新计时。对象本体不在 JSON 快照里，attachments 行只保留 key、storage、URL、MIME、size 等元数据，因此附件内容需要单独搬运并校验。

这项范围选择必须提前说清。复制 users 而漏掉 wechat_identities 会让微信用户找不回原账号；复制附件元数据但不复制对象字节会得到损坏引用；复制 refresh token 可能让旧安全会话继续有效。迁移策略要先描述每类状态的保留与重置。

## 二、导出要只读且尽量取得一致快照

Export 在只读、repeatable read 事务中按固定表白名单和 ID 顺序读取所有记录。源端 SQLite 使用 read-only DSN，避免工具无意创建缺失文件或修改 journal mode；其它数据库采用只读事务选项。每张空表输出 []，不是 null，快照附带版本、来源 driver 与创建时间。

导出后 Normalize 将数据库驱动返回的 []byte 字段转成字符串表示，并校验字段属于模型列白名单、数值可解析、布尔只能是 0/1 或 bool、nullable 列允许 null、ID 正数且不重复。快照以 JSON 文件写出时使用排他创建和受限权限，避免覆盖已有备份；文件包含密码哈希与微信身份信息，仍需视作敏感数据保护。

Repeatable read 的实际能力依赖数据库驱动和隔离级别。SQLite 源快照及 PostgreSQL/MySQL 读事务要按目标数据库实测；导出文件创建本身不是加密备份。文件应该有访问权限、校验和、保留时限及安全删除方式。

## 三、规范化兼容历史字段并检查拓扑顺序

Snapshot.Normalize 校验版本必须等于 1，且只接受声明的 13 张表和模型列。不认识的列或额外表会拒绝；这样能阻止快照偷偷带入 session/dedup 等本次不迁移数据。

旧版 Node 备份可能没有微信扩展后新增的 credentials_configured 字段。规范化规则对缺失字段补 true，使历史密码账号继续使用既有登录方式；已有字段则保留。MySQL/SQLite 导出的 0/1 布尔也转为 Go bool。每次补默认值都是兼容决策，必须有版本来源和迁移测试，不能对未知字段一律静默补值。

categories 和 comments 都含 parent_id。导入使用 parentsFirst 逐层排列，父项先写、子项后写；若有缺失父节点或循环，无法推进时拒绝快照。分类还验证深度不超过四级。排序由关系拓扑决定，不能仅按 ID 顺序假设父项一定更早。

## 四、导入必须拒绝覆盖已有账号

Import 首先 Normalize，再进入目标数据库事务。目标表必须为空；唯一例外是迁移初始化已创建的 site_settings 单例行，工具按 id=1 更新它。refresh_tokens 和 article_view_dedup 即使不在 Snapshot 里也会检查为空，避免在新目标中意外保留其它会话或旧去重数据。

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
- [从 Node SQLite 到 PostgreSQL：迁移数据的停写边界]({{LINK:M1-28}})

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
