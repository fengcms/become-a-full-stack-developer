# 成为全栈·React 管理后台篇·TanStack Query 不只是缓存：失效、派生与失败恢复

> 请求成功只说明后端接受了这次修改。要让列表、详情、看板和菜单上的数字一起回到真实状态，还需要维护查询之间的失效关系。

![成为全栈·React 管理后台篇·TanStack Query 不只是缓存：失效、派生与失败恢复](https://i-blog.csdnimg.cn/direct/47fdb59cb27a4bc986e46580b117d812.png)

## 前言

我曾经把 React Query 理解成“带缓存的请求 hook”：页面打开时拉数据，切回来时少发一次请求。直到这个后台出现一个很典型的问题——审核通过一篇文章后，文章列表已经变成“已发布”，仪表盘上的待审核数量却仍然是 1。

两个页面调用的是不同接口，各自也都没有写错。真正漏掉的是一条业务关系：文章状态发生变化，文章缓存和站点统计都可能过期。

从这件事开始，我不再把 TanStack Query 只看成缓存工具。它更重要的作用，是描述远端事实的身份、有效期和失效关系。本篇就沿着查询键、失效、直接写缓存、派生数据和失败恢复，把这层关系讲清楚。

## 本文要解决什么

- query key 怎样成为远端数据的地址。
- mutation 成功后，为什么不能只刷新当前页面。
- `invalidateQueries` 与 `setQueryData` 应该怎样选择。
- 哪些写操作不适合乐观更新。
- 重试、旧数据和错误提示如何共同组成失败恢复。

前置阅读：[服务端状态、会话状态、界面状态：不要都塞进 Zustand](https://blog.csdn.net/fungleo/article/details/165722061)

## Query key 不是随手起的缓存名字

列表查询带分页、筛选和排序。如果所有列表都叫 `['articles']`，第 1 页和第 3 页会争用同一份数据；如果每个组件自由拼字符串，写操作又很难知道应该让哪些缓存失效。

项目将查询键集中成一个工厂：

```ts
export const qk = {
  articles: {
    list: (query: unknown) => ['articles', 'list', query] as const,
    detail: (id: number | string) => ['articles', 'detail', id] as const,
  },
  site: {
    publicSettings: ['site', 'settings', 'public'] as const,
    adminSettings: ['site', 'settings', 'admin'] as const,
    stats: ['site', 'stats'] as const,
  },
}
```

它既是层级地址，也是失效边界：

- `qk.articles.list(query)` 精确指向某组条件下的列表；
- `qk.articles.detail(id)` 精确指向一篇详情；
- `['articles']` 则匹配所有文章相关查询。

因此查询参数必须稳定且完整。若接口请求使用了 `status`，query key 却漏掉它，两个不同请求就会共享错误缓存。反过来，把输入框每次按键产生的临时值直接塞进 key，又会生成大量无意义查询。列表篇会继续讨论如何先把 URL 中的查询状态稳定下来。

## 写成功以后，究竟什么变旧了

新增、修改、删除和审核文章都会影响文章列表；文章数量、发布数量和待审核数量又会影响站点统计。因此文章写操作统一失效两个前缀：

```ts
const useInvalidateArticles = () => {
  const queryClient = useQueryClient()

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['articles'] }),
      queryClient.invalidateQueries({ queryKey: ['site'] }),
    ])
}
```

这段代码看起来比精准修改每个缓存“粗”一些，却表达了可靠的业务事实：文章发生改变以后，所有文章视图和站点聚合都需要重新确认。

`invalidateQueries` 并不等于立即把所有缓存删掉。它先把匹配查询标记为 stale，当前活跃查询会重新获取，暂时不在屏幕上的查询可以等下次使用时再拉。用户通常还能看着旧列表等待新结果，不必先面对一块空白区域。

![缓存失效关系](https://i-blog.csdnimg.cn/direct/9908ece3647648fd9a479624ae021533.png)

失效范围也不能无限放大。每次保存文章都执行 `invalidateQueries()` 清空整个世界，虽然省得思考，却会让分类、用户、通知和个人收藏全部重新请求。查询键的层级设计，正是为了让失效既完整又有边界。

## 什么时候可以直接写缓存

个人资料保存成功时，接口直接返回完整的新用户对象。此时没有必要立刻再请求一次 `/me/profile`：

```ts
onSuccess: (user) => {
  useAuthStore.getState().setUser(user)
  queryClient.setQueryData(qk.me.profile, user)
  toast.success('资料已更新')
}
```

站点设置也是同样的情况：保存接口返回完整配置，就直接更新后台设置缓存，同时让公开品牌配置失效：

```ts
onSuccess: (saved) => {
  queryClient.setQueryData(qk.site.adminSettings, saved)
  void queryClient.invalidateQueries({
    queryKey: qk.site.publicSettings,
  })
}
```

我的判断标准是：如果 mutation 返回的是服务器确认后的完整实体，而且目标缓存与它一一对应，可以 `setQueryData`；如果写操作影响了未知数量的列表、聚合或权限结果，应选择失效后重取。

不要用提交参数直接冒充服务器结果。后端可能规范化 slug、补更新时间、过滤字段或触发状态迁移。缓存里写入“我希望服务器保存的样子”，会短暂制造一个从未存在过的事实。

## 乐观更新不是写操作的默认答案

乐观更新让界面立即变化，体验很好，但前提是前端能准确预测服务端结果，而且失败时可以可靠回滚。

评论代回复就不满足这个条件。后端可能因为敏感词把新评论直接置为 `rejected`。若提交时先把回复插进可见列表，用户会先看见“发布成功”，稍后又发现内容消失。

当前实现选择等待真实响应：

```ts
onSuccess: (comment) => {
  if (comment.status === 'rejected') {
    toast.info('回复未发布，请修改后重试')
  } else {
    toast.success('回复已发布')
  }
  invalidate()
}
```

文章审核、权限修改、批量删除也类似。它们会触发状态机、权限规则或部分失败，错误预测的成本远高于多等几百毫秒。

适合乐观更新的通常是可逆、结果确定、冲突影响小的动作。例如单纯切换本地排序偏好，或者后端保证幂等且返回状态完全可预测的收藏按钮。即使如此，也要准备 `onMutate` 快照、`onError` 回滚和 `onSettled` 重新确认。少写一次请求不是目标，让用户看到可信状态才是。

## 派生数据不要再复制一份缓存

如果页面只需要“待审核文章数量”，最危险的做法是查询完整列表后，再把数量同步进 Zustand。列表刷新与数量同步之间只要漏掉一次，就会重新出现双源。

派生值应该尽量贴着源数据计算。TanStack Query 的 `select` 可以让组件订阅转换结果，同时保留原始缓存；简单场景直接在组件中 `useMemo` 也够用。若后端已经提供专门的聚合接口，就把它视作另一份远端事实，并在相关 mutation 后声明它会失效。

这个后台的仪表盘统计来自站点接口，近期文章又来自文章接口。它们不是同一缓存的两个副本，而是两个服务端资源。文章状态变化后同时失效 `articles` 和 `site`，就是在代码里保留两者的业务关系。

## staleTime 是产品判断，不是性能魔法

全局查询默认 30 秒内保持 fresh：

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})
```

后台列表切个页签就重新请求，会产生闪烁；长时间不刷新，又可能让审核人员看到旧状态。30 秒不是普适答案，只是当前管理后台对“够新”的判断。

不同数据可以覆盖默认值。公开品牌设置很少改变，缓存 10 分钟；通知未读数需要更及时，采用 60 秒轮询。数据新鲜度要按变化频率和错误后果来定，而不是所有查询复制同一个数字。

关闭 `refetchOnWindowFocus` 也是体验选择。后台人员常在编辑器、资料和管理页之间切换，窗口一聚焦就刷新可能覆盖视觉状态或制造抖动。代价是必须把 mutation 后的主动失效做完整。

## 失败恢复：只重试可能恢复的错误

Query 默认重试若不加区分，403、404 和业务校验失败也会重复请求。用户只是看着同一个错误慢放几遍，后端还收到额外流量。

项目只重试网络抖动和内部服务错误，最多两次：

```ts
const shouldRetry = (failureCount: number, error: unknown) => {
  if (failureCount >= 2) return false
  if (!isApiError(error)) return false
  if (error.status === 0) return true
  return error.code === ErrCode.INTERNAL
}
```

写操作则完全不自动重试。创建文章、审核评论、修改角色是不是幂等，要由具体接口证明；在没有证据时，重复提交比明确失败更危险。

恢复也不只等于重试。保留上一份缓存、显示局部错误、允许用户手动再次提交，以及在 mutation 失败后保留表单输入，都是恢复策略的一部分。TanStack Query 管的是远端状态流程，页面仍要把错误翻译成用户能采取的下一步。

## 适用边界

失效前缀适合当前规模，但业务继续增长后，`['articles']` 可能过宽。例如浏览量变化不一定需要重取所有后台列表。届时可以拆出更细的 key，或者用 mutation 返回值精准更新详情，再只失效受影响的聚合。

缓存设计需要随着写操作影响范围演进。不要为了“精准”提前维护几十条脆弱的手工更新，也不要长期依赖全局清空掩盖关系缺失。

## 小结

TanStack Query 的价值不止是少发几次请求。query key 给远端事实分配地址，staleTime 表达可接受的新鲜度，mutation 声明哪些事实已经失效，重试策略区分暂时故障和确定性错误。

各位看官，当一个操作成功但另一个页面还显示旧数字时，别急着在组件之间加事件通知。先画出它改变了哪些服务端事实，再把这条关系写进缓存失效策略。问题通常就清楚了。

## 延伸阅读

- [服务端状态、会话状态、界面状态：不要都塞进 Zustand](https://blog.csdn.net/fungleo/article/details/165722061)
- [评论审核工作流：把状态下拉改成可理解的动作]({{LINK:M2-13}})
- [站点配置页：如何组织低频但高风险的全局设置]({{LINK:M2-17}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`React`、`TanStack Query`、`React Query`、`前端缓存`、`状态管理`、`管理后台`

### 文章简介（250 字以内）

一次写操作成功，并不意味着列表、详情和统计已经同步。本文以文章审核后看板数字仍然过期的问题为入口，讲清 TanStack Query 的查询键、前缀失效、直接写缓存、派生数据和 staleTime，并结合评论审核说明为何乐观更新不是默认答案，以及重试、旧数据和错误提示怎样组成可靠的失败恢复流程。

### 建议发布分类

前端开发 / React / TanStack Query

### 封面短标题

缓存真正难在失效关系

### 配图 AI 提示词

#### 1. `M2-06-封面`

- 用途：文章封面；比例：16:9。
- 提示词：现代技术博客横版封面，中心是标注“Mutation”的一次文章审核动作，向外连接“文章列表”“文章详情”“站点统计”“待审数量”四个缓存节点，节点由青绿色失效波纹同步更新。深蓝石墨背景，橙色写操作、青绿色更新路径，顶部短标题“缓存真正难在失效关系”，扁平架构图风格，不出现 Logo、水印、人物和乱码。

#### 2. `M2-06-缓存失效关系`

- 插入位置：“写成功以后，究竟什么变旧了”小节之后；比例：16:9。
- 提示词：缓存关系图，左侧“审核文章”操作成功后分成两条路径，一条进入 `['articles']` 并覆盖“列表、详情、近期文章”，另一条进入 `['site']` 并覆盖“统计、分类计数”；下方对比错误做法“只刷新当前列表”，让“待审数量”保持红色旧值。中文节点清晰，深色背景，青绿正确路径、红色遗漏节点。

### 发布前核对

- [ ] Tag 为 6 个，简介不超过 250 个字符
- [ ] 两张配图已上传并替换占位符
- [ ] M2-05、M2-13、M2-17 发布后回填内链
- [ ] query key、30 秒 staleTime 和两次重试策略仍与源码一致
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
