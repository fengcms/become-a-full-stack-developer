本文聚焦 Node 后端项目的数据迁移方案，讲解线上修改数据表结构的安全实践。文章首先剖析手动执行 ALTER TABLE 改动线上库带来不可追溯、无法复现等多重风险，提出所有结构变更都应写成版本化迁移脚本。结合项目本地环境与 Cloudflare D1 双部署的架构，设计两套差异化迁移路径：本地开发使用内联语句数组循环执行，依靠IF NOT EXISTS实现幂等重置；生产环境借助 drizzle‑kit 生成迁移文件，于部署流水线执行，两条路径同源共用一份 schema 定义。同时点明 better‑sqlite3 不支持多语句一次性执行、需拆分单条 SQL 运行的坑点，给出优先做加法变更、上线前备份、软删除替代物理删除的回滚与风险防控策略。最后着重提醒 better‑sqlite3 事务属于同步 API，回调内不可使用异步 await，避免事务失效。文末预告后续环境变量配置管理相关内容。

# 成为全栈·Node 后端篇·数据迁移：schema 变更如何不弄脏线上数据

上一篇聊完 ORM，你大概觉得"建表"就是写个 `schema.ts` 的事。但真实的软件要活好几年，表结构不可能一成不变——今天加个 `bio` 字段，下周要给文章加 `cover_image`，三个月后分类要支持层级。**怎么改表，又不把线上数据搞丢、不搞乱，是一门正经的工程学问**，这行话叫"数据迁移（migration）"。

我在职业生涯里见过最惨的事故，就是有人直接在线上数据库手敲了一条 `ALTER TABLE`，没备份、没记录，结果字段类型改崩、旧数据全空，最后只能从昨天半夜的备份恢复，丢了大半天业务。这一篇就是帮你绕开这类坑。

![成为全栈·Node 后端篇·数据迁移：schema 变更如何不弄脏线上数据](https://i-blog.csdnimg.cn/direct/9e6ad663f8834a5aa3dc95be14bc62d3.png)

## 一、为什么不能"手动改表"

你可能会想：不就是加个字段吗，我连上数据库执行一条 SQL 不就好了？短期看确实快，但代价是：

1. **不可追溯**。你今天改了什么，半年后没人记得，新同事拉下代码一跑，本地库和线上库结构对不上。
2. **不可复现**。测试环境怎么造出和线上一样的表？靠口口相传的"你记得也 ALTER 一下"？迟早漏。
3. **不可回滚**。改错了怎么办？没有"反向脚本"，只能祈祷备份够新。
4. **团队协作冲突**。两个人各改各的，合并时谁的结构算数？

所以业界共识是：**所有 schema 变更都写成"迁移脚本"，按时间顺序编号、进版本库、可重复执行**。迁移脚本本身就是一份"数据库的成长日记"，任何人拉下代码都能把库重建到最新状态。

举个更贴近你日常的例子：你给 `users` 表加了 `avatar_url` 字段，本地库手敲 ALTER 改了，代码也写了读这个字段。结果测试同学拉了你的分支，他的本地库没 ALTER，一启动满屏报错；线上更惨，字段不存在，所有读 `avatar_url` 的请求直接 500。如果这事写成迁移脚本随代码进库，谁拉代码谁自动补齐结构，这种"在我机器上是好的"的扯皮从根上消失。迁移不是给 DBA 的仪式，是给整个团队的安全网。

这和我们《契约先行》那篇的精神是一脉相承的——**结构的变更也要有单一事实源、可机器校验**，不能靠人脑兜底 [契约先行](https://blog.csdn.net/fungleo/article/details/164140515)。

## 二、我们的两套迁移路径

这个项目因为要"双部署"，迁移也分两条路，但目标一致：**让任意环境都能从零重建出正确的表结构**。

**路径 A：本地 / 测试 —— `migrate()` 内联建表。**

`src/db/migrate.ts` 里把建表语句收进一个 `STATEMENTS` 数组，启动时按顺序执行：

```ts
export const migrate = async (db: Db): Promise<void> => {
  for (const statement of STATEMENTS) {
    await db.run(sql.raw(statement));
  }
  // 站点配置单条默认值（id=1），幂等
  await db.insert(siteSettings).values({ ... }).onConflictDoNothing().run();
};
```

注意它有两个特征：**幂等**（用了 `CREATE TABLE IF NOT EXISTS` 和 `onConflictDoNothing`，重复跑不会报错）和**开发/测试导向**（内存库或文件库，每次起服重建即可）。

**路径 B：Cloudflare D1 生产环境 —— drizzle-kit 正经流水线。**

`drizzle.config.ts` 配好了：

```ts
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
```

生产部署时，由 `drizzle-kit generate` 根据 `schema.ts` 生成标准 SQL 迁移文件，再在 **deploy 阶段**通过 `migrate` 应用到 D1。为什么不在运行时跑？因为 D1 是托管服务，迁移属于"发布动作"而非"请求动作"，交给部署流水线更可控、可审计。

你可能会问：为什么本地不用 drizzle-kit、非要手写 `STATEMENTS` 数组？答案还是"场景适配"。本地开发要经常重置库、加字段试错，内联数组配上 `IF NOT EXISTS` 一眼能看全、改起来快；而生产迁移要的是"可审计、可版本化、能 diff"，drizzle-kit 生成的 SQL 文件正好承担这个角色。两套机制服务不同阶段，不必强求统一——这和我们"按约束选工具"的一贯思路一致 [技术选型不是投票](https://blog.csdn.net/fungleo/article/details/164121738)。

两条路共用同一个 `schema.ts` 作为事实源——这又回到了我们反复强调的"双部署一致性"：改一次 schema，本地和 D1 的表结构同源演化。

## 三、P-12：迁移不靠"多语句 exec"

这里有个很具体的坑（P-12），值得单拎出来说。很多 ORM 教程会教你用 `db.exec("CREATE TABLE a(...); CREATE TABLE b(...);")` 一口气塞多条 SQL。但 **better-sqlite3 的 `prepare` 不支持一条语句里包含多个 `;` 分隔的子句**——它会报错或只执行第一条。

所以我们的 `migrate.ts` 才把每个建表/建索引写成数组里的**独立一项**，再循环逐条 `db.run(sql.raw(statement))`：

```ts
const STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (...)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_username ON users (username)`,
  `CREATE TABLE IF NOT EXISTS articles (...)`,
  // …每个对象一张表 / 一个索引
];
for (const statement of STATEMENTS) {
  await db.run(sql.raw(statement));
}
```

这个"按 `;` 拆成单条、循环执行"的纪律，是 better-sqlite3 驱动的客观限制倒逼出来的。如果你哪天图省事写成一整段多语句字符串，本地一跑就挂。记住：**迁移脚本的每一条都该是能独立执行的原子 SQL**。

![表结构同源演化](https://i-blog.csdnimg.cn/direct/58c9cb06641045cc97e3731efed3705a.png)

## 四、回滚策略与"不可逆操作"的敬畏

写迁移，脑子里要永远留一半给"万一要撤回"。我给自己定几条铁律：

**第一，优先"加法"而非"改法"。** 想给文章加 `cover_image`，就 `ADD COLUMN`，旧数据这列自动为 NULL，向后兼容。别去把 `content` 改成别的类型、别去 `DROP COLUMN`——这些一旦执行，数据就没了。

**第二，把迁移当成"正向 + 补偿"成对写。** 虽然我们项目目前靠 `IF NOT EXISTS` 保证幂等重建，但生产环境的复杂迁移，好习惯是同时准备好回滚脚本（比如新建的表怎么删、加的字段怎么卸），上线前先演练回滚路径，而不是出事了才现想。

**第三，动生产库前必须备份。** 这是底线中的底线。任何 `DROP` / 数据洗写类迁移，执行前先快照。我们内容型站点数据量小，但"小"不是不备份的理由。

**第四，不可逆操作要文档化。** 比如"软删除"我们是用 `deleted_at` 标记而非真删行，就是为了可恢复。能在应用层用标记解决的，绝不用物理删除。

举个对照你就明白什么叫"加法优先"。假设要给文章加阅读量字段：

```sql
-- ✅ 好迁移：加列，旧数据默认 0，向后兼容，随时可跑可撤
ALTER TABLE articles ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

-- ❌ 坏迁移：直接删列，旧数据不可恢复
ALTER TABLE articles DROP COLUMN summary;
```

前者即便跑错了，再发一条 `ALTER` 就能补救；后者一旦执行，`summary` 里成千上万字的摘要灰飞烟灭。我见过有人为了"表更干净"在迁移里 `DROP` 了一堆"暂时不用"的列，三个月后功能要复用那些数据，只能从冷备份里捞——那种疼，一次就够了。迁移脚本写得好不好，标准是：**它出错时，你还有没有退路**。

## 五、P-41：better-sqlite3 事务是"同步"的（血泪坑）

最后一个坑（P-41），是我在做"软删除要同时清 `article_tags` 关联 + 置 `deleted_at`"时踩出来的，值得所有用 better-sqlite3 的人记住：**它的事务 API 是同步的，和 Prisma / TypeORM 那种 `async/await` 事务完全不同**。

三个致命细节：

**1. 回调里不能 `await`。** 事务回调是同步函数，你在里面写 `await someAsync()`，那个异步操作会"逃出"事务边界，根本不在事务保护内——看起来包了事务，实际没包住。

**2. 定义完必须 `()` 触发。** `db.transaction((args) => {...})` 返回的是一个**函数**，你不调用它，事务永远不执行。新手常写成 `db.transaction(() => doWork)` 然后就走了，以为执行了，其实啥也没干。

**3. 返回的是同步值，不是 Promise。** 你不能 `const r = await db.transaction(...)`，因为它不返回 Promise；直接 `const r = db.transaction((x) => x * 2)(5)` 拿同步结果。

给个正确示范：

```ts
// ✅ 同步事务：定义后立即调用 ()，回调内只做同步 DB 操作
const result = db.transaction((articleId: number) => {
  db.delete(articleTags).where(eq(articleTags.articleId, articleId)).run();
  db.update(articles).set({ deletedAt: new Date() }).where(eq(articles.id, articleId)).run();
})(id);
```

这段"清关联 + 置删除标记"必须原子完成——要么都成功，要么都回滚。但因为它全程是同步的 better-sqlite3 调用，放进同步事务正好。一旦你在这里想 `await` 点什么外部 IO（比如同时调个远程服务），事务模型就崩了，那种场景得换"先 DB 事务、再异步补偿"的写法。

## 六、小结与前瞻

这一篇我们把"改表"这件危险的事，框进了安全的轨道：

1. **迁移的本质**：把 schema 变更写成可追溯、可复现、可回滚的脚本，不靠手动 ALTER。
2. **双路径**：本地/测试用 `migrate()` 内联 `STATEMENTS`；D1 生产走 `drizzle-kit generate` + deploy 阶段 `migrate`，共用 `schema.ts`。
3. **P-12**：better-sqlite3 不支持多语句 `exec`，建表语句拆成数组逐条 `db.run(sql.raw(...))`，每条都是原子 SQL。
4. **回滚敬畏**：优先加列、备好补偿脚本、动生产前必备份、用软删除替代物理删除。
5. **P-41**：better-sqlite3 事务是同步 API——回调不可 `await`、定义完要 `()` 触发、返回同步值；异步 IO 别塞进事务。

下一篇（[配置管理：环境变量、多环境与密钥安全](https://blog.csdn.net/fungleo/article/details/164288947)）我们钻进配置管理：环境变量怎么分层、`.env` 怎么用才安全、密钥为什么绝不进仓库。那一篇会解释为什么我们的 `env.ts` 要设计成"单例 + 不用 `c.env`"——这正是双部署不被割裂的关键。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)