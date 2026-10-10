# 成为全栈·Vue 管理后台篇·分页只显示第一页：从接口 total 定位到前端修复

> 接口明明返回 `total: 85`、`totalPages: 9`，管理后台却看不到下一页。问题不一定在后端：如果表格分页没有进入远程模式，或控件状态没有受控回写，前端也可能只展示第一页。本文沿一次真实验收问题定位 UI 与接口之间的分页闭环。

{{IMG:M7-11-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `manage-frontend-vue/src/pages/articles/ArticleListPage.vue` 与 React 版 `manage-frontend/src/pages/articles/ArticleListPage.tsx`、`src/components/data/TablePagination.tsx`。

## 前言：接口有 9 页，页面为什么像只有一页？

一次登录验收中，文章接口的响应分页信息是：

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 85,
    "totalPages": 9
  }
}
```

按这个结果，第一页包含 10 条记录，表格应知道总数是 85，并提供后续页入口。如果列表只能显示第一页或下一页按钮不可用，第一步不应该“给前端补 8 页假数据”，而是追踪响应总数如何传到分页组件、用户点击后 page 如何回写、请求是否带了新 page。

这是典型的前后端协作问题：接口可能正确，但控件配置遗漏；控件可见但点击没有更新 query；页码状态改变但 query key 没有反映它；或者 API 确实忽略了 page。每一环都要用证据排查。

## 先建立分页数据流

分页列表至少包含四个数据：

- `page`：当前页码，通常从 1 开始。
- `pageSize`：每页条数。
- `total`：符合当前筛选条件的记录总数。
- `totalPages`：服务端计算的总页数，或由 total/pageSize 推导。

一次正确翻页的闭环是：接口响应 total → 分页控件据此显示页数 → 用户点击下一页 → page 更新 → query key/请求参数更新 → API 请求第二页 → 新结果与 pagination 返回 → 控件显示新页状态。

若仅把当前 10 条数据交给组件，而没有告知总记录数，一些组件会默认本地分页或认为只有一页。若控件显示 9 页但 page 状态仍然是 1，点击后也不会发出第二页请求。不能只看按钮，要核实网络请求中的 `page` 值。

{{IMG:M7-11-远程分页}}

## Naive UI 表格需要知道这是远程分页

Vue 版 `NDataTable` 使用 `remote` 属性，并通过 pagination 对象受控：

```vue
<NDataTable
  remote
  :data="articles.data.value?.list ?? []"
  :pagination="{
    page,
    pageSize,
    itemCount: articles.data.value?.pagination.total ?? 0,
    showSizePicker: false,
    onUpdatePage: (value: number) => page = value,
  }"
/>
```

这里几处配置各有作用：

1. `remote` 告诉 Naive UI 数据由服务端分页，当前页数据不是完整本地集合，不要再对这 10 行做客户端切片。
2. `itemCount` 使用接口的 `pagination.total`，让分页器知道总记录数，从而计算页数和是否存在下一页。
3. `page` 是受控值，组件显示哪一页由页面状态决定。
4. `onUpdatePage` 将用户点击写回 `page`；`page` 进入响应式 query，进而改变 Vue Query key 并触发下一页请求。

如果忘了 `remote`，组件可能按本地数据长度推断分页；如果 itemCount 传成当前列表长度 10，分页器就只认为有一页；如果回调没有更新 page，点击本身不会改请求。这三类问题表面相似，根因不同，检查网络面板和 Vue Devtools 能快速分辨。

## query key 与接口请求必须带上 page

Vue 页面构造 query 参数时将 `page`、`pageSize` 和筛选条件放进计算属性：

```ts
const query = computed(() => ({
  page: page.value,
  pageSize,
  sort: '-updatedAt',
  status: status.value || undefined,
  keyword: keyword.value.trim() || undefined,
}))

const articles = useQuery({
  queryKey: computed(() => ['articles', 'admin', query.value]),
  queryFn: () => listAdminArticles(query.value),
})
```

点击下一页后，受控 `page` 更新，query 和 key 随之变化，`listAdminArticles` 调用请求层时带上新 page。若 queryKey 漏掉页码，即便 queryFn 读到了新的 page，缓存仍可能把不同页识别成同一身份；若 queryFn 使用旧闭包参数，则 key 更新也不一定请求预期参数。key 和 queryFn 必须描述同一个查询。

筛选条件变化后通常应回到第一页。当前页面通过 `watch([status, keyword], ...)` 将 `page` 设为 1，否则用户停留在第 8 页切换到一个只有 2 页的筛选结果，可能看到空列表或页码越界。清除筛选、改 pageSize 也应有一致的复位规则。

## React 版把分页条独立出来

React 管理后台使用独立的 `TablePagination`，把分页状态和回调作为 props 传入：

```tsx
<TablePagination
  page={data.pagination.page}
  pageSize={data.pagination.pageSize}
  total={data.pagination.total}
  totalPages={data.pagination.totalPages}
  onPageChange={setPage}
  onPageSizeChange={setPageSize}
/>
```

组件展示总数与当前页，按钮调用 `onPageChange`，并在当前页超过总页数时回调修正。React 版由 `useTableQuery()` 把 page/pageSize 等状态同步到 URL 查询参数，数据 hook 根据参数获取服务端结果。Vue 版使用 Naive UI 的 remote table 管理控件显示，但两边都需要“服务端总数→受控 UI→页码状态→请求参数”的闭环。

不同 UI 库的 API 不同，复刻时目标是行为一致而不是强行使用相同组件结构。React 版将分页提成独立控件，Vue 版将 pagination 配置交给 NDataTable；相同的验收标准是当前页、总数、切页请求和 URL/筛选语义正确。

{{IMG:M7-11-排查图}}

## 排查清单：不要跳过网络请求这一环

### 1. 确认响应信封已正确拆包

浏览器 Network 面板查看响应：`data.list` 应有当前页文章，`data.pagination.total` 应为 85。如果接口响应本身只有 10 条、total 却是 10，问题在 API 实现或请求参数，不是分页控件。

### 2. 检查总数映射

代码传入的是 `pagination.total` 还是 `list.length`？`totalPages` 是否被误当成总记录数？概念命名相近，数字却不同：本例 total 是 85，totalPages 是 9。

### 3. 检查控件的远程模式和受控页码

确认 NDataTable 使用 `remote`、当前 page 和 itemCount 与接口一致；确认 `onUpdatePage` 确实更新响应式 page。

### 4. 点击下一页观察请求

如果没有新请求，先看回调和 query key；如果新请求仍是 `page=1`，看状态更新或闭包；如果请求带 `page=2` 却返回第一页，检查 API 服务端是否正确消费分页参数。

### 5. 检查 query 是否被缓存错误复用

query key 是否包含 page/pageSize/筛选条件？TanStack Query Devtools 或日志能帮助确认 key 与 queryFn 参数。不要为了“刷新”而关闭缓存，先修复查询身份。

### 6. 检查空状态和越界恢复

删除最后一条记录后，总页数可能减少，当前 page 可能已经超出范围。应将页码调整到有效范围并重新获取；否则用户会看到空白页面，以为数据丢失。

## 如何测试分页，而不写镜像测试

对分页做有意义的验证，应覆盖交互数据链，而不只是测试一个计算函数：

- API mock 返回 `page=1, total=85, totalPages=9`，确认控件计算出可翻页状态。
- 点击下一页后确认传给 API 的参数包含 `page=2`。
- 响应第二页数据后确认表格展示新记录，页码显示第二页。
- 改变筛选条件后确认页码复位为 1。
- 当总页数变少且当前页越界时，确认恢复到有效页码。

当前用户验收提供的接口 JSON 是定位线索，但开发者本地 mock 测试只能证明前端的映射和回调；线上接口是否真的按 page 返回对应记录，还要观察真实请求与响应。把这两种验证分开记录，才能避免误报“前端已通过线上验收”。

## 小结：分页是一条端到端数据链

分页故障并不总是后端错误。Vue 的远程表格要将 `remote`、当前 `page`、`itemCount=total` 与 `onUpdatePage` 配齐；query key 和请求参数必须包含同一个页码；筛选变化后应复位页码。React 版虽然使用独立 TablePagination，仍遵循同样的端到端逻辑。

下一篇转向仪表盘：如何并行获取统计卡、分类分布、最近文章与评论，并根据角色决定哪些请求应执行、哪些区域应展示，以及空态和失败如何分开呈现。

## 延伸阅读

- [Vue Query：服务端数据缓存、query key 与变更失效]({{LINK:M7-10}})
- [统计看板：从数字堆砌到可执行的工作入口](https://blog.csdn.net/fungleo/article/details/166582519)
- [Naive UI DataTable 官方文档](https://www.naiveui.com/en-US/os-theme/components/data-table)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Naive UI、分页、服务端分页、TanStack Query、前端问题排查

### 文章简介（250 字以内）

本文从一次真实验收问题出发：接口返回 total=85、totalPages=9，管理后台却不能切换下一页。文章追踪服务端分页闭环，讲解 Naive UI DataTable 的 remote 模式、受控 page、itemCount 与页码回调如何连接 Vue Query key 和 API 参数，并对比 React 独立 TablePagination 的做法，给出从响应映射到网络请求的逐层排查和验证清单。

### 建议发布分类

前端 / Vue.js

### 封面短标题

分页为什么只有一页

### 配图 AI 提示词

1. M7-11-封面：接口数据显示 total=85、pageSize=10、totalPages=9，流向远程表格分页器，再通过 page=2 回到 API 请求，表现闭环；清爽白底浅蓝，数字准确。
2. M7-11-排查图：从 Network 响应、total 映射、remote、受控 page、更新回调、queryKey 到请求 page 参数逐步排查，避免把 totalPages 和 total 混淆。
3. M7-11-远程分页：放在正文同名占位处，远程分页数据流：total 与 page 如何从接口经 query key 流到表格分页组件。

### 发布前核对

- [ ] 确认示例分页响应字段与冻结 OpenAPI 保持一致。
- [ ] 对照 Vue DataTable 当前 remote、itemCount、page 和回调配置。
- [ ] 对照 React TablePagination 的真实 props 和 URL 查询状态。
- [ ] 用实际配图替换三处 IMG 占位，并将延伸阅读中的 LINK 占位替换为已发布文章地址。
- [ ] 发布时删除本段辅助信息，避免把建议测试误写为已经通过线上测试。
<!-- PUBLISH_ASSIST_END -->
