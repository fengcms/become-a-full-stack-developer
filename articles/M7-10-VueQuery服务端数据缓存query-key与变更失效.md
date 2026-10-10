# 成为全栈·Vue 管理后台篇·Vue Query：服务端数据缓存、query key 与变更失效

> 用户从文章列表进入编辑页，再返回列表时，为什么有时不用重新请求？缓存当然可以让界面更快，但若 key 设计错误或 mutation 后没有失效，速度就会变成展示旧数据。本文用 Vue 管理后台的真实查询说明缓存如何工作。

{{IMG:M7-10-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `src/main.ts`、文章、仪表盘、分类、标签与个人中心页面中的 `@tanstack/vue-query` 用法。

## 前言：服务器数据与客户端状态不是同一件事

筛选输入和弹窗开关来自当前交互，文章列表来自服务端。前者通常由页面或 Pinia 持有；后者要面对请求中、失败、缓存、刷新、过期和写操作后同步等问题。TanStack Vue Query 专门管理这类服务端状态。

把 API 返回值复制进 Pinia 并不自动得到更可靠缓存，反而让我们手工处理缓存 key、并发请求、数据过期和 mutation 后的更新。Vue Query 的价值是明确服务器数据身份和生命周期，而不是“任何响应都不用再请求”。

## QueryClient 的默认策略

应用入口创建一个 `QueryClient`，统一配置默认查询行为：

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

默认缓存数据在 30 秒内视为 fresh；超过后变 stale，但这不代表会立即自动删除或必然请求，后续在组件挂载、显式刷新或失效时的行为才决定是否 refetch。失败查询默认再试一次，窗口聚焦时不自动刷新，避免管理后台切回标签页时列表突然跳动。

这些值是本项目的选择，不是所有业务的最佳常量。数据更新频率、请求成本、用户对实时性的要求都会影响 staleTime。站点设置和标签比高频评论审核更稳定，页面可以局部覆盖为五分钟；大多数页面继续使用全局 30 秒。

{{IMG:M7-10-缓存 key}}

## Query key 是缓存身份

一个 query key 应包含决定服务器响应内容的参数。文章列表按页码、页大小、排序、状态和关键字查询，因此 key 中使用完整 query 对象：

```ts
const query = computed(() => ({
  page: page.value,
  pageSize: 10,
  sort: '-updatedAt',
  status: status.value || undefined,
  keyword: keyword.value.trim() || undefined,
}))

const articles = useQuery({
  queryKey: computed(() => ['articles', 'admin', query.value]),
  queryFn: () => listAdminArticles(query.value),
})
```

同一查询参数可以命中相同缓存；页码或筛选条件变化则形成另一条缓存记录。若 key 只写 `['articles']`，不同筛选条件可能被误认为同一个结果；若 queryFn 使用了参数却没有把它们放入 key，缓存身份与请求结果就会分离。

Vue Query 识别 Vue 的响应式查询选项，key 可随 `computed` 更新。调试时应逐项检查：queryFn 读了哪些输入？这些输入是否都能在 key 中体现？有没有将临时对象或函数放进 key 导致身份不稳定？

## 列表、详情与不同用途的 key

项目用 `['articles', 'admin', query]` 表示管理端分页列表，用 `['articles', 'detail', id]` 表示一篇文章详情，用 `['articles', 'recent']` 表示仪表盘最近文章。它们共享 `articles` 根 key，但用途明确。

这样的分层让失效时可以按范围操作：`invalidateQueries({ queryKey: ['articles'] })` 会匹配文章域下的列表和详情相关缓存；若只改某一篇详情，也可以使用更具体 key。命名方案没有唯一标准，关键是团队能预测 key 的层级，并让 mutation 的影响范围表达清楚。

别把整张用户对象直接作为 key，只要 `user.id` 或角色维度足以区分响应，就避免包含多余不稳定字段。key 最好只描述服务器查询语义，方便排错、失效与开发工具检查。

## Fresh、Stale、缓存淘汰不是一个概念

- **fresh**：在 `staleTime` 内，默认可直接使用缓存，不必为每次重新挂载都发请求。
- **stale**：数据认为可能过期；触发重新查询的具体时机受挂载、显式 refetch、失效和配置影响。
- **inactive**：当前没有组件订阅这条 query；它仍可暂时留在缓存中。
- **gc**：非活跃缓存超过垃圾回收时间后才会清理。它与 fresh/stale 的判断不同。

把 `staleTime` 设成五分钟，不等于缓存五分钟后马上删除；把一个 query 标记 stale，也不等于立刻从 UI 清空数据。正确使用这些术语，才能解释切页、返回列表和刷新按钮的行为。

分类树和标签相对稳定，页面显式设置 `staleTime: 300_000`。文章审核、用户资料或通知等频繁变化数据沿用全局策略，并在写操作后主动失效。

{{IMG:M7-10-变更失效}}

## Mutation 后如何让缓存重新变得可信

站点设置保存成功后：

```ts
const mutation = useMutation({
  mutationFn: updateSettings,
  onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['site'] })
  },
})
```

成功后将 `site` 前缀下相关 query 标记为 stale；当前活跃查询会按库的行为重新获取，其他非活跃项之后使用时再更新。文章审核、删除、资料更新、取消收藏等操作也在成功后失效对应数据域。

失败时不应先无条件宣称成功。项目页面先显示明确的成功/失败反馈，再按交互需要关闭对话框、清空选择或刷新缓存。若采用乐观更新，需要先快照旧值、写入临时状态、失败回滚并在最终阶段同步；不能只改 UI 而让缓存永久偏离后端事实。

批量删除是另一种边界：多条请求可能部分成功，全部失败/部分失败/全成功应分别反馈，随后失效列表缓存。把批量操作写成一个普通 `useMutation` 并不自动解决部分成功的产品语义。

## Query 状态与页面反馈

Vue Query 返回的数据不只包含 `data`，还包含 pending/error/fetching/refetch 等状态。页面要根据这些状态呈现加载中、空列表、请求失败和已有缓存同时后台刷新等情形。只写 `data ?? []` 会让“尚未加载”和“加载成功但结果为空”看起来一样。

仪表盘并行请求统计、分类统计、近期文章和近期评论；按 `enabled` 约束角色相关查询，避免没有相应管理能力时仍请求后台数据。每个区块可以独立显示加载状态和结果，不必等所有接口都返回后才渲染整个页面。

请求错误由统一 request 层转成 `ApiError`，查询层保留 error 状态，页面负责适当的提示和重试入口。不要在 queryFn 中弹 toast，也不要把一个 API 请求悄悄 catch 成空数组，否则错误会伪装成“暂无数据”。

## Query key 设计检查表

给一个新查询设计 key 时，逐项回答：

1. 它属于哪个业务域？例如 `articles`、`comments`、`me`。
2. 它是列表、详情、统计还是用户操作结果？是否需要次级命名空间？
3. 哪些输入会改变服务端响应？它们是否都进入 key？
4. 哪些 mutation 应当影响它？能否用共同前缀精确失效？
5. 是否存在同一数据被重复存入 Pinia 或组件状态的副本？

写查询和失效逻辑时尽量使用集中 key 工厂可以提升一致性，但项目当前主要直接声明 key。若后续 key 数量和复用增加，再提取工厂，避免为了抽象而把简单数组隐藏到难以搜索的层层包装中。

## 小结：缓存正确性取决于身份与更新规则

Vue Query 通过 query key 建立服务器数据身份，staleTime 决定 fresh 窗口，查询状态驱动加载和错误 UI，mutation 成功后按业务范围失效缓存。缓存并不是一次性“存下来”，也不是替代后端；关键是 key 和请求参数一致，写操作后的缓存能重新收敛到服务器事实。

下一篇将以一次真实验收问题为例，分析为什么接口返回 total=85，而表格却只能看到第一页：重点不在“制造更多数据”，而在 remote pagination 的 page、pageSize、itemCount 与回调是否受控一致。

## 延伸阅读

- [Pinia 与 Zustand：客户端状态应该保存什么]({{LINK:M7-09}})
- [列表页范式：让分页、筛选和返回位置进入 URL](https://blog.csdn.net/fungleo/article/details/165984930)
- [TanStack Query 官方 Vue 文档](https://tanstack.com/query/latest/docs/framework/vue/overview)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue Query、TanStack Query、Vue.js、前端缓存、数据获取、前端状态管理

### 文章简介（250 字以内）

本文通过 Vue 管理后台的文章列表、仪表盘、分类和站点设置，解释 TanStack Vue Query 的 query key、fresh/stale/inactive 状态、局部 staleTime、加载错误状态和 mutation 后缓存失效。文章强调 query key 必须覆盖影响响应的参数，服务器数据不应复制进 Pinia，并用文章域前缀失效说明写操作后如何让缓存重新对齐后端事实。

### 建议发布分类

前端 / Vue.js

### 封面短标题

Vue Query 缓存体系

### 配图 AI 提示词

1. M7-10-封面：Vue 页面、queryKey、服务端查询缓存、mutation 成功失效、活跃查询刷新构成清晰闭环；fresh/stale/inactive 区域用时间线表示，白底浅蓝、深色技术风格。
2. M7-10-缓存 key：文章列表 key 包含 page、status、keyword；文章详情 key 包含 id；文章修改后按 articles 前缀失效。图示避免把服务器缓存画进 Pinia。
3. M7-10-变更失效：放在正文同名占位处，缓存失效流程：Mutation 成功如何按 query key 精确失效并触发重取。

### 发布前核对

- [ ] 对照 `main.ts` 默认查询策略及页面 staleTime。
- [ ] 对照 mutation 成功回调，核实各 query 前缀和实际行为。
- [ ] 核实 Vue Query 对 fresh/stale/inactive/gc 的官方定义。
- [ ] 用实际配图替换三处 IMG 占位，并将延伸阅读中的 LINK 占位替换为已发布文章地址。
- [ ] 发布时删除本段辅助信息，确保示例 query key 与代码一致。
<!-- PUBLISH_ASSIST_END -->
