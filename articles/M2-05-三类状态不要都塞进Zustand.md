# 成为全栈·React 管理后台篇·服务端状态、会话状态、界面状态：不要都塞进 Zustand

> 状态管理真正困难的地方，不是选 Redux、Zustand 还是 Context，而是判断一份数据究竟由谁拥有、什么时候失效，以及谁有权修改它。

## 前言

管理后台刚开始开发时，把数据放进一个全局 store 很有诱惑力。用户信息放进去，文章列表放进去，筛选条件放进去，侧栏折叠也放进去。组件只管读 store，看起来比一层层传 props 清爽得多。

可页面一多，问题就来了：文章编辑成功后，store 里的详情更新了，列表里的标题还是旧的；切换筛选条件时，上一页的数据一闪而过；个人资料既存在认证 store，又存在接口缓存，改完昵称以后，头像区域和资料页各显示一个版本。

这不是 Zustand 写得不好，而是我们让一个工具同时承担了几种生命周期完全不同的状态。本项目最后没有建立一个“大一统 store”，而是把状态按所有权拆给 TanStack Query、Zustand、React Hook Form、URL 和组件本身。这一篇就来解释为什么。

## 本文要解决什么

- 怎样区分服务端状态、会话状态、界面状态和表单状态。
- 为什么“多个页面都要用”不足以成为放进全局 store 的理由。
- 同一份用户资料为什么可以同时出现在 Query 和 Zustand 中，却不应形成两个真相源。
- 什么状态应该持久化，什么状态刷新页面后丢失反而更安全。

前置阅读：[后台骨架：布局、数据路由与分层守卫]({{LINK:M2-02}})、[请求层封装：统一信封、业务错误与并发 401]({{LINK:M2-03}})

## 先别问用什么库，先问数据属于谁

我现在判断状态放在哪里，会先问三个问题：

1. 谁是这份数据的权威来源？
2. 它的生命周期跟页面、会话还是服务器一致？
3. 数据变旧以后，谁知道该怎样重新获取？

据此，这个后台形成了下面的分工：

| 状态 | 权威来源 | 合适载体 | 例子 |
| --- | --- | --- | --- |
| 服务端状态 | 后端数据库与接口 | TanStack Query | 文章列表、评论、分类树、站点统计 |
| 会话状态 | 当前浏览器会话 | Zustand 内存 store | accessToken、当前用户、启动恢复状态 |
| 界面偏好 | 当前设备上的用户选择 | Zustand + localStorage | 侧栏是否折叠 |
| 表单草稿 | 当前编辑过程 | React Hook Form | 标题、正文、校验错误、dirty 状态 |
| 可分享的页面状态 | 当前 URL | search params | 页码、关键词、筛选和排序 |
| 短暂交互状态 | 当前组件 | useState | 对话框开关、当前悬浮项 |

这张表最重要的不是库名，而是权威来源。文章列表来自服务器，前端只能缓存它；表单里尚未提交的标题来自用户当前输入，服务器无权覆盖它；侧栏折叠属于这个浏览器，后端也没有必要知道。

{{IMG:M2-05-状态所有权地图}}

## 服务端数据放进 Zustand，实际上是在重造缓存系统

假设我们把文章列表存在 store：

```ts
type ArticleStore = {
  list: ArticleSummary[]
  loading: boolean
  error: string | null
  fetchList: (query: AdminArticleQuery) => Promise<void>
}
```

很快还要补上当前 query、上次请求时间、并发去重、请求失败重试、不同筛选条件的多份缓存，以及编辑后哪些列表需要刷新。继续做下去，我们不是在“用一个轻量 store”，而是在手写一个不完整的 TanStack Query。

当前项目让查询键直接表达远端数据的身份：

```ts
export const qk = {
  articles: {
    list: (query: unknown) => ['articles', 'list', query] as const,
    detail: (id: number | string) => ['articles', 'detail', id] as const,
  },
}

export const useAdminArticles = (query: AdminArticleQuery) =>
  useQuery({
    queryKey: qk.articles.list(query),
    queryFn: () => listAdminArticles(query),
  })
```

页码和筛选不同，query key 就不同。组件卸载后缓存可以暂时保留；数据过期后 Query 知道怎样重新拉取；多个组件请求同一份数据时，也会共享同一个查询结果。这些都是服务端状态的生命周期，不该由业务 store 再实现一遍。

## Zustand 留给跨组件、但不属于服务器的状态

本项目只有两类 Zustand store：认证会话和界面偏好。它们都是跨路由共享的，但持久化策略完全不同。

侧栏折叠可以放心落进 localStorage：

```ts
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({
        sidebarCollapsed: !s.sidebarCollapsed,
      })),
    }),
    { name: 'befull-admin-ui' },
  ),
)
```

别人知道我习惯折叠侧栏，没有安全损失。accessToken 则只保存在内存里：

```ts
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  bootStatus: 'idle',
  setSession: (auth) => set((prev) => ({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken ?? prev.refreshToken,
    user: auth.user,
    bootStatus: 'ready',
  })),
  clear: () => set({
    accessToken: null,
    refreshToken: null,
    user: null,
    bootStatus: 'ready',
  }),
}))
```

同样是 Zustand，“要不要 persist”不能由技术选型决定，而要由数据敏感度和恢复方式决定。令牌刷新后丢失，由 HttpOnly Cookie 帮助静默恢复；侧栏偏好丢失没有危险，却会让用户每次都重新调整。

另外，store 只保存状态，不发请求。登录接口调用完成后把结果写进 store，请求层读取令牌；若 store 自己再 import API 发请求，很容易形成 `store → api → request → store` 的循环依赖。

## 表单不是接口缓存的一个可编辑副本

编辑页最容易出现另一种双源。接口详情由 Query 拉回，表单由 React Hook Form 接管。若每次 Query 数据变化都直接覆盖表单，用户写到一半遇上后台重新拉取，就可能整篇消失。

正确关系是一次明确的“装载”，而不是持续双向同步：

```ts
const form = useForm<ArticleFormValues>({
  defaultValues: articleToForm(),
})

useEffect(() => {
  if (query.data && !form.formState.isDirty) {
    form.reset(articleToForm(query.data))
  }
}, [query.data, form])
```

Query 中的详情是服务器最后确认的版本；表单一旦被用户修改，就成为当前编辑过程的工作副本。提交成功后，再用服务器返回值重置表单基线并失效相关查询。这条单向链路比“每次变化互相同步”可靠得多。

更具体的加载保护和未保存拦截，我会放到 M2-09 展开。这里先记住一个判断：能撤销、能校验、尚未提交的输入属于表单，不属于全局 store。

## 用户资料为什么看起来存了两份

当前用户 `user` 在认证 store 中，`/me/profile` 的结果又在 Query 缓存中。这看上去违反了单一事实源，实际上两者承担的语义不同：

- 认证 store 的 user 是会话快照，守卫、菜单和头像需要同步读取；
- Query 中的 profile 是可重新获取的完整远端资料。

更新资料成功后，接口返回服务器确认的新 user，于是同一次成功回调更新两处投影：

```ts
onSuccess: (user) => {
  useAuthStore.getState().setUser(user)
  queryClient.setQueryData(qk.me.profile, user)
  toast.success('资料已更新')
}
```

关键在于它们不能各自演化。页面不应该一边本地改认证 user，一边等待另一个请求修改 profile；两处都只能接受同一个服务端结果。若将来用户对象越来越大，更好的演进方式是让认证 store 只保留 `id`、`role` 等守卫所需的最小身份快照。

## “全局可用”不是“全局状态”

有些数据会被很多页面使用，例如分类树和标签列表。这仍不代表它们该进 Zustand。多个页面共用只说明访问范围大，不说明所有权改变了。

反过来，对话框是否打开通常只被一个页面使用，即使能放进全局 store，也没有必要。状态放得越高，修改它的人越多，清理和复位就越难判断。

我会优先把状态放在能够完整覆盖其生命周期的最低位置：组件能管就放组件，表单能管就放表单，URL 需要承载才进 URL，服务器数据交给 Query，只有真正跨树共享的会话和偏好才进 Zustand。

## 适用边界

这套划分不是规定每个项目必须同时使用五种工具。小页面只用组件状态和 fetch 也能完成；复杂离线应用可能需要把服务端数据持久化到本地数据库。

真正需要保持的是所有权意识。状态库不会替我们决定数据何时过期，Query 也不适合保存输入到一半的密码。工具职责越清楚，页面之间就越少出现“谁覆盖了谁”的偶发错误。

## 小结

各位看官，状态管理不是把所有数据集中起来，而是让每份数据回到自己的生命周期中。服务器拥有的事实交给 TanStack Query，会话快照和界面偏好交给 Zustand，输入过程交给 React Hook Form，可分享的查询条件交给 URL，短暂交互留在组件。

拆开之后，代码表面上用了更多工具，系统里的真相源反而更少了。下一篇，我们继续看 TanStack Query 怎样通过 query key、失效和重取，让这些远端事实保持一致。

## 延伸阅读

- [TanStack Query 不只是缓存：失效、派生与失败恢复]({{LINK:M2-06}})
- [前端鉴权闭环：内存令牌、刷新旋转与路由守卫]({{LINK:M2-07}})
- [表单页范式：校验、数据回填与未保存保护]({{LINK:M2-09}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`React`、`Zustand`、`TanStack Query`、`React Hook Form`、`状态管理`、`前端架构`

### 文章简介（250 字以内）

管理后台里的文章列表、登录令牌、侧栏偏好和表单草稿都有不同的权威来源与生命周期。本文从把所有数据塞进全局 store 导致的双源问题出发，说明如何在 TanStack Query、Zustand、React Hook Form、URL 和组件状态之间划分职责，并讨论用户资料同时存在于会话快照和接口缓存时，怎样避免两个真相源。

### 建议发布分类

前端开发 / React / 状态管理

### 封面短标题

状态到底应该放在哪里

### 配图 AI 提示词

#### 1. `M2-05-封面`

- 用途：文章封面；比例：16:9。
- 提示词：现代技术博客横版封面，中央是一组等待分流的数据卡片，沿五条清晰轨道分别进入“TanStack Query”“Zustand”“React Hook Form”“URL”“组件状态”五个容器，顶部短标题“状态到底应该放在哪里”。深蓝石墨背景，青绿和橙色数据流，扁平架构信息图，中文清晰，留白充分，不出现品牌 Logo、水印、人物和乱码。

#### 2. `M2-05-状态所有权地图`

- 插入位置：状态分类表格之后；比例：16:9。
- 提示词：五列状态所有权地图，依次为“服务端事实 → TanStack Query”“会话与偏好 → Zustand”“编辑草稿 → React Hook Form”“分页筛选 → URL”“临时开关 → 组件状态”。每列下方分别放文章列表、令牌与侧栏、编辑表单、搜索地址栏、对话框小图标，箭头标注“按生命周期归位”。深色背景、青绿色主色、中文准确、结构优先。

### 发布前核对

- [ ] Tag 为 6 个，简介不超过 250 个字符
- [ ] 两张配图已上传并替换占位符
- [ ] M2-06、M2-07、M2-09 发布后回填内链
- [ ] 状态示例与当前 `auth.ts`、`ui.ts`、`queryClient.ts` 一致
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
