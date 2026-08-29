# 成为全栈·Node 后端篇·ORM 为什么选 Drizzle：类型安全与 D1 适配

上一篇我们定了"用关系型、落地用 SQLite 语义"。但真要写查询时，你马上会撞到一个抉择：**直接手写 SQL 字符串，还是用 ORM？**

我在转全栈的头两年是"手写 SQL 派"，觉得 ORM 都是性能与灵活性的敌人。直到一个项目里 SQL 散落在两百个地方、字段一改全靠全局搜索兜底，我才服气——**对内容型、关联密集的业务，ORM 省下的不只是打字，更是"类型帮你挡错"的安全网**。

这篇就聊聊我们为什么选 Drizzle，以及它怎么做到"一份 schema 定义，既用来建表、又用来写类型安全的查询、还能双部署"。

## 一、ORM 到底解决了什么

ORM（Object-Relational Mapping，对象关系映射）的核心，是把数据库里的"表"映射成你代码里的"类型"。于是：

- 你不写 `SELECT id, title FROM articles WHERE status = 'published'`，而是写 `db.select().from(articles).where(eq(articles.status, 'published'))`；
- 查询返回的行，自动带有 `articles` 表推导出的 TS 类型，字段拼错编译器就报错；
- 改了表结构，所有用到该字段的查询在编译期就会被标红，而不是上线后 SQL 报错。

对全栈工程师来说，ORM 最大的甜头是：**你不必先成为 SQL 大师，也能写出不容易出错的数据库代码**。类型系统成了第二道防线。

举个具体的对比。同样是"查已发布文章的前 10 篇标题"，手写 SQL 是：

```sql
SELECT id, title FROM articles WHERE status = 'published' ORDER BY created_at DESC LIMIT 10;
```

而 Drizzle 是：

```ts
db.select({ id: articles.id, title: articles.title })
  .from(articles)
  .where(eq(articles.status, 'published'))
  .orderBy(desc(articles.createdAt))
  .limit(10);
```

两者最终跑的 SQL 一模一样，但 Drizzle 版本里，`articles.status` 的类型是 `'draft' | 'pending' | 'published'` 的联合类型——你把 `'published'` 拼成 `'publised'`（少个 i），编译器立刻标红。手写 SQL 拼错单词？那是运行时才发现的锅。这就是 ORM 给全栈新手的"安全带"：它不替你思考业务，但能拦住大量低级拼写与类型错误。

但这里有个分水岭：不是所有 ORM 都"类型安全"。下面看为什么我们不选最流行的那两个。

## 二、为什么不选 Prisma / TypeORM

**Prisma** 生态最完整，但它的代价是"重"。它有自己的一套 schema 语言（`.prisma` 文件），要跑生成器产出客户端，运行时也偏胖；更关键的是——它对 Cloudflare D1 的支持曾经长期滞后，而 D1 正是我们要双部署的目标之一。此外，Prisma 的 schema 和 TS 类型是"两套东西"，改一处容易忘另一处。

**TypeORM** 用装饰器定义实体，写法啰嗦，而且类型推断偏弱。很多大项目用着用着，查询返回的类型就退化成了 `any`，ORM 的类型安全红利基本丢光——社区里有人戏称它用久了变成 "AnyORM"。

**Drizzle** 的取向正好相反：它的 schema 就是用 TypeScript 写的（就是我们上篇提到的 `src/db/schema.ts`），**类型即 schema，schema 即类型**，没有独立的生成步骤；运行时极薄、贴近原生 SQL；对 D1 是一流支持；打包体积小。对我们这种"要双部署、要类型安全、要轻"的项目，几乎是量身定做。

还有一个容易被忽略的角度：**Drizzle 写起来像在写 SQL，而不是在学一套新 DSL**。Prisma 的查询语法自成体系，你得好一阵子才忘掉原生 SQL；Drizzle 的 `select().from().where()` 几乎是 SQL 的 1:1 翻译。对从前端过来、SQL 底子薄的同学，这意味着你每写一行 Drizzle，都在同步加深对 SQL 的理解，而不是被框进某个 ORM 的黑话里。长期来看，这才是它比"更省事"更值钱的地方。

## 三、同一份 schema，本地和 Cloudflare 通吃

Drizzle 最妙的地方，是"一份定义，两种驱动"。看我们 `db/client.ts` 里的两行：

```ts
export const createLocalDb = (file = ':memory:'): Db => drizzle(new Database(file), { schema });
export const createD1Db = (binding: D1Binding): Db => drizzleD1(binding, { schema }) as unknown as Db;
```

注意两个调用都传了同一个 `schema`——也就是 `src/db/schema.ts`。本地用 `drizzle(better-sqlite3实例)`，CF 用 `drizzleD1(binding)`，但表结构定义只有一份。**这就是双部署在 ORM 层的落点**：你改一次 schema，两套环境的建表与查询类型同时更新，绝不会出现"本地能跑、上了 CF 字段对不上"。

## 四、真实 schema 长什么样

`src/db/schema.ts` 里 `users` 表的定义，是 Drizzle 风格的典范：

```ts
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'),
    email: text('email'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('uniq_username').on(table.username),
    uniqueIndex('uniq_email').on(table.email),
  ],
);
```

几个细节值得记住：

- **DB 字段是 snake_case（`created_at`），TS 属性是 camelCase（`createdAt`）**。这是项目铁律——数据库里用下划线命名，代码里用驼峰，转换在响应层统一做（还记得 M1-03 里 `toArticle` 干的事吗）。
- **`timestamp_ms` 模式**：我们把时间存成毫秒整数，而不是字符串，比较和计算更可靠。
- **唯一索引直接定义在表上**：`uniq_username` / `uniq_email`，Drizzle 会帮你生成对应的 `CREATE UNIQUE INDEX`。
- 定义完，`typeof users.$inferSelect` 自动给出"查询返回的行类型"，`typeof users.$inferInsert` 给出"插入的入参类型"——**你一行类型声明都不用手写**。

这些设计，正是《领域建模》那篇（我们用真实系统把实体和字段敲定）{{LINK:M0-04}} 在代码层的回响；而它和《技术选型不是投票》里"按约束选工具"的思路一脉相承 {{LINK:M0-03}}。

## 五、P-10：`.run()` / `.all()` / `.returning().all()` 的分野（运行时才爆）

用 Drizzle + better-sqlite3，有一个特别阴险的坑（P-10），我在 code review 时见过不止一次：

- **写操作（INSERT/UPDATE/DELETE）用 `.run()`**
- **读操作（SELECT）用 `.all()`**（或 `.get()` 取单行）
- **写完后想立刻拿到插入生成的行（比如自增 id），要用 `.returning().all()`**

坑在哪？在 better-sqlite3 这个**同步驱动**下，如果你对一条 INSERT 错误地写了 `.all()` 而不是 `.run()`，**编译器不会报错**，类型上也糊弄得过去，程序能正常启动、能编译通过——直到那条插入真正在运行时执行，才"砰"地炸出来。这种"编译绿、运行挂"的坑最害人，因为它绕过了你最信任的类型检查。

所以我们的纪律是：**凡是写语句，结尾一律 `.run()`；需要回读就显式 `.returning().all()`**。把这个分野刻进肌肉记忆，比靠 review 兜底靠谱得多。

看个对比就更清楚了。错误的写法：

```ts
// ❌ 编译通过、运行炸：INSERT 用了读操作的 .all()
await db.insert(articles).values({ title: 'x' }).all();
```

正确的写法：

```ts
// ✅ 纯写，不需要回读结果
await db.insert(articles).values({ title: 'x' }).run();

// ✅ 写完后要拿自增 id / 返回值，必须 .returning()
const [row] = await db.insert(articles).values({ title: 'x' }).returning().all();
```

注意 `.returning()` 在 better-sqlite3 这个同步驱动下，要配 `.all()` 才能取出数组。如果你漏掉 `.returning()`，insert 完就拿不到刚插进去的 `id`，又得再发一条查询去捞——既多一次 IO，又容易写出竞态。

## 六、P-11：JOIN 同名列会"ambiguous column"（钩子 M1-17）

另一个 ORM 新手容易栽的跟头（P-11）：当你 `JOIN` 两张表，而它们都有 `id`、`created_at` 这类同名字段时，如果你在 `ORDER BY` 里写裸的 `created_at`，SQLite 会报 `ambiguous column`（列名歧义），直接 500。

这是因为 JOIN 之后结果集里有两个 `created_at`，数据库不知道你排哪个。解决法很简单也很严格：**ORDER BY 必须显式限定基表**，比如 `ORDER BY articles.created_at DESC`。这条规则在我们做"列表接口三件套"（分页/筛选/排序）那篇 {{LINK:M1-17}} 会反复用到，因为列表查询几乎必然 JOIN（比如按标签筛文章）。先在这里埋个伏笔。

给个直观例子。按标签筛文章时 JOIN 了 `article_tags` 与 `tags` 两张表：

```ts
// ❌ created_at 两张表都有，数据库不知道排哪个 → ambiguous column 500
.orderBy(created_at);

// ✅ 显式限定基表
.orderBy(articles.createdAt);
```

养成"`ORDER BY` / `SELECT` 里的裸列一律带表名前缀"的习惯，能从根上消灭这类运行时 500。

## 七、补一句：Drizzle 不是银弹

讲完好处得泼盆冷水，免得你走向另一个极端——以为 ORM 能包办一切。有两个场景我仍会直接写 SQL：

**一是复杂聚合与窗口函数。** 比如"每篇文章按发布时间排名""按分类统计文章数并算占比"，Drizzle 的链式 API 表达起来别扭，不如一段 raw SQL 清晰。Drizzle 完全支持 `sql\`...\`` 原生片段，该下场时就下场，不必硬凹链式。

**二是全文搜索与特定索引优化。** 后面搜索那篇 {{LINK:M1-19}} 会看到，我们要在 `LIKE` 和真正的全文索引之间做权衡，底层离不开手写 SQL。

所以正确的心智是：**日常 CRUD 交给 Drizzle 吃类型安全的红利，少数复杂查询用 raw SQL 兜底**。ORM 是工具，不是牢笼。

## 八、P-12 前瞻：迁移不靠多语句 exec

还有一条和 ORM 紧邻的纪律（P-12），留到迁移那篇 {{LINK:M1-06}} 细讲，这里先点一句：better-sqlite3 的 `prepare` **不支持一条语句里塞多个 `;` 分隔的 SQL**。所以我们 `migrate.ts` 是把建表语句拆成数组、逐条 `db.run(sql.raw(stmt))` 执行的。D1 那边则走 `drizzle-kit generate + migrate` 的正经迁移流水线。这块是"代码能跑"和"线上数据不脏"的分界线，值得单独成文。

## 九、小结与前瞻

这一篇我们锁定了 ORM 选型：

1. **ORM 的价值**：把表映射成类型，编译期挡错，不必先成 SQL 大师。
2. **不选 Prisma**：重、有独立 schema 语言、D1 支持曾滞后。
3. **不选 TypeORM**：装饰器啰嗦、类型易退化成 any。
4. **选 Drizzle**：schema 即 TS 类型、零生成步骤、贴近 SQL、D1 一流、体积小。
5. **一份 schema 双驱动**：本地 `drizzle()` 与 CF `drizzleD1()` 共用 `schema.ts`，双部署在 ORM 层落点。
6. **P-10**：写用 `.run()`、读用 `.all()`、回读用 `.returning().all()`，写语句错用 `.all()` 编译不报错、运行时才爆。
7. **P-11**：JOIN 后 `ORDER BY` 必须限定基表，否则 `ambiguous column` 500。

下一篇（{{LINK:M1-06}}）我们聊数据迁移：表结构怎么改、历史数据怎么迁、为什么不能用"多语句 exec"偷懒，以及 D1 生产环境该怎么安全地应用迁移。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

---

## 配图提示词（发布前整段删除）

- `05-Drizzle双驱动图`：一张图展示"同一份 schema.ts"分叉出两条箭头——左到"本地 better-sqlite3（drizzle()）"、右到"Cloudflare D1（drizzleD1()）"，两条箭头汇到"同一套类型安全查询"。风格：扁平技术博客配图、配色与专栏封面一致、可放中文小标签（如"schema 即类型"）。
- 复用说明：文末订阅图用真实 URL 直填，发布前勿删订阅块；本篇配图提示词段整体在发布前删除。
