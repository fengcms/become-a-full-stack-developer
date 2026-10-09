# 成为全栈·Vue 管理后台篇·Naive UI 主题对齐：React 后台配色与明暗模式

> 换组件库时，默认主题很容易把整个产品带向另一个视觉方向。Vue 后台曾出现“前台浅蓝配色混进管理端”的偏差，后来改为参照 React 管理后台的蓝紫主色、明暗模式和设计令牌。本文拆解主题如何从全局变量传到 Naive UI 与 Markdown 编辑器。

{{IMG:M7-19-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `src/App.vue`、`src/assets/main.css`、`src/stores/ui.ts`、React `src/index.css` 与主题切换实现。

## 前言：组件库默认色不是产品视觉

Naive UI 能提供按钮、表格、选择框和对话框等一致组件，但如果直接使用默认主题，全站颜色、圆角、字号和暗色行为可能与 React 管理后台不一致。项目已有一套管理后台视觉识别和主题行为，因此 Vue 重写应复用产品设计方向，而不是跟随组件库默认值，更不应误用前台网站的主题色。

视觉对齐需要两部分：基础 CSS 令牌决定页面、侧栏、文字、边框和状态色；`NConfigProvider` 的主题与 overrides 决定 Naive UI 控件内部 token。Markdown 编辑器和预览又有自己的主题属性，需与应用解析后的主题同步。只改按钮主色并不能完成整体对齐。

## 从 React 管理后台抽出视觉基准

React 版在 `index.css` 中定义浅色与 `.dark` 两套 CSS custom properties。背景是极浅灰蓝，主色为偏蓝紫色，文字使用深灰，边框与侧栏也分别有语义令牌。暗色模式下背景、文字、surface、sidebar 和 accent 重新映射，而非简单套一层黑色背景。

主题颜色应按用途命名：`background`、`foreground`、`surface`、`muted`、`line`、`sidebar`、`accent`、`danger` 等。这样表格、菜单、卡片、输入框和警告可以引用相同语义，而不是散落几十个 `#hex`。更新品牌主色时只调整令牌，角色状态、语义成功/错误色则保持各自含义。

Vue 后台复制并调整了这一令牌模型到 `main.css`，保留 React 版蓝紫 accent 与轻柔浅色背景；暗色时替换 surface、文字、边框和侧栏令牌。它们驱动应用自己的布局 CSS 和响应式状态。

## `NConfigProvider` 管理组件库主题

根 `App.vue` 使用 `NConfigProvider` 提供中文语言、日期 locale、明暗主题和 `themeOverrides`：

```vue
<NConfigProvider
  :locale="zhCN"
  :date-locale="dateZhCN"
  :theme="resolvedTheme === 'dark' ? darkTheme : null"
  :theme-overrides="themeOverrides"
>
  <NDialogProvider>
    <NMessageProvider>
      <NNotificationProvider><RouterView /></NNotificationProvider>
    </NMessageProvider>
  </NDialogProvider>
</NConfigProvider>
```

`themeOverrides.common.primaryColor` 及 hover/pressed、borderRadius 和 fontFamily 将产品 token 延展到 Naive UI 组件。暗色时传 `darkTheme`，浅色时传 `null` 使用默认 light theme，再覆盖共同主色等属性。全局 Provider 包裹 dialog/message/notification，确保 portal 弹层也处于一致的主题上下文。

如果只切 CSS class，不把 darkTheme 交给 Naive UI，原生组件弹层、菜单或选择下拉可能仍处于浅色；如果只切 Naive UI theme，不切自定义 CSS 变量，应用自己的布局又会留在浅色。两层必须同步。

## system、light、dark 三种偏好

UI store 中保存 `themePreference: 'light' | 'dark' | 'system'`。最终 `resolvedTheme` 由用户偏好和 `prefers-color-scheme` 系统状态计算：

```ts
const resolvedTheme = computed(() =>
  themePreference.value === 'system'
    ? systemIsDark.value ? 'dark' : 'light'
    : themePreference.value,
)
```

系统主题通过 `matchMedia('(prefers-color-scheme: dark)')` 监听变化。当用户选择 `system` 时，OS 设置变化会立即刷新解析结果；若用户显式选择 light 或 dark，则系统变化不覆盖手动偏好。`theme` key 保存的是用户偏好，不是只保存当前恰好显示的主题。

切换时 store 更新偏好、写 localStorage、在 `document.documentElement` 上添加/移除 `.dark` 并设置 `color-scheme`。`color-scheme` 可让浏览器原生表单控件与滚动区域也选择匹配的系统外观。

## Markdown 编辑区和预览也要参与主题系统

Naive UI theme 不会自动改变第三方 Markdown 编辑器。`ArticleFormPage.vue` 将 `resolvedTheme` 绑定到 `<MdEditor :theme="resolvedTheme">`，预览页将同一个值传给 `<MdPreview>`。否则页面周围已切暗，编辑器或代码块却仍然亮白，形成突兀的主题断层。

所有视觉容器都要检查：编辑器、代码高亮、图表、弹窗、通知、select dropdown、日期选择器、表格 hover 状态和空态。对第三方组件先找官方主题 API，不能盲目写高优先级 CSS 覆盖内部实现，升级时容易失效。

## 为什么主题偏好可以落盘，token 不行？

主题和侧栏折叠是非敏感的 UI 偏好，刷新页面后保留能让用户体验连贯。auth store 的 access/refresh token 是会话凭证，不能因为 UI store 可以 persist 就一起写进 localStorage。是否持久化由数据敏感程度和生命周期决定，不由“用了 Pinia”决定。

Vue store 读取 `theme` localStorage key，默认 `system`；侧栏状态沿用 React Zustand 的 `befull-admin-ui` 格式，保持跨实现迁移时的偏好兼容。测试检查 light/dark 设置和侧栏存储形状，避免后续重构误删。

## 主题测试与人工视觉回归

`ui.test.ts` 覆盖初始系统主题解析、用户切换后 class 和 localStorage 的变化、系统媒体查询更新，以及侧栏偏好格式。测试可以证明状态逻辑正确，但不能证明每个按钮、弹层和 Markdown 表格在屏幕上对比度足够。

视觉验收建议在浅色和深色各检查：登录页、仪表盘、表格 hover/选中态、侧栏折叠、Modal/Select Portal、表单错误、Markdown 编辑与预览、空态和错误态；再分别改变系统主题和手动主题，确保两者优先级正确。截图应在相同 viewport、相同数据和相同字体条件下比较。

颜色对比度要结合文字大小和状态背景实测，避免只因色号和 React 一样就断言视觉一致。色彩空间 token 或透明混色在不同设备上的显示也可能略有差异。

## 小结：主题需要贯穿应用与第三方组件

主题对齐由产品语义令牌、Naive UI Provider、CSS `.dark`、系统偏好监听、localStorage 和 Markdown theme 共同完成。主色一致只是开始；布局表面、文字、边框、弹层和编辑内容都应响应同一 `resolvedTheme`。UI 偏好可以持久化，会话凭证仍然只留在认证生命周期中。

下一篇关注登录页：如何把它从简单表单变成管理后台产品入口，同时保持账号密码契约、角色分流和登录错误处理不变。

## 延伸阅读

- [管理员、编辑和会员：用户与个人中心并存]({{LINK:M7-18}})
- [登录页从表单变成产品入口]({{LINK:M7-20}})
- [Naive UI ConfigProvider 官方文档](https://www.naiveui.com/en-US/os-theme/components/config-provider)
- [MDN：prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Naive UI、Vue.js、暗色模式、CSS Variables、主题系统、前端设计系统

### 文章简介（250 字以内）

本文根据 React 管理后台的蓝紫主色与浅/深色语义令牌，分析 Vue 后台如何用 CSS custom properties、Naive UI `NConfigProvider`、theme overrides、Pinia UI store 和系统媒体查询完成主题对齐。文章说明 CSS class 与 Naive UI darkTheme 必须同步，Markdown 编辑器/预览需要单独接入 resolvedTheme，并通过主题/侧栏持久化区分非敏感偏好与认证凭证。

### 建议发布分类

前端 / Vue.js

### 封面短标题

Naive UI 明暗主题对齐

### 配图 AI 提示词

1. M7-19-封面：同一 Vue 管理后台的浅色与深色双视图，蓝紫 accent 一致，包含 sidebar、表格、弹窗和 Markdown 编辑器，突出多层 theme token 同步。
2. M7-19-主题链路：themePreference（system/light/dark）→ resolvedTheme → CSS .dark + Naive UI darkTheme + Markdown editor/preview，localStorage 仅保存 UI preference。

### 发布前核对

- [ ] 核实 React/Vue 管理后台 accent 与浅/深色 token，避免引用前台网站配色。
- [ ] 对照 App.vue NConfigProvider overrides 和 ui.ts theme storage。
- [ ] 检查系统变更监听与 Markdown 编辑/预览主题同步的实现。
- [ ] 补齐 M7-18、M7-20 内链。
- [ ] 发布时删除本段辅助信息，人工复核明暗模式截图。
<!-- PUBLISH_ASSIST_END -->
