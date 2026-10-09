# 成为全栈·Vue 管理后台篇·Pinia 与 Zustand：客户端状态应该保存什么

> 状态管理库不是服务器数据的仓库，也不是把所有变量集中到一个全局对象的理由。本文对照 React Zustand 与 Vue Pinia 的认证 store、界面偏好和 Vue Query，划清客户端状态的来源与持久化边界。

{{IMG:M7-09-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`，React 对照版提交 `d72df53`。主要参考两端 `store(s)/auth`、`store(s)/ui` 以及 Vue Query 使用方式。

## 前言：先问状态属于哪一类

开始用 Pinia 或 Zustand 之前，先问一个更重要的问题：这个值从哪里来，谁拥有它，应该活多久？

关键词输入属于当前页面；当前用户身份由登录与会话恢复建立；文章列表由服务器返回并可能被多个页面缓存；侧栏是否折叠是用户界面偏好。它们都能在 React/Vue 模板中被访问，却不应该因此装进同一个 store。

本文不把 Pinia 与 Zustand 做 API 名称对照表，而是比较项目里的真实边界：认证会话存内存，主题和侧栏偏好写入 localStorage，服务器文章数据交给 TanStack Vue Query。三者的生命周期和失效规则完全不同。

## Zustand 与 Pinia 的表达差异

React 管理后台使用 Zustand 的 `create` 建立 store，组件通过 selector 订阅所需字段；无需把应用包在 Context Provider 中，非组件代码也可以用 `getState()` 读取或更新。Vue 后台使用 Pinia `defineStore`，组合式 store 返回响应式 state、computed 和 action，组件内可直接组合使用，非组件代码则通过显式传入项目 Pinia 实例访问。

React 端认证 store 大致包含 `accessToken`、`refreshToken`、`user` 和启动状态。Vue 端的 auth store 也持有这几个内存值，并暴露 `setSession`、`setUser`、`clear` 等 action。框架 API 不同，领域职责相同：描述当前浏览器上下文中的登录会话。

不要因为 Zustand 的 store 看起来像一个普通函数，就把它当成“全局随便读写的变量”；也不要因为 Pinia 挂在 Vue App 上，就把所有页面状态都塞进去。订阅范围、更新时机和数据所有权仍需要设计。

## 认证状态：需要共享，但不要持久化成浏览器可读令牌

认证状态被请求层、路由守卫、顶部栏和页面操作共同使用，适合放在共享 store。Vue 的 store 使用内存 ref：

```ts
const accessToken = ref<string | null>(null)
const refreshToken = ref<string | null>(null)
const user = ref<User | null>(null)
const bootStatus = ref<BootStatus>('idle')

function clear() {
  accessToken.value = null
  refreshToken.value = null
  user.value = null
  bootStatus.value = 'ready'
}
```

React 端 `auth.ts` 同样刻意不使用 Zustand persist middleware。理由不是“内存令牌绝对安全”，而是避免把长期凭证写进脚本可读、跨页面刷新仍保留的存储。页面重载后，浏览器通过 HttpOnly refresh cookie 恢复短期 access token。APP 的安全存储路径与 Web 不同，不应从移动端方案推导出 Web 端也要把 refresh token 写 localStorage。

认证 store 保存访问请求所需的会话信息，不保存密码、登录表单内容或服务端全部用户列表。登录页的 username/password 只属于登录表单生命周期；用户管理列表属于服务器数据缓存。

## UI 偏好：适合持久化，但要控制范围

主题偏好和侧栏折叠属于 UI 偏好，不是身份凭证。Vue `ui.ts` 在初始化时读取主题和侧栏状态，并在用户改变偏好时写入 localStorage：

```ts
const themePreference = ref<ThemePreference>(readPreference())
const sidebarCollapsed = ref(readSidebarCollapsed())

function setThemePreference(value: ThemePreference) {
  themePreference.value = value
  localStorage.setItem('theme', value)
  applyTheme()
}
```

React 版通过 Zustand `persist` 持久化侧栏状态，并沿用既有 key/数据格式以保持迁移兼容。Vue 版显式管理存储，格式测试确保侧栏偏好仍可复用。两个实现库的 persist 机制不同，但共同遵循一条规则：只把适合跨会话保留的偏好写入本地存储。

主题选项还支持 `system`，这是用户设置与当前系统媒体查询的组合结果。偏好值是 `system`，解析后的主题可能是 `dark` 或 `light`；不要把“用户选择”与“最终呈现”混成一个字段。

## 服务端数据：不要再复制一份进 Pinia

文章列表、详情、评论和站点配置由 API 返回，会有 loading、error、stale 和 mutation 后失效等生命周期。Vue 工程用 TanStack Vue Query 管理这些服务端状态，query key 标识查询参数，mutation 成功后失效相关缓存。

如果把 `articles.data.value` 再复制进 Pinia，然后手工同步查询、创建、删除、审核所有变化，就会出现两个可能不一致的事实副本。查询库已经负责服务器数据缓存、请求状态和失效规则，Pinia 更适合跨页面共享的客户端状态。两者并不是互相竞争的全局 store。

一个实用判断表：

| 数据 | 例子 | 建议所有者 | 是否持久化 |
|---|---|---|---|
| 当前路由输入 | 页码、筛选条件 | URL query 或页面状态 | URL 可分享时保留在地址栏 |
| 临时界面状态 | 对话框开关、选中行 | 页面组件 | 通常不需要 |
| 共享会话 | 当前用户、access token | Pinia/Zustand 内存 store | 不写入 localStorage |
| 服务器数据 | 文章列表、站点信息 | Vue Query / React Query | 使用查询缓存策略，不手动复制 |
| 用户偏好 | 主题、侧栏折叠 | UI store | 可按产品需要持久化 |
| 敏感表单输入 | 密码 | 表单局部状态 | 不持久化 |

## UI 状态跨框架保持一致，持久化格式也可能是契约

React 项目的 Zustand store 使用 persist 配置将侧栏状态存到 `befull-admin-ui`。Vue 项目在重写视觉和状态层时，保留此 key 和数据形状 `{ state: { sidebarCollapsed }, version }`，读取时也兼容顶层旧格式。这不是后端 API 契约，而是浏览器本地状态的兼容约定。

为什么要保留？同一用户升级到 Vue 后台时，若偏好 key 随意变动，侧栏可能忽然恢复展开；教学项目也借此展示迁移时不只有服务器接口，客户端持久化数据也可能构成用户体验上的兼容边界。若产品明确允许重置偏好，格式迁移则可以简单化。

不要持久化整个 Pinia store 以求省事。全量序列化会把临时状态、敏感信息和未来新增字段一并写出；更好的做法是明确列出持久化字段、版本和迁移规则。

## 状态生命周期要和路由及刷新行为对齐

页面筛选若希望用户能分享链接、刷新后仍看到同一个结果，URL query 是更合适的持久状态；如果只在离开页面时短暂保留，组件或查询缓存可能已经足够；如果用户全站都需要相同主题，UI store 合适；如果状态依赖服务器权限，则应由服务端数据和会话恢复建立。

“把状态提到全局”不是默认升级。提到全局意味着更多消费者、更多同步关系和更长生命周期。很多错乱来自把一个本应随页面卸载而清除的选择状态放进持久 store。

## 测试应该验证行为而非 store 内部写法

Vue 的 `ui.test.ts` 检查主题改变时 localStorage 更新、系统主题解析，以及侧栏偏好仍按预期格式保存。React 端也通过 auth 测试确保会话不写入 localStorage。测试关注的是架构边界，而非 pinia 的内部实现或 zustand middleware 本身。

对状态管理的测试可以问：退出是否清空所有会话字段？主题是否写入正确 key？页面筛选改变是否更新正确 query key？mutation 后列表缓存是否失效？这比只断言某个 action 被调用更能保护真实用户行为。

## 小结：工具各有职责，事实来源保持单一

Pinia 和 Zustand 都能保存共享客户端状态；Vue Query/React Query 管理服务器缓存；URL 承担可分享的导航状态；页面自己拥有临时交互；localStorage 只保留明确挑选的 UI 偏好。认证凭证留在内存，并通过 Web refresh cookie 恢复，不用持久化插件保存长期令牌。

下一篇聚焦 Vue Query：如何设计 query key、复用列表和详情缓存、设置 stale 行为，并在变更后精确失效，避免把 API 结果复制进 Pinia。

## 延伸阅读

- [Vue Router 如何守住多角色后台边界]({{LINK:M7-08}})
- [Vue Query：服务端数据缓存、query key 与变更失效]({{LINK:M7-10}})
- [Zustand 官方文档](https://zustand.docs.pmnd.rs/)
- [Pinia 官方文档](https://pinia.vuejs.org/)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Pinia、Zustand、Vue.js、React、状态管理、前端安全

### 文章简介（250 字以内）

本文对照 React Zustand 和 Vue Pinia 的实际代码，按数据来源与生命周期划分认证会话、页面交互、服务器数据、URL 状态和 UI 偏好。文章解释为什么 access token 不应持久化到 localStorage，为什么文章数据应由 TanStack Query 管理，以及 Vue 重写如何兼容 React 版侧栏偏好格式，并提供状态归属判断表。

### 建议发布分类

前端 / Vue.js

### 封面短标题

客户端状态边界

### 配图 AI 提示词

1. M7-09-封面：Pinia/Zustand 作为共享客户端状态、Vue Query 作为服务器缓存、URL 作为可分享筛选状态、localStorage 作为 UI 偏好存储的分层示意；认证 token 标注“内存”，避免画入 localStorage。
2. M7-09-状态分类：用不同生命周期容器展示页面局部状态、共享会话、服务器缓存和持久 UI 偏好，指出每种数据由不同事实源负责。

### 发布前核对

- [ ] 对照 React auth/ui store 与 Vue auth/ui store 当前实现。
- [ ] 验证文章中本地存储 key 和 sidebar JSON 格式。
- [ ] 确认没有将 Vue Query 服务器状态建议复制进 Pinia。
- [ ] 补齐 M7-08、M7-10 内链。
- [ ] 发布时删除本段辅助信息，检查存储图没有误示 token 持久化。
<!-- PUBLISH_ASSIST_END -->
