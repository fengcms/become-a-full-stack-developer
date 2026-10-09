# 成为全栈·Vue 管理后台篇·`<script setup>`：把页面拆成可读、可测的 Vue 组件

> Vue 单文件组件让模板、状态和样式靠得很近。用得好，读者可以沿着页面看懂一次交互；用得不好，一个 `.vue` 文件也能变成另一个难以维护的“全家桶”。

{{IMG:M7-03-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`，主要参考 `src/pages/articles/ArticleListPage.vue` 与 `src/components/PageHeader.vue`。

## 前言：组件变短，不等于逻辑就清楚

Vue 单文件组件（Single-File Component，SFC）把一个组件的模板、脚本和样式放在同一个 `.vue` 文件里。看起来这像是“把几种代码混在一起”，但对页面型界面来说，它也可以减少读者在文件之间来回追踪的成本：模板里用了哪个状态，脚本里很容易找到；当前页面的局部样式，也能贴着模板读到。

问题在于，SFC 只规定了文件形态，没有替我们决定职责边界。你完全可以把一张文章列表的路由参数、筛选表单、API 调用、权限判断、批量删除、错误提示、两百行表格列和全部 CSS 都塞进同一个文件。它依旧是合法 Vue，照样能运行，却很快会变成无法单独推理的“页面巨石”。

本文不打算背一遍 Vue 指令手册，而是沿着后台真实的文章列表和页面标题组件，说明 `<script setup lang="ts">` 怎样连接模板与逻辑，props 和 slot 怎样形成父子组件边界，以及什么时候应该抽出组合式函数或子组件。

## SFC 的三个区块各自解决什么问题

先看一个最小结构：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const count = ref(0)
const label = computed(() => `当前数量：${count.value}`)
</script>

<template>
  <button type="button" @click="count++">{{ label }}</button>
</template>

<style scoped>
button { cursor: pointer; }
</style>
```

`<script setup>` 中声明的 top-level 绑定可以直接在模板中使用。这里 `count` 是响应式引用，模板会追踪它的值；`label` 是根据 `count` 派生的计算值。组件实例更新时，Vue 根据模板依赖重新计算需要更新的部分。

这三个区块是协作关系，不是强制把所有东西写在一起：

| 区块 | 适合放什么 | 不适合承担什么 |
|---|---|---|
| `<script setup>` | 当前组件状态、事件处理、数据组合、子组件导入 | 整个项目的 HTTP 协议和所有页面共享逻辑 |
| `<template>` | 页面结构、组件组合、条件/列表展示、事件绑定 | 复杂业务状态机和难以阅读的多层表达式 |
| `<style scoped>` | 当前组件独有的布局与样式 | 全站主题令牌和多个页面共用的设计规则 |

`scoped` 让局部样式主要作用于当前组件模板中的节点，减少页面之间的意外覆盖。它不会自动产生设计系统，也不能替代全局 token。后台的主色、表面、边框和暗色模式由全局 CSS 令牌管理；文章列表里某个操作列的排列方式，才适合放在局部样式中。

## `script setup` 省略了什么？

传统的 `setup()` 需要返回暴露给模板的成员：

```ts
export default {
  setup() {
    const title = '文章管理'
    return { title }
  },
}
```

`<script setup>` 是编译器支持的简写形式，顶层导入和变量会被模板直接使用：

```vue
<script setup lang="ts">
const title = '文章管理'
</script>

<template><h1>{{ title }}</h1></template>
```

少掉的是显式的 `setup()` 和 `return` 样板，不是组件边界。组件仍然有自己的实例、状态和生命周期；导入一个模块也不会自动让它成为全局状态。你需要看变量由谁创建、谁更新，才能判断它是组件本地状态、共享 store，还是服务器数据。

例如，下面三种写法的责任就不同：

```ts
const keyword = ref('')                        // 当前页面的输入状态
const auth = useAuthStore(pinia)                // 多个路由共用的客户端会话
const articles = useQuery({ queryKey, queryFn }) // 服务器数据缓存
```

不要因为它们都能在模板里访问，就把它们都称为“Vue 状态”。输入框、登录身份和文章列表有不同的来源与生命周期；这一点会在 M7-09、M7-10 分别展开。

## 用 `PageHeader` 看父子组件之间的边界

管理页通常有标题、描述和操作按钮。`PageHeader.vue` 将公共布局抽成一个小组件：

```vue
<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="page-heading">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-description">{{ description }}</p>
    </div>
    <div><slot name="actions" /></div>
  </header>
</template>
```

父页面传标题和描述，用命名 slot 提供当前页面专有的动作：

```vue
<PageHeader title="文章管理" description="管理稿件、审核投稿并维护已发布内容">
  <template #actions>
    <RouterLink to="/articles/new">
      <NButton type="primary">新建文章</NButton>
    </RouterLink>
  </template>
</PageHeader>
```

这个边界有三个特点：

1. 标题与描述由父页面决定，组件不需要知道文章、评论或用户是哪一种业务。
2. `actions` 位置由通用组件保留，里面的按钮仍由页面负责，因此子组件不会反过来决定“文章页要新建什么”。
3. `description` 是可选 prop，模板有值才显示；调用者不需要传空字符串来占位。

`defineProps` 是 `<script setup>` 支持的编译器宏，不需要从 Vue 导入。这里用 TypeScript 声明形状，配合 `vue-tsc` 检查调用者是否传了必需的 `title`。父子关系由 props 向下传数据、slot 由父级填内容。若子组件需要通知父组件状态变化，可以使用类型化的 `defineEmits`；但 `PageHeader` 只是展示布局，没有必要为它额外造一个事件 API。

## 从真实文章列表看组件脚本如何组织

`ArticleListPage.vue` 不是一张静态表格。页面脚本会用到路由、筛选输入、Vue Query、Naive UI、文章 API 和权限上下文。它的关键状态大致分成几组：

```ts
const route = useRoute()
const router = useRouter()
const page = ref(Number(route.query.page) || 1)
const status = ref<ArticleStatus | ''>((route.query.status as ArticleStatus) || '')
const keyword = ref(String(route.query.keyword || ''))

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

这段脚本的职责不是“让模板里有几个变量”那么简单：

- `page`、`status` 和 `keyword` 描述页面当前的筛选状态。
- `query` 把输入状态转换成 API 查询参数，空筛选值转换成 `undefined`，避免把无效空条件传给请求层。
- `queryKey` 带上查询参数，让不同筛选/页码对应不同的服务端缓存项。
- `queryFn` 只调用业务 API 函数，不在组件里重新拼接 URL 或解析响应信封。

模板负责把它们接到控件：`NInput v-model:value="keyword"` 改输入，`NSelect` 改状态，`NDataTable` 显示 `articles.data.value?.list` 并把页码事件写回 `page`。当状态或关键字变化时，`watch([status, keyword], ...)` 将页码复位到第一页。完整分页问题与 `remote` 行为属于 M7-11，缓存职责属于 M7-10；在本篇只看组件如何把它们连起来。

脚本中还有 `approve`、`remove`、`bulkDelete` 等操作。它们调用 API、显示消息，并在成功后通过 query client 失效文章查询。表格列需要在 TypeScript 中构造，页面用 `DataTableColumns<ArticleSummary>` 约束数据行类型；列的 render 回调也可以创建 RouterLink、Naive UI Tag 或动作按钮。

这也提示了 SFC 的容量边界：把页面状态和用户操作放在 `.vue` 文件里是可读的；如果一个文件同时维护多套无关状态机、重复的授权策略、复杂的纯数据转换，那就值得抽出 API 函数、权限函数、测试过的纯 helper 或真正复用的子组件。**要不要拆分，取决于职责和复用，不取决于这个文件到了第几行。**

## 类型要贯穿模板，而不是停在接口返回类型

对 Vue 后台来说，TypeScript 不只是 API 返回值的注解。文章列表把生成的 API 类型别名传给表格列：

```ts
import type { DataTableColumns } from 'naive-ui'
import type { ArticleSummary } from '@/types/common'

const columns: DataTableColumns<ArticleSummary> = [
  { title: '标题', key: 'title', render: (row) => row.title },
]
```

这样列回调中的 `row` 有明确类型，字段拼写错误可以在类型检查阶段发现。`import type` 说明它只用于编译期类型表达，不作为运行时模块依赖加载。

Vue 模板还涉及组件 props、事件、插槽、`v-model` 和动态绑定。普通 `tsc` 主要理解 `.ts` 文件，并不能完整理解 Vue SFC 的模板；因此项目使用 `vue-tsc --noEmit` 执行 Vue-aware 检查，并把它纳入 `pnpm build`。Biome 可以承担格式化和 lint，但不能取代这一步。

模板里的 ref 会自动解包，所以有些地方写 `page`，脚本里则读写 `page.value`。这个便利也需要保持一致：不要在同一数据流里有时把值当 ref、有时又把它当普通对象猜。后续 M7-04 会专门说明 ref 与 React render 状态模型的差别，以及 `computed`、`watch` 分别适合什么场景。

## 什么时候抽组件，什么时候抽组合式函数？

判断是否拆分时，可以先问三个问题：

| 观察到的情况 | 优先考虑 | 例子 |
|---|---|---|
| 同一种展示结构出现在多个页面，数据由各页面提供 | 展示组件 + props/slot | `PageHeader` |
| 多个页面复用同一段带生命周期的交互逻辑 | composable | 可复用的分页/筛选行为（若重复出现再提取） |
| 与 UI 无关的输入转换或规则需要单独验证 | 纯函数模块 | 分类树行投影、slug 校验等 |
| API 路径、错误信封、token 刷新涉及全局约束 | `api/` 或 `lib/` 模块 | `api/articles.ts`、`lib/request/` |
| 只有一个页面使用的一段清晰交互 | 先留在页面脚本 | 当前文章列表的审核与批量删除组合 |

抽象也有成本：调用者要理解额外参数，调试要跨文件跳转，过度通用的 helper 可能把类型变宽。只有当边界足够清楚、复用或独立测试带来的收益大于这些成本时，再抽出来。`script setup` 不是要求所有逻辑都写在模板旁边，而是提供一个默认组件上下文；架构仍需由开发者判断。

## 初学者容易遇到的几个问题

**模板里找不到某个变量。** 检查它是否在 `<script setup>` 的顶层声明、是否拼错、是否处在另一个函数局部作用域。脚本顶层绑定才会直接暴露给模板。

**父组件传了 prop，子组件修改后父组件状态没有变化。** prop 表达的是父到子的输入，不应把它当成本地可随意改写的状态。需要回传时，定义事件或 `v-model` 协议，并让父组件拥有最终状态。

**组件变得越来越长，打算按行数拆。** 先看逻辑是否可独立命名、是否重复、是否有独立输入输出、是否能单独测试。把连续 30 行搬进子组件但仍通过全局变量互相读写，只改变了文件长度，没有建立边界。

**组件样式影响了其他页面。** 检查是否真的使用 scoped、选择器是否穿透组件内部、全局 token 是否放错层。若多页都需要同一规则，应该沉淀为全局样式或 Naive UI 主题，而不是复制相同 CSS。

**构建通过但模板字段仍有类型问题。** 检查 `pnpm build` 是否执行 `vue-tsc`，不要只运行 Vite 打包命令。

## 一个小练习：把页面拆分决策写出来

打开 `ArticleListPage.vue`，选取“筛选状态变化后回到第一页”这条行为，写出它涉及的脚本状态、watcher、查询参数、query key 和表格回调。再看 `PageHeader.vue`，回答标题、描述和操作按钮分别由父子哪一侧负责。

最后为自己设计一个新的 `EmptyState` 组件：

1. 它有哪些必需 props？哪些内容适合用 slot 提供？
2. 用户点击“重试”时，组件应该直接发请求，还是通知父页面重试？
3. 如果当前项目只有一个页面用它，现在是否值得新增抽象？

没有唯一正确答案，但你应该能说明谁拥有数据、谁决定动作、抽象给调用者减少了什么复杂度。这比“所有页面都要组件化”更接近真实工程判断。

## 小结：SFC 让上下文靠近，边界仍要自己设计

`<script setup lang="ts">` 减少组件样板，让顶层绑定直接进入模板；props、事件和 slots 定义父子组件之间的信息方向；TypeScript 与 `vue-tsc` 把检查延伸到模板。它们让 Vue 页面更紧凑，但不会自动决定一个页面应该承担多少职责。

读真实页面时，沿着“输入状态 → 查询参数 → API 模块 → 服务端缓存 → 模板展示”追踪；写新页面时，保持同样清楚的方向。只在复用、独立验证或职责边界确实需要时再抽组件和 composable。这样，单文件组件才能成为一个方便理解的工作单元，而不是把应用所有逻辑塞进一份文件的许可。

下一篇将把视角从文件结构推进到运行模型：Vue 的依赖追踪与 React 的重新渲染分别意味着什么，为什么 `ref`、`computed` 和 `watch` 不能简单套用 React Hooks 的直觉。

## 延伸阅读

- [为什么把 React 管理后台再用 Vue 实现一遍]({{LINK:M7-01}})
- [Vue3 + Vite + Naive UI：后台工程基座怎么搭]({{LINK:M7-02}})
- [Vue 响应式与 React Hooks：同一交互的两种运行模型]({{LINK:M7-04}})
- [Vue 官方单文件组件指南](https://vuejs.org/guide/scaling-up/sfc.html)
- [Vue 官方 `<script setup>` 指南](https://vuejs.org/api/sfc-script-setup.html)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Composition API、TypeScript、前端组件化、Vue SFC、前端工程化

### 文章简介（250 字以内）

本文基于 Vue 管理后台的文章列表和 `PageHeader` 组件，讲解 `<script setup lang="ts">` 如何连接模板与组件状态、props/slot 如何划分父子边界、`vue-tsc` 如何检查 SFC 模板，以及组件和 composable 应在什么条件下抽取。文章避免只罗列指令，而是沿着筛选、分页和文章查询的实际数据流分析 SFC 责任边界，并给出组件拆分练习。

### 建议发布分类

前端 / Vue.js

### 封面短标题

读懂 script setup

### 配图 AI 提示词

1. M7-03-封面：16:9 中文前端技术文章封面，极浅蓝白底，深色文字和蓝紫色重点。将一个 Vue 单文件组件表示成三个清楚相邻的层：`<script setup lang="ts">`、`<template>`、`<style scoped>`，通过 props、slot 和数据状态连接；简洁现代、中文准确，不用伪造代码段。
2. M7-03-组件边界：父页面向 `PageHeader` 传 title、description 两个 props，并通过 actions 命名 slot 填入“新建文章”按钮；图中明确 props 向下、slot 内容由父组件提供。白底浅蓝、中文易读，不出现额外 emits 或双向绑定箭头。

### 发布前核对

- [ ] 对照 `ArticleListPage.vue`、`PageHeader.vue` 和 `api/articles.ts` 核对示例片段与代码快照。
- [ ] 确认 `PageHeader` 只有展示 props 和 actions slot；不要描述成已有 emit 或 v-model API。
- [ ] 补齐 M7-01、M7-02、M7-04 的文章链接。
- [ ] 核对 Vue 官方 SFC 与 `<script setup>` 链接可用。
- [ ] 发布时删除本段辅助信息，检查表格和代码块排版。
<!-- PUBLISH_ASSIST_END -->
