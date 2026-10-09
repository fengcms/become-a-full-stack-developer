# 成为全栈·基础补充·SQL 入门：从 SELECT 到 JOIN

第一次写这个项目的查询时，我写了这么一句：

```ts
.where(eq(articles.status, 'published'))
```

然后发现不对——**草稿也被查出来了**。

因为我漏了 `deleted_at IS NULL`。而这只是一个软删除标志而已。

这篇讲 SQL 里那些"语法简单但语义有坑"的地方，以及为什么这个项目把查询逻辑收在 `shared/pagination.ts` 这样的一个文件里。

{{IMG:B-05-封面}}

## WHERE 的三个坑

### 一、NULL 不是等于 NULL

这是 SQL 最反直觉的一点。

```sql
-- ❌ 错误：查不出 category_id 为空的文章
WHERE category_id = NULL

-- ✅ 正确
WHERE category_id IS NULL
```

**原因在标准 SQL 的三值逻辑**：`NULL` 表示"未知"，而不是"空"。

而 `NULL = NULL` 的结果是 **`UNKNOWN`** 而不是 `TRUE`——**所以 `WHERE` 会把它当作不通过。**

**而这个项目里的真实用法是反过来的：**

```sql
ORDER BY COALESCE(articles.published_at, articles.created_at)
```

**`COALESCE` 的意思是"取第一个非 NULL 的值"** ——草稿没有 `published_at`，就用 `created_at` 参与排序。

而如果没有这个 COALESCE，**排序结果会是：所有有 published_at 的排在前面（降序），然后是 NULL 排在最后**——**而"最后"在 DESC 下通常就是最前面**（因为 NULL 在 SQLite 里被当作最小值）。

**结果是草稿混进了最新列表。** 这就是那个 bug 的真实成因——**不是 WHERE 漏了条件，是排序对 NULL 的处理让草稿冒出来了。**

### 二、LIKE 的通配符会传染

```sql
WHERE title LIKE '%关键词%'
```

这个写法常见，但有一个坑：**`%` 和 `_` 是通配符，而用户输入里的这两个字符会被当通配符解释。**

用户搜 `100%` 时，`%100%%` 会匹配"任何包含 100 的内容"——**不是他想要的结果。**

而在 SQLite 里，LIKE 默认**对大小写不敏感**，所以 `LIKE` 和 `INSTR` 的行为也不一致：

```sql
-- 大小写敏感的做法
WHERE INSTR(lower(title), lower(?)) > 0
```

**而这个项目的搜索接口走的是 SQLite 全文搜索（FTS）而不是 LIKE**，B-11 讲的白名单只管排序字段不管搜索。

### 三、COUNT 的三种写法结果不同

```sql
SELECT COUNT(*) FROM articles;
SELECT COUNT(1) FROM articles;
SELECT COUNT(id) FROM articles;
SELECT COUNT(deleted_at) FROM articles;   -- ← 这个数的是非 NULL 的
```

**前三者等价**（除非有 NULL 列，COUNT(*) 仍然数全部）。

**第四个不同**：它数的是 `deleted_at` 非 NULL 的行——**也就是"被软删除的文章数"**。

**而这个项目恰好需要"未删除的文章数"，所以不能用 COUNT(*)：**

```sql
SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL;
```

**这两句话的区别就是那个 bug 的全部。** 而它属于一类更隐蔽的错误：**语法对、结果"看起来合理"、只有特定数据下才错。**

## JOIN：左连接和内连接的差别

现在说 JOIN。而这个项目里有一处真实的、值得讲的用法：

```ts
await db
  .select({ user: users })
  .from(wechatIdentities)
  .innerJoin(users, eq(users.id, wechatIdentities.userId))
  .where(and(eq(wechatIdentities.appId, appId), eq(wechatIdentities.openId, openId)))
```

**这段是从两张表里取数据**：`wechat_identities`（微信身份）和 `users`（用户），通过 `users.id = wechat_identities.user_id` 关联。

而 `innerJoin` 的语义是：**两边都必须有匹配的行。**

| JOIN | 语义 | 什么时候用 |
|---|---|---|
| `INNER JOIN` | 两边都匹配才保留 | **两边都必须存在**（上面这个查询） |
| `LEFT JOIN` | 左边全部保留，右边没匹配补 NULL | **左边的行都要**（比如列出所有文章和它们的作者） |

**如果这里用了 LEFT JOIN 会怎样？**

那么即使 `wechat_identities` 没有匹配，也会返回一行——而 `user` 字段是 `null`。然后：

```ts
if (!user) throw new AppError(ErrCode.INTERNAL, 500, '微信账号创建失败，请重试');
```

**代码里那句 `if (!user)` 的检查，其实在 INNER JOIN 下永远不成立。**

**而它存在是有原因的**——它防的是"插入成功但查不到"这种异常状态。**防御性代码处理的是不该发生的情况。**

顺带说一个 B-06 提过的细节：**JOIN 之后列名可能歧义。**

```ts
/** 统一以 articles. 限定基表列：queryArticles 恒以 articles 为基表，
 * 标签 JOIN（B3.5 article_tags）后 created_at / id 等会歧义，限定基表可根除。 */
```

**`articles` 和 `article_tags` 都有 `created_at`**，而 SQLite 在某些版本下会报"字段名歧义"或者**随便挑一个**。

而这个 bug 的隐蔽之处在于：**开发时数据量小，可能某条查询恰好没 JOIN 那张表**——**所以本地不报错，线上报错。**

**而"限定表名"这个修复是零成本的**——`articles.created_at` 永远正确，有没有歧义都不影响。

## ORDER BY 和分页：稳定键的作用

现在讲这个项目里最值得学的 SQL 片段：

```ts
/** 解析排序为 SQL 片段（白名单字段 + 方向，末位追加 id DESC 稳定键）。 */
export const buildSortSql = (sort?: string): SQL => {
  const bare = sort?.startsWith('-') ? sort.slice(1) : sort;
  const raw = bare && bare in SORT_COLUMNS ? (sort ?? '-publishedAt') : '-publishedAt';
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  const column = SORT_COLUMNS[field] ?? 'COALESCE(articles.published_at, articles.created_at)';
  const dir = desc ? 'DESC' : 'ASC';
  return sql`${sql.raw(column)} ${sql.raw(dir)}, articles.id DESC`;
};
```

**注意末尾那个 `articles.id DESC`**——它不是可有可无的装饰。

**考虑这个场景**：一页 20 条，第 2 页也是 20 条，中间没有任何新数据插入。

那第 1 页的第 20 条和第 2 页的第 1 条应该正好衔接，**没有重复、没有遗漏**。

**但如果排序键有相同的值**（比如两篇文章 `published_at` 完全相同——同一秒发布），数据库**不保证它们的相对顺序**。

于是可能出现：第 1 页包含 A、B，第 2 页又包含 B。**用户会看到重复的文章。**

**加上 `id DESC` 之后，排序结果完全确定**——因为 id 唯一，所以任意两篇文章的相对顺序唯一。**翻页时就绝不会重复或遗漏。**

而这个项目和 M4-12 讲的那个"客户端也要去重"是同一件事的两端：

| 位置 | 手段 |
|---|---|
| **SQL（这里）** | 加稳定键 `id DESC`，保证翻页正确 |
| **客户端（M4-12）** | 按 id 去重，兜住并发导致的偏移 |

**两个都做，才稳。** 因为客户端去重只能保证"不出现重复"，**而服务端加稳定键才能保证"不遗漏"。**

顺带说 `OFFSET` 分页的一个固有问题：

```ts
return { page, pageSize, offset: (page - 1) * pageSize };
```

`OFFSET 5000` 意味着数据库**要跳过前 5000 行**——**而它还是得扫描它们**（或者至少遍历索引）。

所以**页码越深，查询越慢**，而这个增长是非线性的。

**游标分页（`WHERE id < ? ORDER BY id DESC LIMIT 20`）能解决它**，但**它不支持跳页**——用户不能直接去第 50 页。

**这个取舍是产品决定的**：内容站很少有人翻到第 50 页，而列表页翻页几乎无感。**所以这个项目选了 OFFSET 简单方案。**

## 聚合：这个项目里的一处真实需求

会员中心要显示"我有多少个赞"，而 M4-18 讲过一个发现：

**点赞列表接口没有返回总数。**

所以那段代码是这么写的：

```ts
int likes = 0, page = 1;
while (true) {
  const batch = await read(Endpoints.meLikes, query: {'page': page, 'pageSize': 100}) as List;
  likes += batch.length;
  if (batch.length < 100) break;
  page++;
}
```

**这是一个在应用层做的聚合。** 而如果接口支持总数，它应该是一句 SQL：

```sql
SELECT COUNT(*) FROM likes WHERE user_id = ?;
```

**而这个项目的其他三个数字都是这么来的：**

```ts
'counts': {
  'favorites': results['favorites']['pagination']['total'],
  'history': results['history']['pagination']['total'],
  'articles': results['articles']['pagination']['total'],
},
```

**三个用 SQL 的 COUNT，一个用循环。** 差异的根源是接口返回形式不同——**而这个差异最终变成了客户端的成本。**

**所以"接口该返回什么"这个决策，影响的不只是后端实现，还有客户端要写多少代码。** 这和 B-06 讲的"服务端约束只能收紧"是同一类思考：**你返回的形式决定了别人要付多少代价。**

## 字段错误怎么从 Zod 映射到响应

SQL 那一层之上的入参校验，这个项目用的是 zod，而它的错误映射值得单独看：

```ts
/** 将校验失败转成契约 4001 响应（hook 复用，避免重复构造）。 */
const toValidationResponse = (error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Response => {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
  return failResponse(ErrCode.VALIDATION, 400, { errors });
};
```

**注意 `issue.path.join('.')`** ——Zod 的 `path` 是一个数组（`['body', 'username']`），而契约里 `field` 是一个字符串。

**这个 `join` 就是"内部表示 → 对外契约"的转换点。** 而它的必要性来自一个具体场景：**嵌套字段的错误路径必须能被前端定位到具体输入框。**

```json
{
  "code": 4001,
  "data": { "errors": [{ "field": "username", "message": "至少 8 个字符" }] }
}
```

而这个 `errors` 数组最终会变成 M4-18 讲的表单里的字段级提示——**所以"路径怎么表示"不是内部细节，它直接决定了用户看到什么。**

顺带说 `|| '_'` 那个兜底：**当 path 为空时（顶层校验失败）用 `_`**，而不是空字符串。** 因为前端要用它做 key，空字符串会让所有字段的错误都聚到一个不可定位的地方。

**而这一段代码的价值在于它说明了"校验失败"不该抛异常**——它是一个**正常的业务响应**（400 + 契约里的 4001），不是 500。

**这两者的区别是巨大的**：4001 告诉客户端"你填错了，改哪里"，500 告诉它"服务器坏了，重试"。


## 一条我一开始想省掉的事

那个 `articles.id DESC` 稳定键，我一开始觉得没必要。

理由是"文章列表通常不会有一模一样的发布时间"。

而这个问题是在真机上暴露的：**我当时导了一批测试数据进去，它们的时间戳全是同一个值**（脚本生成的）。

结果就是：**列表往下滑，每一页的开头都重复三条文章。**

而它的隐蔽之处在于：**如果是两个用户恰好同一秒点了发布，那就完全可能发生**——不需要批量导入。

**而这类 bug 的特点是"偶尔出现一次，用户不一定意识到是 bug"**——他划走了，看到下一篇文章，然后忘了。

所以这条规则现在写进了注释里：

```ts
/** 末位追加 `id DESC` 稳定键避免分页重漏。 */
```

而这也是我在 B-06 讲的那个判断的另一个例子：**"数据分布会影响正确性"**——而开发环境的数据分布和真实场景通常不一样。

## 小结

SQL 这一章，沉淀下来的是四件事：

1. **NULL 的三值逻辑** —— `= NULL` 永远不成立，而 `COALESCE` 是处理它的标准手段。
2. **COUNT 的写法决定数什么** —— `COUNT(*)` 数全部，`COUNT(列)` 数非 NULL。
3. **JOIN 的选择决定哪些行会消失** —— INNER 和 LEFT 的差别在"右边没匹配时"。
4. **ORDER BY 必须加稳定键** —— 否则分页会有重复或遗漏，而它只在同值数据上出现。

其中第 4 条我觉得是这一章最实用的：**它不依赖数据量、不依赖并发，只依赖"是否存在相同的排序键"，而那个概率不低。**

而这一条和 B-06 讲的索引、M4-12 讲的客户端去重，构成同一个问题的三端答案：

| 端 | 手段 | 防什么 |
|---|---|---|
| SQL | `id DESC` 稳定键 | **遗漏** |
| 客户端 | 按 id 去重 | **重复** |

**而 M4-18 那个"逐页扫描数点赞"则是一个反面案例**：它不是因为写得不好，而是**因为接口没提供那个数字**。所以接口设计要考虑客户端要付多少代价，而不只是"能不能返回"。

下一篇讲 Linux 服务器。它会讲那些"本地能跑、线上不行"的环境差异——包括 `wrangler.toml` 里那行注释描述的那个坑。

## 延伸阅读

- [数据库索引：为什么加了索引还是慢]({{LINK:B-06}})
- [数据库迁移与事务：数据结构怎样安全演进]({{LINK:B-18}})
- [列表分页与下拉刷新：去重、失败保留和返回位置]({{LINK:M4-12}})

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
