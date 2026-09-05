# 成为全栈·Node 后端篇·文章 CRUD 与投稿状态机

假设你做了个内容站：会员注册、写了篇文章、点下"发布"——它就该直接出现在首页吗？如果全站只有你一个人写，那没问题；可一旦有第二个会员投稿，你会发现"发布"这个动作背后藏着一整套规则：谁能直接发、谁发完要等人审、审完算什么状态、删掉的文章到底算不算消失。

这一篇我们把文章的**增删改查（CRUD）**和它背后的**投稿状态机**一起讲透：`draft` / `pending` / `published` 三态怎么流转、为什么会员投稿默认进待审、`admin` 发布即审核，以及软删除和 slug 部分唯一这两个一不留神就漏的坑。

## 一、三态状态机：draft / pending / published

我们的文章不是"写完就上线"这么简单，它有三个状态（与契约 `Article.status` 枚举严格一致）：

- **draft（草稿）**：作者自己能看到，对外不可见。写到一半、还没想好发不发，都先放草稿。
- **pending（待审）**：提交审核。会员投稿默认进这个状态，等编辑/管理员过目。
- **published（已发布）**：对外公开，任何人都能读。

为什么要多此一举搞个"待审"？因为如果会员投稿直接 `published`，一个垃圾站就成型了——随便注册个号就能往首页塞广告。把会员的投稿默认卡在 `pending`，由编辑/管理员审核通过后才 `published`，内容质量就有了第一道把关。这就是"投稿状态机"存在的意义：它把"谁能决定文章可见"这件事，收进了明确的状态流转规则里。

状态之间不是随便跳的。核心的合法转移写在 `src/services/article.ts` 的 `canTransition` 里：

```ts
export const canTransition = (from: ArticleStatus, to: ArticleStatus): boolean => {
  if (from === to) return true; // 同态幂等
  const allowed: ReadonlyArray<[ArticleStatus, ArticleStatus]> = [
    ['draft', 'pending'],
    ['draft', 'published'],
    ['pending', 'published'],
    ['pending', 'draft'],
    ['published', 'draft'],
    ['published', 'pending'],
  ];
  return allowed.some(([f, t]) => f === from && t === to);
};
```

六条合法转移，画成图就是这样：

```
        submit            approve
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │   draft      │───▶│   pending    │───▶│  published   │
   │  (草稿)      │    │  (待审)      │    │  (已发布)     │
   └──────────────┘    └──────────────┘    └──────────────┘
        ▲   │                ▲   │               │   ▲
        │   │ pull back      │   │ pull back     │   │ pull back
        └───┘                └───┘               └───┘
   (pending→draft)     (published→draft)   (published→pending)
```

注意这里**没有**"从 published 直接人间蒸发"这种转移，下架一律走"退回 draft/pending"，文章数据始终保留（软删除，见第四节）。这条矩阵不是写在注释里就算了，它还被机器化进契约的 `Article.status.x-allowed-transitions`（N9-2 机器化），和代码里的 `canTransition` 互为镜像，门禁会校验两边一致。关于"领域模型如何先想清楚再落库"，我在 [领域建模那一篇](https://blog.csdn.net/fungleo/article/details/164139553) 也聊过类似思路，可以先去温习。

## 二、member 不可自发布：领域规则 ≠ 测试假设

状态机定了，下一个问题是：谁有资格把文章推到 `published`？答案是 **editor / admin**，普通会员不行。但这条规则落到代码里，不是在路由层硬挡，而是在"计算新状态"这一步悄悄做降级。看 `src/services/article-mutation.ts` 的 `resolveNewStatus`：

```ts
export const resolveNewStatus = (
  input: ArticleStatus | undefined,
  current: ArticleStatus,
  privileged: boolean,
): ArticleStatus => {
  let next: ArticleStatus = input ?? current;
  if (!privileged) {
    if (next === 'published') next = 'pending';      // 会员想发→压成待审
    if (current === 'published') next = 'pending';    // 会员改已发布→退回待审
  }
  return next;
};
```

`privileged` 是路由传进来的——`me.role === 'editor' || me.role === 'admin'`。如果是不具备特权的 member：

- 创建时就算传了 `status: 'published'`，也会被降级成 `pending`；
- 编辑一篇已经 `published` 的文章，改动后会被**退回 `pending`** 重新审核。

这条规则有两个容易踩的坑，值得单独拎出来（P-30）：

第一，**领域规则不是测试假设**。写集成测试时，如果你用 member 身份去创建文章、期望拿到 `published`，测试会挂——因为领域规则规定 member 不可自发布。正确的测试姿势是：用 admin（或 editor）建 `published` 文章来验证"已发布可见"这条路径，用 member 验证"投稿落 pending"。把"领域规则"误当成"测试可以自由假设的前提"，是新手最常写的错误用例。

第二，**编辑已发布文章退回待审**这个设计，保护了"已发布内容不被随便改"。会员改自己的已发布文章，改动不会悄无声息地直接生效，而是重新进审核。避免了一个会员把已发布文章偷偷改成广告却依然在线的情况。

## 三、CRUD 端点一览：薄路由怎么落地

所有写操作路由都在 `src/routes/articles-write.ts`，读操作在 `src/routes/articles-read.ts`，后台审核在 `src/routes/articles-admin.ts`。它们都遵守 M1-03 讲的"薄路由"纪律：鉴权 → 校验 → 调 service → 包信封，绝不在路由里碰 `getDb()`。

列一下核心端点：

| 方法 | 路径 | 守卫 | 说明 |
|---|---|---|---|
| POST | `/articles` | `guard('member')` | 创建，默认 `draft`；member 忽略 slug、不可自发布 |
| PUT | `/articles/:id` | `guard('editor', resolveArticleOwner)` | 更新；member 凭 ownerOverride 改自己草稿 |
| DELETE | `/articles/:id` | `guard('editor', resolveArticleOwner)` | 软删除 |
| POST | `/articles/:id/submit` | `guard('admin', resolveArticleOwner)` | `draft → pending` |
| GET | `/articles` | 公开 | 列表，**强制仅 `published`** |
| GET | `/articles/:idOrSlug` | 可选登录 | 详情，id 或 slug 解析 |
| POST | `/articles/:id/view` | 可选登录 | 阅读量 +1 |
| GET | `/admin/articles` | `guard('editor')` | 后台列表，全状态可见 |
| POST | `/admin/articles/:id/approve` | `guard('editor')` | `pending → published` |
| POST | `/admin/articles/:id/status` | `guard('admin')` | admin 任意置位 |

几个值得展开的点：

**创建时 member 被忽略 slug**。`createArticleRow` 里有一行 `if (!privileged) slug = null;`——普通会员不能自己指定 slug（URL 友好名），只有 editor/admin 能设。原因很简单：slug 直接进 URL，是 SEO 和品牌的一部分，不能让任意会员随便占一个 `/articles/google` 之类的坑。

**更新走 `guard('editor', resolveArticleOwner)`**。这正是 M1-14 讲过的 ownerOverride：editor/admin 能改任何文章；member 角色不够，但如果是文章作者，凭归属权也能改**自己**的草稿。非作者非编辑 → 403。

**公开列表强制 `published`**。`articles-read.ts` 的 `GET /` 调用 `queryArticles({ forcedStatus: 'published', ... })`——注意是 `forcedStatus` 而不是 `status`，意味着调用方传 `?status=draft` 也会被无视，公开列表永远只返已发布。未发布的详情对匿名用户直接 `404`（隐瞒存在性），只有作者本人或 admin 能看到任意态。

**`submit` 的前态校验**。看 `submitArticle`：

```ts
if (existing.status !== 'draft') throw new AppError(ErrCode.STATE_CONFLICT, 409); // 3003 非法前态
```

只有 `draft` 能 `submit`，已经是 `pending`/`published` 的再 submit 直接 `409`（状态冲突）。`approveArticle` 同理，只有 `pending` 能 approve。这就是状态机的"软约束"——不靠 `canTransition` 全量判断，而是对每条转移单独校验前态，报 `3003 STATE_CONFLICT`。而 admin 的 `setArticleStatus` 不受矩阵限制，可以"任意置位"（下架/退回专用），但同态仍幂等返回 200。

## 四、软删除与 slug 的部分唯一（P-31 / P-56）

删除文章我们**绝不物理删行**，而是置 `deleted_at`：

```ts
export const softDeleteArticle = async (id: number): Promise<void> => {
  const db = getDb();
  await db.delete(articleTags).where(eq(articleTags.articleId, id)).run(); // 清关联
  await db
    .update(articles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(articles.id, id))
    .run();
};
```

软删除的两个好处：一是数据可恢复（真删了就找不回来了，运营误删是常态）；二是全站查询都带 `isNull(articles.deletedAt)` 基础条件，已删文章自然从所有列表、详情、计数里消失，和"从未存在"等价，但数据还在库里。

这里有个和 slug 相关的精妙设计（P-31）。`slug` 列上有一个普通唯一索引 `uniq_article_slug`：

```ts
slug: text('slug'),                       // 可空
// ...
(table) => [uniqueIndex('uniq_article_slug').on(table.slug)],
```

SQLite 的普通唯一索引对 **NULL 允许多行**——也就是说，没有自定义 slug 的文章（slug 为 NULL）可以有无数篇共存，不会撞唯一约束。这等效于"部分唯一索引"：只有**有值**的 slug 才参与唯一性检查。一个会员不传 slug，系统就不给他分配，也不会因为"大家都没 slug"而冲突。

那"软删后 slug 释放可复用"又是怎么回事？注意上面 `isSlugTaken`（创建/更新时校验 slug 占用）的查询带了 `isNull(articles.deletedAt)`：

```ts
const dup = (await getDb().select(...).from(articles)
  .where(and(eq(articles.slug, slug), isNull(articles.deletedAt)))
  .limit(1).all())[0];
```

也就是说，在**应用层**的占用判定里，软删的文章被排除了。一篇被删掉的文章，它的 slug 在应用逻辑看来就是"空闲"的，新文章可以复用。这正是"伪唯一"索引带来的灵活：你既拿到了"有值唯一"的保证，又能在删除后自然释放，不需要去写触发器或手动清 slug。

顺带说一个和删除相关的铁律（P-56）：**删除一个不存在的资源，应该返回 404，而不是 200**。如果删一个不存在的 id 还返回"删除成功"，调用方会误以为真删了，埋下数据不一致的坑。我们这里靠 `guard('editor', resolveArticleOwner)` 把住——`resolveArticleOwner` 在查不到文章行时直接抛 `404`（呼应 M1-14 的 P-27 正交性），所以"删一个不存在的文章"在到达真正的删除逻辑之前就被 404 挡下，不会静默返回 200。

## 五、标签同步写入（P-32）

文章和标签是多对多关系，中间表是 `article_tags`。但建这个表容易，难的是"写入入口统一"——如果创建文章写一份、更新文章又写一份、回填脚本再写一份，三处逻辑稍有不同时对不上，关联就会"落后于正文"。所以 `src/services/article-tags.ts` 把写入收口到 `syncArticleTags` 一个函数：

```ts
export const syncArticleTags = async (articleId: number, tagNames: string[]): Promise<void> => {
  const db = getDb();
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId)).run(); // 先清旧
  const ids = await resolveTagIds(tagNames);                                      // 解析已存在 Tag
  for (const tagId of ids) {
    await db
      .insert(articleTags)
      .values({ articleId, tagId, createdAt: new Date() })
      .onConflictDoNothing()                                                       // 并发/重复标签不炸
      .run();
  }
};
```

`replace` 式同步：先删掉这篇文章的旧关联，再按新标签名覆盖插入。`onConflictDoNothing()` 配合 `uniq_article_tag` 唯一索引，保证重复标签或并发写入不会报错。写语句一律 `.run()`（P-10：写操作别用 `.all()`，否则运行时才爆；要回读刚插入的行才用 `.returning().all()`，比如 `createArticleRow` 的插入）。

还有一个关键约束：**只链接已存在的 Tag，不越权建 catalog 标签**。看 `resolveTagIds`，它按 `slug == name` 约定去 `tags` 表查已存在的标签，查不到就跳过。建新标签是 editor 的职责，普通会员提交文章时不能"顺手"建一个目录里没有的标签——否则标签体系会被会员随意涌入的脏标签污染。所以一篇会员文章带了一堆不存在的标签名时，关联表就是空的，只保留正文里那份去规范化存储的 `tags` JSON（兼容旧逻辑），等编辑审核时再决定要不要建正式标签。这种"去规范化 + 关联表并存"的设计，正是 M1-31 要专门讲的建模手艺，这里先埋个引子。

## 六、小结与前瞻

文章 CRUD 与投稿状态机，是内容产品的骨架：

1. **三态状态机**：draft / pending / published；六条合法转移收进 `canTransition`，并机器化进契约 `x-allowed-transitions`；会员投稿默认 `pending`，审核通过才 `published`。
2. **member 不可自发布**：`resolveNewStatus` 把 member 的 `published` 降级成 `pending`，编辑已发布文章也退回待审——这是领域规则（P-30），测试要用 admin 建 published 而非 member。
3. **薄路由 CRUD**：POST/PUT/DELETE 在 `articles-write.ts`，GET 在 `articles-read.ts`，审核在 `articles-admin.ts`；公开列表 `forcedStatus:'published'`、未发布详情对匿名 404；`submit`/`approve` 校验前态报 `3003`。
4. **软删除**：置 `deleted_at`、清理 `article_tags`；全站查询带 `isNull(deletedAt)`。
5. **P-31 伪唯一**：`uniq_article_slug` 对 NULL 允许多行；应用层 `isSlugTaken` 排除软删行 → slug 删后可复用。P-56：删不存在 → 404 非 200（guard 的 resolveOwner 守住）。
6. **P-32 标签同步**：`syncArticleTags` 先清后插、写入入口唯一、只链已存在 Tag；写用 `.run()`。

下一篇（{{LINK:M1-16}}）我们专门拆"分类与标签"：多对多中间表怎么建、N+1 查询怎么避免、`articleCount` 精确计数（告别 JSON 子串误匹配 `js` 命中 `json` 的尴尬）又是怎么做的。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

---

## 配图提示词（发布前整段删除）

- `15-文章状态机图`：三节点 draft/pending/published 状态图，箭头标注 submit/approve/pull back，配中文小标签；扁平技术博客风、与专栏封面配色一致。
- `15-CRUD端点表`：一表展示 10 个端点（方法/路径/守卫/说明），可作为文章内嵌表或配图。
- 复用说明：文末订阅图用真实 URL 直填，发布前勿删订阅块；本篇配图提示词段整体在发布前删除。

## 文章摘要（发布时填入 CSDN 摘要字段，随配图提示词一并删除）

本文讲内容站文章 CRUD 与投稿状态机的落地。先用 draft / pending / published 三态把"谁能直接发、谁发完要审"说清，再讲 member 不可自发布的领域规则如何写进 service，随后走一遍薄路由的 CRUD 端点，以及软删除、slug 部分唯一、标签同步这三个一不留神就漏的坑。
