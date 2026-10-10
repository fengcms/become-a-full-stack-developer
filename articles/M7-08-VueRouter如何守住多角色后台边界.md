# 成为全栈·Vue 管理后台篇·Vue Router 如何守住多角色后台边界

> 侧栏里看不到“用户管理”，不代表用户不能手动输入 `/users`。后台路由需要在导航入口建立清晰的体验边界，同时把真正的授权留给后端。本文以会员、编辑和管理员三种角色拆解 Vue Router 的访问控制。

{{IMG:M7-08-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `manage-frontend-vue/src/router/index.ts`、`src/config/roles.ts`、`src/lib/permission.ts`、`src/config/menu.ts` 和路由测试。

## 前言：菜单、路由和后端是三道不同的门

管理后台有三种用户入口：用户看见哪些菜单、用户直接访问某个 URL 是否进入页面、请求到达后端是否有权读取或修改数据。它们彼此有关，但不能混为一谈。

如果只隐藏菜单，用户仍可手动输入路径；如果路由挡住了页面，攻击者仍可用 curl 直接调用 API；如果只依赖后端，普通用户在界面里反复撞到 403，体验也很差。因此前端要分别做好导航呈现与页面访问控制，后端则必须对每个 API 做最终鉴权。

项目的角色定义直接来自契约语义：`member` 是普通会员，可使用个人中心能力；`editor` 管理内容域；`admin` 还可以管理用户和站点设置。代码将这些规则集中在权限函数中，而不是让组件各自判断角色字符串。

{{IMG:M7-08-权限对照}}

## 路由表用 meta 表达访问意图

Vue Router 的路由通过 `meta` 声明通用访问要求：

```ts
{
  path: 'articles',
  component: () => import('@/pages/articles/ArticleListPage.vue'),
  meta: { title: '文章管理', consoleOnly: true, capability: 'articles' },
}
```

路由懒加载让页面代码按需进入 bundle；`consoleOnly` 表示会员不进入后台控制台，`capability` 则对应更细的能力检查。像个人资料、通知、点赞和收藏属于已登录用户功能，可以要求 `requiresAuth`，但不需要 `consoleOnly`。页面层级和访问属性由路由配置集中可见，方便审阅和测试。

项目通过类型扩展定义 `RouteMeta` 字段，避免整个应用随意拼写字符串。能力键是一个有限联合类型：`articles`、`comments`、`categories`、`tags`、`users`、`site`。守卫将这些 key 映射到纯权限函数：

```ts
const capabilityCheck = {
  articles: canManageArticles,
  comments: canModerateComments,
  categories: canManageCategories,
  tags: canManageTags,
  users: canManageUsers,
  site: canManageSiteSettings,
} as const
```

这让路由声明可以使用能力名，而角色到能力的映射仍然只有一个实现位置。

## 守卫的判断顺序

全局 `beforeEach` 先判断当前是否存在完整会话，再依次检查 guest-only、登录要求、后台角色和能力权限：

```ts
router.beforeEach((to) => {
  const auth = useAuthStore(pinia)
  const signedIn = Boolean(auth.accessToken && auth.user)

  if (to.meta.guestOnly && signedIn)
    return auth.user?.role === 'member' ? '/no-access' : '/dashboard'
  if (to.meta.requiresAuth && !signedIn)
    return { path: '/login', replace: true, state: { from: to.fullPath } }
  if (to.meta.consoleOnly && auth.user?.role === 'member') return '/no-access'
  if (to.meta.capability && !capabilityCheck[to.meta.capability](auth.user)) return '/403'
  return true
})
```

顺序有实际意义。未登录用户访问受保护页面，会去登录并保留原目标；已登录会员访问后台控制台，会看到“不可进入控制台”的提示；编辑尝试打开用户管理页，则是已登录但缺少特定能力，进入 403。区分身份入口错误与能力不足，可以给用户更准确的说明。

登录页读取导航 state，成功后按授权角色进行默认落地，或返回先前目标。回跳路径必须来自 Router 保存的内部导航状态，避免直接把任意外部 URL 当作跳转目标。若路径指向登录后仍不可访问的页面，守卫仍会再次执行权限检查。

{{IMG:M7-08-能力函数}}

## 角色等级和能力函数

`roles.ts` 定义角色等级与默认首页，`permission.ts` 将契约最低角色转换成领域能力：

```ts
export const canManageArticles = (actor: Actor) =>
  roleAtLeast(actor?.role, 'editor')

export const canManageUsers = (actor: Actor) =>
  roleAtLeast(actor?.role, 'admin')
```

这里把“是否可以管理文章”作为业务问题，而不是在每个模板里写 `user.role === 'admin'`。未来契约可能允许另一角色获得某能力，页面和菜单可以继续引用同一判定函数，只需更新映射与对应测试。

某些资源操作还涉及资源所有者，例如会员可以修改自己的投稿，编辑可以管理全站文章。纯权限模块可以接受 actor 与 owner id，决定按钮是否展示；后端仍需逐请求验证所有权。角色能力函数是用户体验层和前端逻辑的一致性工具，不是安全令牌。

## 菜单与路由共用权限函数

菜单配置为每项声明可选 `can` 函数，`visibleMenuGroups(actor)` 过滤无权菜单：

```ts
{
  path: '/users',
  label: '用户管理',
  icon: PeopleOutline,
  can: canManageUsers,
}
```

如此一来，用户列表入口的可见性由 `canManageUsers` 决定，路由访问也调用同一个函数。避免出现“菜单看不到，但直接 URL 可以进”的前端逻辑矛盾。注意这仍然只保证前端两个入口一致，不能保证后端就授权正确。

路由和菜单的声明方式不同：路由用 `meta.capability` 便于守卫通用处理；菜单用 `can` 便于配置过滤。两者通过同一权限映射连接，不需要复制角色等级逻辑。

## 403、No Access 与 404 各自表达什么？

- **登录页**：需要身份，但当前没有有效会话。
- **No Access**：会员账号已登录，但不能进入管理控制台；个人中心仍可用。
- **403**：用户已登录并进入控制台范围，但当前角色缺少目标功能的能力，例如编辑访问用户管理。
- **404**：路由不存在或目标资源无法找到。资源是否存在可能需要后端决定，前端的路由 404 只说明当前 URL 没有匹配页面。

把它们全部导向登录页会让用户以为账号状态有问题；把所有限制都叫 403 又掩盖了会员账号本来就不属于后台人员这一产品设计。

## 用路由测试钉住语义

项目的 `router/index.test.ts` 验证几个重要边界：匿名访问 `/articles` 会被送往登录；member 可以进入个人资料但不能进入文章后台；editor 可以进入文章列表但打开 `/users` 会得到 403。测试围绕角色、路径与最终地址，而非只测试某个 helper 返回 true/false，因此能检查守卫集成后的行为。

新增一个管理页面时，至少检查：

1. 路由声明是否需要登录、后台角色或特定能力？
2. 侧栏入口是否复用对应能力规则？
3. 页面操作是否进一步涉及资源归属或状态转移？
4. 后端端点是否有对应权限校验？
5. 路由测试覆盖匿名、会员、编辑和管理员的预期路径了吗？

权限用例不必把所有角色和所有路由排列组合成庞大矩阵，但每个权限边界都要有代表性证明，尤其是“角色有后台入口、却没有某一管理能力”的情况。

## 最重要的边界：路由守卫不是后端鉴权

浏览器端代码可以被修改、绕过或完全跳过。用户可以在开发者工具中改 store，也可以直接请求 API。因此后端必须验证访问令牌、角色、资源归属和状态迁移；前端菜单与守卫只负责更友好的导航和早期反馈。

前端权限判断仍然值得做，因为它减少不必要页面加载和必然失败的操作，让不同角色看到符合职责的导航。但要准确描述这份工作：它“防止正常 UI 路径误入”，不是“保护接口免受攻击”。真正安全边界位于服务器。

## 小结：共享规则，保持边界独立

Vue Router 用 `meta` 描述登录、控制台和能力要求；纯权限模块把角色映射为业务能力；菜单复用同一规则；测试验证实际导航结果。No Access、403 和 404 表达不同问题。后端独立执行授权，浏览器守卫不取代它。

下一篇会继续讨论 Pinia 和 React Zustand：认证会话、服务器数据和界面偏好分别该由谁保存，哪些偏好适合持久化，哪些凭证不应进入 localStorage。

## 延伸阅读

- [登录恢复与刷新令牌：Vue 后台的会话生命周期]({{LINK:M7-07}})
- [服务端状态、会话状态、界面状态：不要都塞进 Zustand](https://blog.csdn.net/fungleo/article/details/165722061)
- [Vue Router 官方导航守卫](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [契约先行：设计一套被七个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Vue Router、前端权限、RBAC、路由守卫、前后端鉴权

### 文章简介（250 字以内）

本文以 Vue 管理后台的会员、编辑、管理员角色为例，讲解 Vue Router 如何通过 meta 声明登录、控制台和能力要求，守卫怎样区分登录页、No Access、403 与 404，菜单与直接 URL 如何共享纯权限函数。文章同时明确前端路由守卫只负责导航体验，API 的真实读写权限必须由后端独立验证。

### 建议发布分类

前端 / Vue.js

### 封面短标题

多角色路由边界

### 配图 AI 提示词

1. M7-08-封面：会员、编辑、管理员三条角色路径进入后台路由，经过“登录状态→后台角色→能力”三道前端判断；旁边单独画出后端 API 鉴权作为最终安全边界。白底浅蓝，深色文字，避免暗示前端能替代服务端。
2. M7-08-权限对照：member 进入个人中心、访问控制台显示 No Access；editor 可管理内容但访问用户管理得到 403；admin 可进入管理功能。突出这些是前端体验控制，后端仍需独立鉴权。
3. M7-08-能力函数：放在正文同名占位处，角色能力对照：member/editor/admin 如何映射到同一套能力判定函数。

### 发布前核对

- [ ] 对照 roles.ts、permission.ts、router/index.ts 和 menu.ts 当前实现。
- [ ] 核对角色能力与 OpenAPI 冻结契约保持一致。
- [ ] 检查没有把菜单隐藏或路由守卫描述为安全边界。
- [ ] 用实际配图替换三处 IMG 占位，并将延伸阅读中的 LINK 占位替换为已发布文章地址。
- [ ] 发布时删除本段辅助信息，检查角色图中的权限语义。
<!-- PUBLISH_ASSIST_END -->
