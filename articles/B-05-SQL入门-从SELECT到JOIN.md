# 成为全栈·基础补充·SQL 入门：从 SELECT 到 JOIN

> 数据库不只是后端保存 JSON 的地方。用 SQL 描述要取哪些行、如何关联和排序，可以让我们把页面需求翻译成清楚、可验证的数据查询。

{{IMG:B-05-封面}}

## 前言：从页面上的文章列表开始

一个文章列表通常显示标题、作者、发布时间和分类。初学者容易先想“要写几张表”，再写出一堆互相独立的查询。SQL 的思路是先提出问题：需要哪些字段？哪些文章可见？按什么规则排序？如何分页？作者和分类信息从哪里来？然后再决定查询结构。

本文使用简化的内容系统数据模型说明 SQL 基础。示例字段用于教学，实际项目以数据库 schema 和迁移文件为准。

## 一、表、行、列和主键

关系数据库把数据放在表中。`articles` 表每一行代表一篇文章，列代表属性；`users` 保存账号，`categories` 保存分类。主键用于唯一定位一行，外键表达一张表引用另一张表。

```text
articles: id | title | author_id | category_id | status | published_at
users:    id | username | display_name
categories: id | name | slug
```

如果把作者名称复制到每篇文章里，作者改名时需要更新很多行，容易出现不一致。保存 `author_id` 并关联 `users`，通常能让“账号资料”保持单一事实来源。合理的冗余有时可提升读取效率，但应该是有意识的设计，而不是重复存储的默认选择。

## 二、用 SELECT 选择需要的数据

```sql
SELECT id, title, published_at
FROM articles
WHERE status = 'published'
ORDER BY published_at DESC, id DESC
LIMIT 20 OFFSET 0;
```

`SELECT` 指定结果列，`FROM` 指定数据来源，`WHERE` 过滤行，`ORDER BY` 排序，`LIMIT/OFFSET` 分页。稳定排序很重要：如果只按发布时间排序，多个文章时间相同，数据库可以用不同顺序返回；再加唯一的 `id` 作为次级排序，分页结果更稳定。

SQL 的逻辑处理顺序通常可理解为：先确定来源，再过滤、分组、选择和排序。数据库优化器可能用不同执行计划实现它，但结果语义应符合查询要求。

## 三、条件、比较和 NULL

`WHERE` 可使用 `=`, `<>`, `>`, `IN`, `LIKE`, `AND`, `OR` 等条件。要注意优先级，复杂组合要加括号。`NULL` 表示未知或缺失，不能用 `column = NULL` 判断；应使用 `IS NULL` 或 `IS NOT NULL`。

```sql
SELECT id, title
FROM articles
WHERE status = 'published'
  AND (category_id = ? OR category_id IS NULL);
```

问号是参数占位符示意，实际驱动语法会不同。用户输入值应通过数据库驱动的参数绑定传入，不能直接拼接到 SQL 字符串，否则输入可能改变查询语法并形成注入漏洞。排序字段名无法像普通值一样安全绑定，动态排序应来自代码白名单。

## 四、JOIN 把相关表连接起来

文章列表想显示作者昵称，需要把文章表和用户表关联：

```sql
SELECT a.id, a.title, u.display_name
FROM articles AS a
JOIN users AS u ON u.id = a.author_id
WHERE a.status = 'published'
ORDER BY a.published_at DESC, a.id DESC;
```

`JOIN` 默认是 `INNER JOIN`，只有两边匹配的行才出现。`LEFT JOIN` 保留左表所有行，即使右表没有匹配值，右侧列也会是 `NULL`。选择哪种取决于业务：若文章必须有作者，内连接通常合适；若关联信息可缺失但列表仍要显示文章，左连接更合适。

多对多关系通常需要中间表。例如文章和标签：

```text
articles ── article_tags ── tags
```

一篇文章有多个标签，一个标签也能关联多篇文章。中间表保存两个外键，通常对 `(article_id, tag_id)` 建唯一约束，防止重复关联。相关设计见 [数据建模文章]({{LINK:M1-31}})。

## 五、聚合和分组

`COUNT`、`SUM`、`AVG`、`MIN`、`MAX` 可以对多行计算。`GROUP BY` 按字段分组，`HAVING` 在聚合后过滤：

```sql
SELECT category_id, COUNT(*) AS article_count
FROM articles
WHERE status = 'published'
GROUP BY category_id
HAVING COUNT(*) >= 3;
```

`WHERE` 过滤原始行，`HAVING` 过滤分组结果。若只统计某分类的文章数，一条聚合查询通常比先把所有文章读到应用内存再循环计算更清楚、也更节省网络传输。

## 六、插入、更新和删除

```sql
INSERT INTO articles (title, author_id, status)
VALUES (?, ?, 'draft');

UPDATE articles
SET title = ?
WHERE id = ?;

DELETE FROM articles
WHERE id = ?;
```

`UPDATE` 和 `DELETE` 尤其要检查 `WHERE`。漏掉条件可能影响整张表。执行前可以先用同一条件执行 `SELECT` 检查目标行数；重要批量操作要使用事务和备份。软删除则用状态或删除时间标记记录，不是真正删除；查询是否过滤软删除记录要形成明确约定。

更新零值也需要小心。ORM 有时会跳过空字符串、0、false 等语言零值；即使 SQL 写法正确，应用层对象映射也可能改变更新内容。接口字段语义见 [B-16]({{LINK:B-16}})。

## 七、事务把相关语句放在一起

银行转账需要从一个账户扣款并给另一个账户入账，两步必须一起成功。事务通常由 `BEGIN` 开始，以 `COMMIT` 确认；出错时 `ROLLBACK` 撤销本次未提交的数据库修改。事务隔离级别和锁会影响并发读写，但不是越强越好，具体要考虑一致性需求和数据库负载。

事务只覆盖它所在数据库中的工作。向对象存储上传文件、调用微信接口无法因数据库回滚而自动撤销，需要单独设计补偿。完整迁移和事务边界见 [B-18]({{LINK:B-18}})。

## 八、SQL 先追求明确，再考虑优化

使用 SQL 的第一步是结果正确且语义明确：筛选条件是什么、NULL 如何处理、排序是否稳定、关联是否会重复行、分页边界是否一致。数据量上来后，再结合索引和 `EXPLAIN` 看执行计划；不要因为担心慢就盲目给所有字段加索引。索引专题见 [B-06]({{LINK:B-06}})。

## 小结：把自然语言问题翻译成集合操作

先用表和主外键理解数据关系，再用 SELECT、WHERE、JOIN、GROUP BY、ORDER BY 和 LIMIT 逐步表达需求。参数化输入保护查询语法，事务保护一组数据库变更，唯一约束保护关系不变量。SQL 学习的重点不是背语法，而是能清楚说明结果为何包含这些行、为何排序如此，以及失败时数据处于什么状态。

## 延伸阅读

- [数据库索引：为什么加了索引还是慢]({{LINK:B-06}})
- [数据建模手艺：从前端 state 到数据库 schema]({{LINK:M1-31}})
- [数据库迁移与事务：数据结构怎样安全演进]({{LINK:B-18}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

SQL、数据库、SELECT、JOIN、数据建模、后端开发

### 文章简介（250 字以内）

本文以文章系统为例介绍 SQL 的基本思路：用 SELECT 和 WHERE 取出目标集合，用 JOIN 关联作者与分类，用 GROUP BY 统计，再以稳定排序和分页输出。文章也解释 NULL 判断、参数化查询、插入更新删除的风险、事务边界，以及 ORM 零值可能带来的更新问题。读完后，你能把“页面需要显示什么”拆解成可检查的数据库查询。

### 建议发布分类

数据库 / SQL

### 封面短标题

把页面需求写成 SQL

### 配图 AI 提示词

1. B-05-封面：文章、用户、分类、标签四张关系表通过主键外键相连，旁边展示一条清晰的 JOIN 查询。
2. B-05-SQL结构：SELECT、FROM、WHERE、JOIN、GROUP BY、ORDER BY、LIMIT 的查询流程图。

### 发布前核对

- [ ] 示例列名标注为教学简化模型，不误称为线上当前 schema。
- [ ] 参数绑定和动态排序白名单的安全表述准确。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
