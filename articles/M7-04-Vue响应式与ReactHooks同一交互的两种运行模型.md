# 成为全栈·Vue 管理后台篇·Vue 响应式与 React Hooks：同一交互的两种运行模型

> 迁移框架时最容易出现的误区，是只把 `useState` 换成 `ref`，却继续用原框架的运行直觉理解新代码。本文用文章筛选、分页和权限展示，比较 Vue 的依赖追踪与 React 的组件重新渲染。

{{IMG:M7-04-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`，对照 React 后台提交 `d72df53`。主要参考 `manage-frontend-vue/src/pages/articles/ArticleListPage.vue`、`manage-frontend/src/pages/articles/ArticleListPage.tsx` 和两端的管理布局。

## 前言：相同的交互，底层思路并不相同

一张文章列表里，用户输入关键词、切换状态、跳转页码，最后看到另一组结果。这件事在 React 和 Vue 中表现相同，但状态变化如何传播到界面，两个框架采用了不同模型。

React 组件函数在状态变化后再次执行，产生新的渲染结果；Hooks 用调用顺序和闭包保存状态，依赖数组告诉 React 何时重算副作用或缓存值。Vue 则让响应式对象在读取时收集依赖，在写入时通知相关计算和视图更新。理解这一区别，能解释为什么 `ref` 要在脚本里读 `.value`，为什么 `computed` 通常不需要手写依赖数组，以及为什么一个 `watch` 不能随意替代所有 `useEffect`。

本文比较的是运行模型，不评判框架优劣。两个项目承担同一套后台业务和 API 契约，因此特别适合作为迁移学习样本：界面行为尽量保持一致，差异集中在框架表达方式。

## React：状态更新会触发组件重新执行

先用简化代码表示 React 中的筛选交互：

```tsx
function ArticleList() {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const query = useMemo(() => ({
    keyword: keyword.trim() || undefined,
    page,
    pageSize: 10,
  }), [keyword, page])

  useEffect(() => {
    setPage(1)
  }, [keyword])

  // 使用 query 请求当前筛选和页码对应的文章
}
```

调用 `setKeyword` 后，React 会安排组件重新渲染。函数再次运行，新的 `keyword` 和 `page` 值进入当前这次渲染，`useMemo` 根据依赖数组判断是否重算 `query`。`useEffect` 在渲染提交后运行，并在 `keyword` 改变时把页码复位。

所以在 React 中，渲染函数里的局部变量属于一次渲染。事件处理函数会捕获创建它的那次渲染环境，这就是“闭包陈旧”类问题的来源之一。依赖数组也不是优化装饰，而是声明某段逻辑依赖哪些渲染值；漏掉依赖可能读到旧值，多写不稳定对象又可能触发额外执行。

## Vue：读取时建立依赖，写入时通知订阅者

对应的 Vue 写法可以是：

```ts
const keyword = ref('')
const page = ref(1)

const query = computed(() => ({
  keyword: keyword.value.trim() || undefined,
  page: page.value,
  pageSize: 10,
}))

watch(keyword, () => {
  page.value = 1
})
```

`ref` 返回一个响应式引用。脚本读取 `keyword.value` 时，Vue 能记录当前计算依赖了它；改变 `.value` 后，依赖它的 `computed`、`watch` 和模板会得到通知。`computed` 缓存上次计算结果，只有依赖变化时才重新求值。它表达“由其他响应式状态推导出的值”，不是把普通计算包起来就一定更快的通用缓存工具。

在模板里，顶层 ref 会自动解包，通常可以写 `v-model="keyword"` 或 `{{ page }}`；在普通 TypeScript 脚本里仍需要 `.value`。这种语法便利有明确边界，解构响应式对象、将 ref 传入普通函数等场景仍应留心是否保留了响应性。

## 看真实页面：筛选状态如何流到接口

Vue 版 `ArticleListPage.vue` 的关键代码是：

```ts
const page = ref(Number(route.query.page) || 1)
const status = ref<ArticleStatus | ''>((route.query.status as ArticleStatus) || '')
const keyword = ref(String(route.query.keyword || ''))
const pageSize = 10

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

watch([status, keyword], () => { page.value = 1 })
```

这里可以沿着数据方向读：控件更新 `ref`；`query` 根据当前筛选构造请求参数；Vue Query 的响应式 `queryKey` 标识这组参数对应的服务器数据；query 函数调用 API 模块；结果进入表格。筛选值改变会使 `query` 和 key 更新，而 `watch` 单独负责一个业务规则：状态或关键词变化时回到第一页。

注意，`watch` 的回调不是“组件每次渲染时执行的代码”。它响应指定源的变化。真实代码的 `watch([status, keyword], ...)` 明确表示这两个源；如果把整个大型对象深度监听，可能造成不必要的遍历，也很难看出究竟什么变化触发了副作用。能用 `computed` 表达纯派生值时，不要用 `watch` 手动维护第二份同步状态。

React 版则以 `useState` 保存筛选与选择状态，组件重渲染后把当前参数交给数据查询层。读 React 代码时，重点检查状态 setter、渲染闭包、Memo/Effect 依赖；读 Vue 代码时，重点检查 ref 的来源、计算属性依赖、watch source 和副作用清理。两边都应把“界面状态”和“服务端数据缓存”区分开，文章结果不该因为模板能访问它就塞进 Pinia 或 React 本地 state。

## `ref`、`computed`、`watch` 与 Hooks 如何类比

| 目的 | Vue 常见工具 | React 常见工具 | 阅读时的关键问题 |
|---|---|---|---|
| 保存可变的组件状态 | `ref` / `reactive` | `useState` / `useReducer` | 谁拥有它，哪些交互会修改？ |
| 推导展示或查询值 | `computed` | 直接在 render 中计算；必要时 `useMemo` | 这是纯派生值还是需要副作用？ |
| 对变化执行副作用 | `watch` / `watchEffect` | `useEffect` | 触发源是什么，是否需要清理？ |
| DOM 引用或非响应式句柄 | `ref`（模板 ref）/ 普通局部对象 | `useRef` | 改变它是否应该驱动界面更新？ |
| 可复用状态逻辑 | composable | custom Hook | 输入输出是否清晰，是否有生命周期？ |

这张表是阅读线索，不是逐项替换表。例如 React `useMemo` 和 Vue `computed` 都能缓存派生结果，但依赖发现方式不同；React `useEffect` 通常在提交后执行，Vue `watch` 支持不同 flush 时机并且能显式指定源。仅凭名字相似无法推断调用时机和生命周期。

## 权限状态：不要让 UI 推导取代授权

Vue 仪表盘用 `computed` 从当前用户计算是否展示文章和评论管理区块：

```ts
const canArticles = computed(() => canManageArticles(auth.user))
const canComments = computed(() => canModerateComments(auth.user))
```

React 版通过权限函数得到对应布尔值，再在 JSX 中决定是否渲染入口。两边共享的是领域规则，不是渲染机制。菜单隐藏、路由守卫、页面内操作按钮解决的是用户体验和错误导航；真正的数据读取与写入仍由后端鉴权。把按钮隐藏了，不意味着请求就获得授权。

如果权限函数是纯函数，最值得复用的是这段函数和它的测试，不是强行把它放进某个框架的响应系统。Vue `computed` 的作用是让当前用户变化时自动更新展示判定；React 组件重新渲染时会重新计算或复用。职责边界仍然由纯权限规则定义。

## 生命周期和副作用：不要把 `useEffect` 翻译成 `watchEffect`

React 的 Effect 通常需要清理订阅、定时器、事件监听或过期请求；Vue 的 `watch` 回调也能注册清理，组件卸载时 Vue 会停止组件作用域中的侦听器。两套 API 都要求开发者考虑副作用的完整生命周期，但触发逻辑不同。

后台布局监听屏幕尺寸，在 Vue 中会维护 `viewportWidth`，用 `computed` 推导移动/平板断点，并通过监听窗口事件更新状态；菜单抽屉关闭逻辑则监听路由变化和断点变化。此类副作用必须在卸载时移除窗口监听或恢复 `body.style.overflow`，避免离开布局后仍污染其他页面。React 对应逻辑使用 Effect 建立监听，并在 cleanup 中解绑。

选择 `watch` 还是 `watchEffect` 时，前者适合触发源明确、需要比较新旧值的场景；后者会追踪回调同步执行期间读取的响应式依赖，代码更短，但依赖来源不那么显式。选择 React `useEffect` 时，要确保依赖数组完整，并避免在 effect 中维护本可直接推导的重复状态。两者的共同原则是：副作用要有清楚的触发原因、执行边界和清理方式。

## 从 React 迁移到 Vue 的实用检查表

面对一个 React 页面，不要先逐个寻找同名 API。先把它拆为：

1. **用户可编辑的本地状态**：例如关键词、当前页、弹窗开关。迁到 Vue 时考虑 `ref` 或 `reactive`。
2. **从状态推导的值**：例如请求参数、按钮是否禁用、格式化后的标题。优先用 `computed`，不要新增一份需要同步的 state。
3. **服务器状态**：例如文章列表、文章详情。交给 Vue Query 等查询缓存，不要复制进组件状态。
4. **副作用**：例如同步 URL、注册窗口监听、提交保存。明确触发源、取消条件、错误处理和清理。
5. **纯领域规则**：例如角色能力判断。放在不依赖 UI 框架的函数中，通过两端测试验证其语义一致。

然后再检查每一个数据变化是否能沿着单一方向抵达界面。若同一个值同时出现在路由 query、组件 ref、Pinia 和 API cache 中，就要问清楚谁是事实来源，其他副本如何同步。状态重复往往比框架 API 本身更难维护。

## 小练习：追踪关键词变化

打开两个版本的文章列表页，分别回答：

- 输入一个新关键词后，哪些状态改变？
- 页码在哪个时机重置？查询 key 如何变化？
- 哪部分是服务器数据，哪部分是页面本地状态？
- 用户快速连续输入时，请求结果如何避免显示错乱？这由组件、查询库还是 API 层负责？

再把 `useMemo`、`computed`、`useEffect`、`watch` 的用途写成自己的对照表，并给每个工具举一个项目中的真实例子。只记 API 名字不够；你需要能解释它的依赖如何被发现、何时运行、怎样清理。

## 小结：先理解状态传播，再翻译 API

React 的组件函数以渲染为单位重新执行，Hooks 依赖调用顺序和显式依赖数组；Vue 通过响应式读取与写入追踪依赖，`computed` 表达派生值，`watch` 承担明确副作用。两者都能实现同一业务流程，但依赖模型、闭包行为和执行时机不同。

迁移时先区分本地状态、派生状态、服务器状态、副作用和纯业务规则，再选框架工具。这样既不会把 `useMemo` 生硬换成 `computed`，也不会把所有同步逻辑都塞进 `watch`。下一篇将进一步深入契约边界：如何从冻结的 OpenAPI 生成 Vue 端类型，并把类型、请求函数和后端契约各自放在正确的位置。

## 延伸阅读

- [为什么把 React 管理后台再用 Vue 实现一遍]({{LINK:M7-01}})
- [`<script setup>`：把页面拆成可读、可测的 Vue 组件]({{LINK:M7-03}})
- [从冻结 OpenAPI 生成类型，并组织 Vue API 模块]({{LINK:M7-05}})
- [Vue 官方响应式基础](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [React 官方：State as a Snapshot](https://react.dev/learn/state-as-a-snapshot)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、React、响应式原理、Composition API、前端状态管理、前端工程化

### 文章简介（250 字以内）

本文以同一套管理后台中的文章筛选、分页和权限展示为例，对比 Vue 响应式依赖追踪与 React 组件重新渲染模型。通过 `ref`、`computed`、`watch` 和 `useState`、`useMemo`、`useEffect`，解释两种框架的状态传播、闭包与依赖处理差异，并给出从 React 页面迁移 Vue 时区分本地状态、派生状态、服务器状态和副作用的检查方法。

### 建议发布分类

前端 / Vue.js

### 封面短标题

响应式 vs Hooks

### 配图 AI 提示词

1. M7-04-封面：中文技术文章封面，左右两栏对照 Vue 响应式依赖追踪与 React 组件渲染快照，中央用同一个“文章筛选→分页列表”流程展示状态变化；白色和极浅蓝背景、深蓝紫重点色，准确简洁，不出现伪代码文字。
2. M7-04-状态流：展示 keyword、status、page 三个输入流向 query，再流向 queryKey 与文章列表；标注 Vue computed 自动追踪、React render/useMemo 显式依赖，强调业务结果相同、运行模型不同。

### 发布前核对

- [ ] 对照 React 与 Vue 两端文章列表的当前实现核对状态模型描述。
- [ ] 检查示例为简化说明，不要误读成 React/Vue 项目逐字相同的完整源码。
- [ ] 补齐 M7-01、M7-03、M7-05 的文章链接。
- [ ] 核对 Vue 与 React 官方文档链接。
- [ ] 发布时删除本段辅助信息，检查表格和代码块排版。
<!-- PUBLISH_ASSIST_END -->
