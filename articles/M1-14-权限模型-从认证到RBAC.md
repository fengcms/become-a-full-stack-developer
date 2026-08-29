# 成为全栈·Node 后端篇·权限模型：从认证到 RBAC

前面三篇我们把"你是谁"（认证）走通了：注册、登录、JWT、刷新令牌。但认证只回答了一半问题——它知道你是 `用户 7`，却不知道**你能干什么**。这一篇补上另一半：授权（authorization），以及我们用的 RBAC 模型。

## 一、认证和授权，是两件事

很多人把这两个词混用，但它们职责分明：

- **认证（Authentication）**：你是谁？——靠账号密码 / 令牌证明身份。我们 M1-12/13 讲的全是它。
- **授权（Authorization）**：你能干什么？——认证通过之后，系统判断你有没有权限执行这个操作。

打个比方：认证是"刷工牌进大楼"，授权是"你的工牌能不能进机房、能不能动服务器"。进了大楼不等于哪儿都能去。后端每个需要权限的接口，都得在认证之后再做一次授权判断。

## 二、三角色模型：member / editor / admin

我们的系统把用户分成三个层级（契约第 4 铁律的口径）：

- **member（会员）**：普通用户。能发文章（默认进待审）、评论、点赞、收藏、改自己资料。
- **editor（编辑）**：内容管理者。能审核会员投稿、发布/下架文章、管全站内容。但**不管用户、不管角色、不管站点配置**——它的职权边界是"内容"。
- **admin（管理员）**：最高权限。在 editor 之上，还能管理用户（改角色、禁用账号）、改站点配置、重置他人密码。

注意 editor 和 admin 的边界是关键设计：**editor 再厉害也碰不到"人"和"配置"**。一个内容编辑没必要、也不应该能把自己提成 admin 或封禁别人——权限越小，出错面越小，也越符合"最小权限原则"。

## 三、P-26：`guard` 是授权判断的核心原语

每个需要权限的接口，之前我们在路由里写的 `guard('member')` / `guard('admin')` 不是装饰，而是授权判断的**核心原语**。看 `src/middleware/auth.ts` 里的 `guard` 实现：

```ts
const ROLE_RANK: Record<Role, number> = { member: 0, editor: 1, admin: 2 };

export const guard = (minRole: Role, resolveOwner?) => async (c, next) => {
  const user = c.get('user');
  if (!user) throw new AppError(ErrCode.TOKEN_MISSING, 401, '未携带访问令牌');

  const roleOk = (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
  if (roleOk) return next();                       // ④a 角色阶梯：角色够高，放行

  if (resolveOwner) {
    const ownerId = await resolveOwner(c);
    if (ownerId === null) throw new AppError(ErrCode.NOT_FOUND, 404); // 资源不存在 → 404
    if (ownerId === user.id) return next();        // ④b 归属者放行（ownerOverride）
  }
  throw new AppError(ErrCode.FORBIDDEN, 403);       // 存在但非归属者 → 403
};
```

它实现了契约第 4 铁律的两条放行规则，逻辑非常清晰：

- **④a 角色阶梯**：你的角色等级 `≥` 要求的最低角色，直接放行。比如 `guard('admin')`，只有 admin（rank 2）能过，editor（1）和 member（0）都卡在 `roleOk = false`。
- **④b 资源归属（ownerOverride）**：如果角色不够，但有 `resolveOwner` 且"当前用户就是资源主人"，也放行。典型场景：会员改**自己**的草稿——他不是 editor，但文章是他写的，凭归属权放行。

这两条是"或"的关系：角色够 **或** 是主人，都能过。这个 `guard` 原语把"角色 + 归属"两种授权语义统一收口，路由里一行 `guard('editor', resolveArticleOwner)` 就搞定，不用每个接口手写一堆 `if`。

## 四、P-27：ownerOverride 与 404 正交，错误码不能串台

`guard` 里有一个极易写错、却至关重要的细节（P-27）：**资源"不存在"和"存在但你不归"是两种完全不同的应答，必须区分清楚**。

看上面代码：当 `resolveOwner` 返回 `null`（资源查不到），抛的是 `404 NOT_FOUND`；当资源存在、但 `ownerId !== user.id`（不是你的），抛的是 `403 FORBIDDEN`。

为什么这么较真？两个理由：

**第一，安全。** 如果"你不是这篇文章的主人"也返回 404，攻击者就能用遍历 ID 的方式，靠"返回 404 还是 403"来探测"哪篇文章存在"——这又是一次信息泄露。把"不存在"统一成 404，攻击者无从分辨"文章不存在"还是"文章存在但不是你的"，探测失效。

**第二，语义正确。** 404 是"资源层面的不存在"，403 是"授权层面的拒绝"。前端拿到 404 会跳"内容已删除/不存在"页，拿到 403 会跳"你没有权限"页——两套 UI 流程完全不同。如果把两者混了，前端的错误提示就会张冠李戴。

所以 `guard` 必须严格守住：**`null` → 404，非 null 非归属 → 403**，二者正交，错误码绝不串台。这正呼应契约里 `x-authz` 授权求值的机器化——授权规则不是写在注释里的良心，而是能被校验的结构化字段。

## 五、角色边界：editor 管内容，admin 管人

回到第二节说的"editor 不管人"。这在代码里是直接体现的。看 `src/routes/users-admin.ts`——只有"重置用户密码"这一个 admin 接口：

```ts
usersAdminRoute.post(
  '/:id/reset-password',
  authMiddleware,
  guard('admin'),                 // ← 明确只要 admin，editor 进不来
  v.json(resetSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    await resetPassword(id, newPassword);
    return ok({});
  },
);
```

`guard('admin')` 硬硬地卡住：只有 admin 能重置他人密码（v1 没有邮件找回，这是忘记密码的唯一兜底）。editor 哪怕想"帮用户重置密码"，也会被 403 挡下——因为管用户是 admin 的专属领地。

而文章审核、发布这类"内容操作"，用的是 `guard('editor', ...)` 或 `guard('admin', ...)`，editor 就能做。一句话总结边界：**内容相关用 editor 起，用户/配置相关必须 admin**。把这条线画清楚，系统的权限轮廓就立住了。

## 六、guard 落进真实路由：以文章编辑为例

光看 `guard` 函数定义还是抽象，落到真实路由才看得清它怎么干活。看 `src/routes/articles-write.ts` 里更新文章的端点：

```ts
articlesWriteRoute.put(
  '/:id',
  authMiddleware,
  guard('editor', resolveArticleOwner),   // ← 角色阶梯(editor) OR 资源归属(owner)
  v.json(updateArticleSchema),
  async (c) => {
    const id = Number(c.req.param('id'));
    const existing = await getArticleOr404(id);
    const updated = await updateArticleRow(id, input, existing, privileged);
    return ok(toArticle(updated));
  },
);
```

这里的 `guard('editor', resolveArticleOwner)` 把前面说的两条放行规则都用上了：

- 如果你是 **editor 或 admin**，角色阶梯直接过，能改**任何**文章（包括别人的）；
- 如果你只是 **member**，角色不够，但 `resolveArticleOwner` 会查出这篇文章的 `author_id`——如果是你写的，凭 ownerOverride 放行，让你改**自己的**草稿；
- 如果你既不是 editor、又不是作者，那就是"存在但非归属" → `403`。

这就是 RBAC 比 ACL 优雅的地方。**ACL（访问控制列表）**是给"每个资源、每个用户"单独配权限，用户和资源一多，权限矩阵就爆炸，而且"内容编辑能不能碰用户"这种跨资源规则根本没法表达。RBAC 把权限收束到"角色"这一层，再叠加"资源归属"这一维度，刚好映射我们"内容 vs 人"的边界——一个 `guard('editor', ...)` 就声明清楚了。

更关键的是，这套授权规则不是只活在代码里。契约（`docs/api/openapi.v1.yaml`）的第 4 铁律用 `x-authz` 字段把每个端点的 `minRole` + `ownerOverride` 机器化地记了下来，配套的 `check_contract.py` 能校验"代码里的 guard 和契约里的 x-authz 是否一致"。换句话说，授权规则成了**能被自动化校验的结构化事实**，而不是散落在各路由、靠人肉 review 才能发现漂移的注释。这也回答了一个常被人问的问题：权限配置会不会"代码改了、文档忘了改"地慢慢漂移？在我们的设计里，只要 `x-authz` 和 `guard` 对不上，门禁就会红——授权规则是可验证的，而不是信仰。

## 七、P-29：自我护栏与"最后 admin"保护

授权判断里还有两类"防御性护栏"，专门防"管理员把自己玩死"。都在 `src/services/user.ts` 的 `updateUser` 里：

```ts
// 护栏一：禁止管理员变更自身角色/状态
if (privileged && operatorId === id) {
  throw new AppError(ErrCode.FORBIDDEN, 403, undefined, {
    errors: [{ field: 'id', message: '不能变更自己的角色或状态' }],
  });
}
// 护栏二：最后 admin 保护
if (privileged && existing.role === 'admin') {
  const wouldLoseAdmin = body.role !== undefined && body.role !== 'admin';
  const wouldDisable = body.status !== undefined && body.status === 'disabled';
  if (wouldLoseAdmin || wouldDisable) {
    const activeAdmins = (await getDb().select({ count: ... })
      .from(users).where(and(eq(users.role,'admin'), eq(users.status,'active'))).all())[0];
    if (Number(activeAdmins?.count ?? 0) <= 1) {
      throw new AppError(ErrCode.CONFLICT, 409, undefined, {
        errors: [{ field: 'role', message: '至少保留一名活跃 admin' }],
      });
    }
  }
}
```

- **自我护栏**：管理员不能改**自己**的角色或状态。否则他手一滑把自己从 admin 降成 member、或禁用自己，系统就再也没人能提权回来了——典型的"把自己锁门外"。
- **最后 admin 保护**：如果你要把唯一的活跃 admin 降级或禁用，直接 `409` 拒绝。这是防"全站无 admin"的终极兜底——否则一旦最后的管理员没了，连"重新造 admin"都得走 seed（M1-13 那个死锁），生产环境可不敢赌这个。

这两个护栏是"授权系统"成熟度的标志：它不只判断"你能不能"，还会判断"这个操作会不会把系统搞到无法恢复"。好的权限设计，得防得住手滑。

## 八、P-28 轻提：删除守卫"引用存在即拒"

顺带点一个会在后续文章反复用到的守卫原则（P-28）：删除一个资源前，要先查"还有没有别的东西引用它"，有引用就拒绝（或要求先清理引用）。而且查引用时必须 `isNull(deletedAt)` 排除已软删的，否则会把"已删除但还占着坑"的脏数据算进去。这条在文章软删（M1-15）、分类删除（M1-16）里都会落到实处理，这里先记住原则。

## 九、小结与前瞻

权限模型，是把"能干什么"变成可执行的规则：

1. **认证 ≠ 授权**：认证回答"你是谁"，授权回答"你能干什么"，两道门都要过。
2. **三角色**：member（投稿/互动）/ editor（管内容，不管人）/ admin（含用户与配置）。editor 边界是"内容相关用 editor，人/配置必须 admin"。
3. **P-26**：`guard(minRole, resolveOwner?)` 是核心原语——④a 角色阶梯 **或** ④b 资源归属，两条放行规则统一收口。
4. **P-27**：ownerOverride 与 404 正交——`null`→404、`非 null 非归属`→403，错误码绝不串台（防探测、保语义）。
5. **P-29**：自我护栏（不能改自己角色/状态）+ 最后 admin 保护（活跃 admin≤1 被降/禁→409）。
6. **P-28**：删除守卫"引用存在即拒"，查引用排除已软删。

下一篇（{{LINK:M1-15}}）我们进文章 CRUD 与投稿状态机：草稿/待审/已发布三态怎么流转、会员投稿为什么默认进待审、admin 发布即审核、以及软删除和 slug 部分唯一的那些坑。

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

---

## 配图提示词（发布前整段删除）

- `14-RBAC三角色图`：三层级金字塔——member（底层，投稿/评论/点赞）/ editor（中层，管内容、不管人）/ admin（顶层，用户+配置+角色）。右侧画 guard 原语示意：④a 角色阶梯（rank 0/1/2）OR ④b 资源归属 ownerOverride；下方标注"null→404 / 非归属→403 正交"。风格：扁平技术博客配图、配色与专栏封面一致、可放中文小标签。
- 复用说明：文末订阅图用真实 URL 直填，发布前勿删订阅块；本篇配图提示词段整体在发布前删除。
