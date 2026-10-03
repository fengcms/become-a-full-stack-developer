# 管理后台前端：技术栈与 UI 风格指导

> **文档用途**：给新系统管理后台的开发 AI（或人）提供一份可照搬的参考。内容全部取自已交付的
> 《成为全栈》文章系统管理后台（`manage-frontend/`），包含**真实依赖版本、真实目录、真实代码片段**
> 以及**真实踩过的坑**。凡本文档给出的写法，均在该项目中跑通并通过四门门禁。
>
> **如何使用**：把它当成「约定」而非「建议」。标 🔒 的是硬性约定，改动前必须先讨论；
> 标 💡 的是取舍理由，理解后可以按你的场景调整。
>
> 最后更新：2026-10-03

---

## 0. 一句话概括

**React 19 + Vite + TypeScript strict + Tailwind v4 + 自建 shadcn/ui + TanStack Query + React Hook Form/Zod**
的技术组合，配合**语义色令牌 + 三级阴影 + 统一表单外壳**的风格系统，核心目标是：
**任何页面看起来都是一个人写的，任何交互都有反馈，任何列表状态都能被 URL 还原。**

---

## 1. 技术栈清单（真实版本，可直接抄 `package.json`）

### 1.1 运行时依赖

| 分类 | 包 | 版本 | 用途与约定 |
|---|---|---|---|
| 框架 | `react` / `react-dom` | ^19.2 | 🔒 不使用任何 Class 组件 |
| 路由 | `react-router-dom` | ^7.18 | 路由懒加载 + 守卫见 §7.2 |
| 构建 | `vite` | ^8.2 | 内置 rolldown，`strictPort: true` |
| 语言 | `typescript` | ~6.0 | 🔒 **必须开 `strict`** |
| 样式 | `tailwindcss` + `@tailwindcss/vite` | ^4.3 | v4 用 CSS-first 配置，无 `tailwind.config.js` |
| 动画 | `tw-animate-css` | ^1.4 | Radix 动效 data-attr 类名来源 |
| 主题 | `next-themes` | ^0.4 | `attribute="class"`，暗靠 `.dark` 类切换 |
| 数据请求 | `@tanstack/react-query` | ^5.102 | 🔒 服务端状态一律走它，禁止 `useEffect` 里手写 fetch |
| 表单 | `react-hook-form` + `zod` + `@hookform/resolvers` | ^7.86 / ^4.5 / ^5.9 | 🔒 表单校验唯一方案 |
| 客户端状态 | `zustand` | ^5.0 | 只存会话/UI 偏好，**不存服务端数据** |
| UI 原语 | `@radix-ui/*`（dialog / dropdown-menu / select / popover / switch / label / avatar / separator / slot） | ^1.x~2.x | 按需安装，见 §4.1 |
| 变体管理 | `class-variance-authority` + `clsx` + `tailwind-merge` | ^0.7 / ^2.1 / ^3.6 | `cn()` 工具见 §4.2 |
| 图标 | `lucide-react` | ^1.37 | 🔒 唯一图标库，禁止混用 |
| 提示 | `sonner` | ^2.0 | 🔒 唯一 toast 方案 |
| 日期 | `date-fns` | ^4.4 | 格式化统一函数，见 §6.5 |
| 图表 | `recharts` | ^3.10 | 仪表盘用 |
| Markdown | `@uiw/react-md-editor` + `@uiw/react-markdown-preview` | ^4.1 / ^5.2 | 富文本写作场景，务必做 chunk 拆分见 §3.3 |

### 1.2 工程依赖

| 包 | 版本 | 说明 |
|---|---|---|
| `@biomejs/biome` | ^2.5 | 🔒 **格式化 + lint 唯一工具**，不用 ESLint/Prettier |
| `vitest` | ^4.1 | 单测（纯函数/工具类为主） |
| `openapi-typescript` | ^7.13 | 从 OpenAPI 生成 `types/api.gen.ts`，避免手写类型漂移 |

### 1.3 明确**不要**引入的东西

- ❌ UI 全家桶（Ant Design / MUI / Element Plus 等）：会与本套 token 体系打架，改不动主题。
- ❌ Redux / MobX：服务端状态归 TanStack Query，客户端状态量级用不到 Redux。
- ❌ axios：本项目 `lib/request` 已用 fetch 封装好 401 刷新与信封解包，再套一层是负担。
- ❌ CSS Modules / styled-components：Tailwind v4 + CSS 变量已够用，混用会造成两套样式心智。
- ❌ 通用字体（Inter / Roboto / Arial / Open Sans / 裸系统字体栈）作为**品牌展示字体**——见 §5.2 的取舍说明。

---

## 2. 目录结构约定

```
src/
├── api/            # 按域划分的接口函数（auth / articles / users / site ...），只做请求，不写 UI 逻辑
├── assets/         # 静态资源
├── components/
│   ├── ui/         # 🔒 shadcn 风格**无业务**原子组件（button/input/card/dialog/select...）
│   ├── form/       # 业务表单字段：FormField（统一外壳）/ TextField / SelectField / TagsField ...
│   ├── data/       # DataTable / TablePagination / BatchActionBar / BatchFailures
│   ├── feedback/   # ConfirmDialog / StateShell / FullPageLoading / QueryErrorState / UnsavedChanges
│   ├── dashboard/  # 仪表盘专用（StatCard 等）
│   ├── layout/     # PageHeader 等布局片段
│   └── editor/     # 编辑器封装（MarkdownEditor）
├── config/         # 静态配置（角色清单 roles.ts 等）
├── hooks/          # useXxx：数据钩子（useArticles）与通用钩子（useTableQuery / useToast）
├── layouts/        # AdminLayout / Sidebar / Topbar（后台外壳）
├── lib/
│   ├── request/    # 请求内核：core.ts / errors.ts / session.ts / helpers.ts
│   ├── errorCodes.ts  # 错误码 → 中文文案映射
│   ├── permission.ts  # 角色权限判定（纯函数，可单测）
│   ├── queryClient.ts # queryKey 工厂 qk
│   └── utils.ts    # cn()
├── pages/          # 按业务域分子目录，一个页面一个文件 + 同域弹窗/子组件
├── router/         # index.tsx（路由表 + 懒加载）、guards.tsx（鉴权守卫）
├── store/          # zustand：auth（会话）、ui（侧栏折叠）
├── types/          # common.ts（手写的领域类型）+ api.gen.ts（生成物）
└── index.css       # 🔒 全部设计令牌的唯一入口
```

💡 **分层铁律**：`components/ui` 不得 import 业务模块；`pages` 只做编排，不写通用组件；
重复出现两次以上的 UI 片段，第三次必须抽到 `components/`。

---

## 3. 工程与构建

### 3.1 四门门禁（CI 前必跑）

```bash
pnpm typecheck   # tsc -b --noEmit，必须 0 error
pnpm lint        # biome check --write .（注意：**--write 会改文件**，审阅前先看 diff）
pnpm test        # vitest run
pnpm build       # tsc -b && vite build
```

🔒 CI 里 lint 应改成只读：`biome check .`（不带 `--write`），否则 CI 会静默改代码。

### 3.2 开发期代理（方案 B：同源代理）

浏览器**永不直连后端**，全部走 Vite 代理，绕开 CORS。这条顺带决定了 *.env 里只需一个变量*：

```ts
// vite.config.ts
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:11000'

server: {
  port: 12000,
  strictPort: true,               // 端口被占用直接报错，不要静默换端口
  proxy: {
    '/api/v1': { target: API_TARGET, changeOrigin: true, secure: true },
    '/files':  { target: API_TARGET, changeOrigin: true, secure: true }, // ⚠️ 别漏
  },
}
```

⚠️ **踩过的坑**：附件 URL 常常挂在后端根路径（`/files/{key}`）而非 `/api/v1` 下。
只代理 `/api/v1`，所有图片必 404。切线上只需 `API_TARGET=https://xxx pnpm dev`，不动代码。

### 3.3 体积策略（重包必做）

- 路由级懒加载；
- 编辑器这类重依赖用 `build.rollupOptions.output.manualChunks` 单独成 chunk；
- 体积分析**默认关闭**，只在 `ANALYZE=1 pnpm build` 时挂 `rollup-plugin-visualizer`，避免每次产出一个 `stats.html` 噪点文件。

> 本项目的实测教训：Markdown 编辑器不拆时，文章表单页单 chunk **1.06MB**；
> 拆出 `md-editor` chunk 后，列表页/仪表盘不再被迫携带编辑器重量。

---

## 4. 组件体系

### 4.1 Radix 依赖最小化

只装真正用到的 Radix 包。其余组件（Button / Input / Textarea / Card / Badge / Tabs / Skeleton / Table / Separator）
**自建零依赖版本**，好处是：完全掌控样式、不被上游改动波及、包体更小。

`components/ui/` 现有清单（可直接照抄）：
`avatar` `button` `calendar` `card` `dialog` `drawer` `dropdown-menu` `input` `label` `popover`
`select` `separator` `skeleton` `sonner` `switch` `table` `tabs` `textarea`

### 4.2 必备工具函数

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 类名合并：clsx 处理条件类，twMerge 处理 Tailwind 冲突（后者覆盖前者）。 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

💡 `cn()` 让「组件默认类 + 调用方 `className` 覆盖」成立，是整套组件可定制的前提。
**任何可被外部定制的组件都必须用 `cn(base, className)` 且 `className` 放最后。**

### 4.3 表单字段：统一外壳 `FormField`

🔒 **所有表单字段必须走同一个外壳**，这样改一次布局，全站表单同步生效。

**当前约定：标签居左、控件居右**（用户明确偏好），窄容器自动回落：

```tsx
// components/form/FormField.tsx（节选）
<div className="grid items-start gap-1.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
  {label ? (
    <Label htmlFor={htmlFor} className="sm:mt-2.5 sm:text-right">
      {label}{required ? <span className="text-destructive"> *</span> : null}
    </Label>
  ) : null}
  {/* 无标签时控件也要落在第二列，保持与其他字段左对齐 */}
  <div className={cn('min-w-0 space-y-1.5', !label && 'sm:col-start-2')}>
    {children}
    {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
  </div>
</div>
```

要点：
- 标签列宽 `6rem`、右对齐；`<640px`（小弹窗）自动变上下堆叠，控件不会被挤成一条；
- `min-w-0` 必须有，否则长文本会撑破网格；
- 错误/说明**在控件列内部**，与控件左对齐。

上层字段组件都只负责「控件本身」：`TextField` / `TextAreaField` / `SelectField` / `TagsField` /
`ImageUploadField` / `SwitchField`（开关本身已是左右布局，不走 FormField）。

### 4.4 控件视觉一致性规约 🔒

所有「可输入的控件」必须满足以下同构要求（本项目已在 Input / Textarea / Select / TagsField 上对齐）：

| 项 | 约定 |
|---|---|
| 高度 | 常规 `h-9`（36px）；页面主标题这类大控件可 `h-11`（44px） |
| 圆角 | `rounded-lg`（10px），全站统一，不要 `rounded-md` 混用 |
| 浅色背景 | **`bg-white`**（不是 `bg-card`、不是透明） |
| 暗色背景 | `dark:bg-background` |
| 焦点态 | 单个控件 `focus-visible:ring-1 focus-visible:ring-ring` |
| 复合控件 | 用 `focus-within:ring-1 focus-within:ring-ring`（内部 input 设 `outline-none`） |
| 禁用 | `disabled:opacity-50 disabled:cursor-not-allowed` |

```tsx
// components/ui/input.tsx（节选）
'flex h-9 w-full rounded-lg border border-input bg-white px-3 py-1 text-sm transition-colors
 file:border-0 file:bg-transparent placeholder:text-muted-foreground
 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background'
```

⚠️ **真实踩坑**：标签输入（TagsField）外壳长得像 Input 但内部有多个可聚焦元素，
最初没有激活态 —— 用户第一眼就发现「它和别的输入框不一样」。
复合控件必须用 `focus-within`，这一点很容易漏。

⚠️ **另一条**：列表页筛选栏曾用裸 `<input>`，导致**激活态与表单内 Input 不一致**。
筛选区也必须用 `Input` 组件 + `className="w-56"` 之类只改宽度，**绝不手写同样的类名串**。

### 4.5 反馈组件（统一出口）

| 场景 | 组件 | 约定 |
|---|---|---|
| 二次确认 | `ConfirmDialog` | 🔒 **所有破坏性操作必须经过它**，禁止裸 `window.confirm` |
| 轻提示 | `useToast()` → sonner | 成功/失败统一走它，含错误码文案解析 |
| 页面级空/错/加载 | `StateShell` / `QueryErrorState` / `FullPageLoading` | 列表 `isLoading/isError/isEmpty` 三态各有归处 |
| 路由切换 loading | `FullPageLoading` | 配合 `Suspense` fallback |
| 未保存提示 | `UnsavedChanges` | 表单页改动未保存时提示 |
| 批量失败清单 | `BatchFailures` | 部分失败要列出明细，不能只说"部分失败" |

---

## 5. 视觉系统（风格核心）

### 5.1 色彩：oklch + 语义令牌，明暗双套

`src/index.css` 是唯一入口，结构是：**`:root` / `.dark` 放具体值 → `@theme inline` 映射为 Tailwind 工具类**。

```css
@import "tailwindcss";
@import "tw-animate-css";

/* 暗色采用 class 策略（next-themes attribute="class"） */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(0.985 0.004 250);
  --foreground: oklch(0.3211 0 0);
  --card: oklch(1 0 0);
  /* 弹层（Select / DropdownMenu / Popover）背景：取 card 同值，避免 bg-popover 解析为透明 */
  --popover: oklch(1 0 0);
  --primary: oklch(0.6231 0.188 259.8);
  --primary-foreground: oklch(1 0 0);
  --muted: oklch(0.972 0.003 250);
  --border: oklch(0.922 0.003 250);
  --input: oklch(0.922 0.003 250);
  --ring: oklch(0.6231 0.188 259.8);
  /* ... */
}
.dark { /* 同名字令牌的暗色值 */ }

@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-popover: var(--popover);
  /* ... */
}
```

🔒 **三条硬规则**：

1. **禁止在 JSX 里写硬编码色值**（`bg-slate-100` / `text-[#333]` 一律不允许）。要新语义色，先在 `:root`/`.dark` 定义令牌。
2. **`@theme inline` 而不是 `@theme`** —— `inline` 让生成的工具类直接引用 `var(--xxx)`，暗色切换才能运行时生效。
3. **状态色也令牌化**，且明暗各自定义「深底亮字 / 浅底深字」两套：
   `--status-draft-bg` / `--status-draft-fg`、`--role-admin-bg` / `--role-admin-fg` 等。
   徽标类只写一次 `bg-status-draft text-status-draft-fg`，暗色自动达标。

⚠️ **真实踩坑**：`--popover` 漏定义时，`bg-popover` 解析成透明，
**所有下拉/浮层的背景变成透明**，是一眼可见的低级事故。定义 `--card` 就必须同时定义 `--popover`。

💡 **背景不要平铺纯白/纯灰**。本项目用 `.app-bg`（两道 radial-gradient 叠 `--background`）做纵深：

```css
.app-bg {
  background:
    radial-gradient(60rem 60rem at 110% -10%, color-mix(in oklch, var(--primary) 12%, transparent), transparent),
    radial-gradient(50rem 50rem at -10% 110%, color-mix(in oklch, var(--primary) 8%, transparent), transparent),
    var(--background);
}
```

### 5.2 字体取舍（如实说明）

本项目**正文与 UI 用的是系统字体栈**，包含 `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"`：

```css
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC",
             "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-display: "Sora", ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
```

💡 取舍理由：**中文界面加载一套 Web Font 动辄数 MB，收益远小于成本**；
本项目另有 `--font-display` 承担标题辨识度。
若你的新系统有品牌诉求，**推荐补一套展示字体**（正文仍用系统栈），候选：Sora / Manifold / Gloock / Bricolage。
🔒 无论怎么选，都**禁止** Inter / Roboto / Arial / Open Sans / 裸 `system-ui` 作为品牌字体。
🔒 正文字号不低于 16px（`text-base`），辅助说明可 `text-xs`（12px），正文行高 1.5–1.7。

### 5.3 阴影：三级 elevation（本项目最值得抄的一条）

旧写法所有层级共用 `0 1px 3px rgba(0,0,0,.1)` —— 一层**紧、黑、高透明度**的投影，
叠在有描边的白卡片上就是一圈灰晕，用户原话是「**很脏、不精致**」。

改成**唯一来源 + 三级语义**：

```css
:root {
  /* 精致感要点：① 不用纯黑，用 slate 色调（16 24 40），白底上不发灰；
     ② 去掉「1px 高透明度紧箍」那层，改大模糊 + 低透明度；
     ③ 分层：e1 静息（几乎靠描边）/ e2 浮层 / e3 弹窗抽屉 */
  --elevation-1: 0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.03);
  --elevation-2: 0 2px 4px -1px rgb(16 24 40 / 0.05), 0 8px 20px -6px rgb(16 24 40 / 0.1);
  --elevation-3: 0 8px 16px -6px rgb(16 24 40 / 0.1), 0 24px 48px -12px rgb(16 24 40 / 0.16);
}
.dark {
  /* 深底上低透明度阴影等于看不见，需提高不透明度并加大扩散 */
  --elevation-1: 0 1px 2px 0 rgb(0 0 0 / 0.35);
  --elevation-2: 0 4px 12px -2px rgb(0 0 0 / 0.45), 0 2px 6px -2px rgb(0 0 0 / 0.35);
  --elevation-3: 0 12px 32px -8px rgb(0 0 0 / 0.55), 0 4px 12px -4px rgb(0 0 0 / 0.45);
}

@theme inline {
  --shadow-e1: var(--elevation-1);
  --shadow-e2: var(--elevation-2);
  --shadow-e3: var(--elevation-3);
  /* Tailwind 内置尺寸名一并映射到同一套，防止老写法漏网出现「两套阴影」 */
  --shadow-xs: var(--elevation-1);
  --shadow-md: var(--elevation-2);
  --shadow-lg: var(--elevation-3);
  --shadow-2xl: var(--elevation-3);
}
```

**使用规则 🔒**：

| 元素 | 阴影 |
|---|---|
| Card（静息） | `shadow-e1` |
| Select / DropdownMenu / Popover / Toast | `shadow-e2` |
| Dialog / Drawer / 侧边浮层 | `shadow-e3` |
| 小元件（Switch 滑块、图标按钮） | `shadow-e1`，**绝不能**用 e2/e3（16px 滑块配 48px 扩散会糊成一团） |

🔒 **新代码一律用 `shadow-e1/e2/e3` 语义名，禁用 `shadow-md` 这类尺寸名**——尺寸名会随元素大小失真，
并且会与 Tailwind 内置值形成两套体系（这正是本项目最初的病灶来源）。

### 5.4 圆角 / 间距 / 图标

```css
--radius: 0.625rem;                    /* 基准 10px */
--radius-lg: var(--radius);
--radius-md: calc(var(--radius) - 2px);
--radius-sm: calc(var(--radius) - 4px);
--radius-xl: calc(var(--radius) + 4px);
--radius-2xl: calc(var(--radius) + 10px);
```

- 卡片/弹层：`rounded-xl`；控件：`rounded-lg`；chip/徽标：`rounded` 或 `rounded-full`。
- 图标：`lucide-react`，常规 `size-4`（16px），独立按钮内 `size-5`（20px）；🔒 禁止多图标库混用。
- 触摸/点击目标 ≥ 36px，移动端主操作 ≥ 44px，相邻目标间距 ≥ 8px。

---

## 6. 交互规范

### 6.1 列表页：URL 即状态

```ts
const { page, pageSize, sort, query, setPage, setPageSize, setSort, setFilters, clearFilters }
  = useTableQuery({ defaultPageSize: 10 })
```

- 分页/排序/筛选全部写进 `searchParams`，**刷新和分享链接可还原列表状态**；
- `patch` 用 `replace: true`，不污染浏览器历史；
- 改筛选条件时**必须重置 `page: 1`**（`setFilters` 内部已做）。
- 🔒 分页数据形状：`data.list` + `data.pagination.{page,pageSize,total,totalPages}`
  （**不是** `{items,total}`，这是本项目契约的固定形状）。
- 关键词搜索必须防抖 300ms，避免每次按键 refetch。

### 6.2 表单：RHF + Zod，错误内联且保留输入

```tsx
const { control, handleSubmit, formState: { isDirty } } = useForm<FormValues>({
  mode: 'onTouched',
  resolver: zodResolver(schema),
  defaultValues: { /* ... */ },
})
```

🔒 **铁律**：出错时**只高亮并内联提示，绝不清空用户输入**。
🔒 空串字段在提交层统一转 `null`（例如 `summary: values.summary || null`），别让后端收到 `""`。
🔒 离开有改动的表单必须二次确认（`isDirty` + `ConfirmDialog`）。

**双动词操作栏**（写作类表单推荐）：底部操作栏直接写「保存草稿 / 发布文章」，**不要**用「提交」+ 状态下拉。
发布前若缺必填元数据 → 自动切到对应 Tab 并 `setError` 高亮，而不是弹一句 toast。

### 6.3 异步与批量

- 提交按钮：`disabled={pending}` 且文案切换（"保存中…"）。
- 批量操作期间用 `<fieldset disabled={busy}>` 整体锁住列表，**比逐个设 disabled 更稳**。
- 批量**部分失败**要给出失败明细清单（`BatchFailures`），并保留未成功的已选项。
- 所有 >1s 的操作必须有加载态；>100ms 的点击必须有视觉反馈（本项目用 `active:scale-[.98]`）。

### 6.4 空/错/加载三态

列表必须有：`isLoading` → 骨架或 `FullPageLoading`；`isError` → `QueryErrorState`（带重试）；空 → 空状态插画/文案。
🔒 不允许「什么都不显示」或「只显示 '暂无数据'」。

### 6.5 其他统一约定

- 日期统一 `format(new Date(v), 'yyyy-MM-dd HH:mm')`，空值回退 `—`。
- 权限判定集中在 `lib/permission.ts` 的**纯函数**（可单测），页面只调用不内联判断。
- queryKey 集中在 `lib/queryClient.ts` 的 `qk` 工厂，禁止散落字符串。
- 附件地址 = `ORIGIN + /files/<key>`，不要自己拼 host。

---

## 7. 请求层

### 7.1 统一信封

后端返回 `{ code, message, data, requestId, timestamp }`，`code === 0` 为成功。
`lib/request/core.ts` 负责解包，业务代码拿到的**直接是 `data`**。

```ts
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>  // 空值键自动丢弃
  skipAuth?: boolean
  skipAuthRedirect?: boolean
  skipRefresh?: boolean
}
```

要点：
- `FormData` 原样透传，**不设 Content-Type**（交给浏览器带 boundary）；
- 非 JSON 响应 / 信封缺失 → 给出可读错误（"响应未遵循统一信封格式"），而不是 `Unexpected token <`；
- 断网 → 中文提示"网络连接失败，请检查网络后重试"，而不是 `Failed to fetch`；
- 错误一律抛 `ApiError`，携带 `code / status / message / requestId`，由 `errorCodes.ts` 做中文映射。

⚠️ **必抄的坑（旋转令牌）**：
后端 refresh token 是**旋转**的。首屏并发 6 个请求同时 401，如果各自刷一次，
第一个换走新令牌后，后 5 个拿着旧值全部失败 → 用户被莫名踢出。
**必须做同飞去重**：

```ts
let refreshInFlight: Promise<string> | null = null
const refreshOnce = () => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}
```

配合 `flags.retried` 保证每个请求**只重放一次**，避免无限递归。

会话策略：accessToken 存内存（不落 localStorage）；刷新用内存 refreshToken 或空体借 HttpOnly Cookie；
启动时 `bootstrapSession()` 尝试静默恢复（失败是正常路径，不弹错不跳转）。

### 7.2 路由守卫

`router/index.tsx` 里路由级懒加载 + `<Suspense fallback={<FullPageLoading />}>`；
`router/guards.tsx` 按 `lib/permission.ts` 判定角色，越权跳 403 而非白屏。

---

## 8. 响应式与无障碍

- 🔒 三档响应式侧栏：≥1280 展开 / 1024–1279 自动折叠 / <1024 汉堡浮层（本项目 `AdminLayout` 已实现）。
- 🔒 表格在窄屏转卡片视图，或至少横向滚动；多列栅格必须能塌缩为单列。
- 🔒 图标按钮必须带 `aria-label`；表单控件必须有 `htmlFor`/`id` 关联；
  筛选栏没有可见 label 时，控件补 `aria-label`。
- 🔒 文本对比度 ≥ 4.5:1，UI 元素对比度 ≥ 3:1（用语义令牌的 fg/bg 配对天然满足）。
- 🔒 键盘可达一切：自建组件（如 Tabs）必须补 `role="tablist/tab/tabpanel"` 与方向键处理。
- 尊重 `prefers-reduced-motion`：动效集中在 `.animate-rise`、Radix data-attr 动画里，便于统一降级。

---

## 9. 页面模式样板

### 9.1 列表页骨架

```tsx
<div className="space-y-4">
  <PageHeader title="文章管理" description="..." actions={<Button onClick={...}>新建</Button>} />

  <fieldset disabled={batchBusy} className="mb-4 flex flex-wrap items-center gap-2">
    <Input aria-label="搜索" placeholder="搜索标题 / 关键词" className="w-56" value={kw}
           onChange={(e) => setKw(e.target.value)} />
    <FilterSelect ariaLabel="按状态筛选" value={status ?? FILTER_ALL}
                  onChange={(v) => setFilters({ status: v === FILTER_ALL ? undefined : v as Status })}
                  options={[{ value: FILTER_ALL, label: '全部状态' }, ...]} />
    {(status || keyword) && <Button variant="ghost" onClick={clearFilters}>清除筛选</Button>}
  </fieldset>

  {isLoading ? <FullPageLoading />
   : isError ? <QueryErrorState error={error} onRetry={refetch} />
   : <DataTable columns={columns} data={data.list} rowSelection={...} />}

  <TablePagination page={page} pageSize={pageSize} total={data.pagination.total} onChange={...} />
</div>
```

⚠️ **必抄的坑（Radix Select 空串）**：Radix 的 `<Select.Item value="">` 是**非法**的（空串是它保留的清除语义）。
筛选里用 `""` 表示"全部"会报错。约定哨兵常量：

```ts
export const FILTER_ALL = 'all'   // components/form/FilterSelect.tsx
// 页面侧：value={status ?? FILTER_ALL} / onChange 里 v === FILTER_ALL ? undefined : v
```

### 9.2 写作类表单页骨架（高度策略）

```tsx
// 页面根必须有**确定高度**，否则内部 flex-1 会退化成「按内容撑开」（见 §10.1）
<div className="flex h-[calc(100dvh-6.5rem)] min-h-[560px] flex-col">
  <div className="shrink-0">{/* 标题行 */}</div>
  <Tabs className="mt-3 flex min-h-0 flex-1 flex-col">{/* 内容区 */}</Tabs>
  <div className="flex shrink-0 items-center justify-end gap-3 border-t bg-background/80 py-3 backdrop-blur">
    {/* 双动词操作栏 */}
  </div>
</div>
```

---

## 10. 反模式清单（最有价值的一节，全是真事）

### 10.1 🔴 高度撑满失效：容器必须有确定高度

**现象**：某块区域能随视口变高，**但视口变矮时它不跟着变矮**。

**根因**：flex 列容器若主尺寸 indefinite（如只写了 `min-h-[...]` 而没写 `h-`），
子元素的 `flex-basis: 0%`（即 `flex-1`）在百分比基准不确定时会**退化成 `content`**，
于是高度被子内容的固定像素值撑住。

**修法**：给容器确定高度 `h-[calc(100dvh-6.5rem)]`，再用 `min-h-[560px]` 兜底（矮屏不再收缩，交给外层滚动）。
判断口诀：**想让子元素「占满剩余空间」，父容器高度必须确定。**

### 10.2 🔴 焦点环被裁：滚动容器要四向留白

**现象**：控件聚焦时，某一边的 ring 被切掉（本项目先后出现过右边、左边、顶边三处）。

**根因**：CSS 规范里 `overflow-y: auto` 会让 `overflow-x` 一并变成 `auto`（反之亦然），
裁剪发生在 **padding box** 边缘。位于容器边缘的控件，其 ring 必然被裁。

**修法**：给滚动容器的内容层**四个方向都留内边距**，必要时用负外边距抵消视觉位移：

```tsx
<TabsContent className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2">
  <div className="max-w-2xl space-y-4 py-2">{/* py-2 保证首/末字段的 ring 不被裁 */}</div>
</TabsContent>
```

排查口诀：**凡是加了 `overflow` 的容器，先自查四边内边距。**

### 10.3 🔴 第三方组件的 `min-height` 下限

**现象**：给编辑器传了动态高度，但它在矮屏下溢出来压住了底部按钮。

**根因**：`@uiw/react-md-editor` 默认 `minHeight = 420`。当传入 `height` 小于 420 时，
它仍按 420 渲染，实际高度 > 容器高度 → 溢出。

**修法**：显式传 `height` 时用同值覆盖下限：

```tsx
<MDEditor height={height ?? minHeight} minHeight={height ?? minHeight} />
```

通用教训：**给第三方组件传动态尺寸前，先查它有无内部上下限。**

### 10.4 🟡 样式体系分裂的三个高发点

1. **同一视觉元素两处实现**：卡片各自手写 `rounded-lg border bg-card shadow-...` → 必须收敛到 `Card`。
   自查方法：`grep "shadow-" src/` 与 `grep "rounded-" src/`，出现非组件的裸串就是分裂信号。
2. **两套阴影**：自定义 `--shadow-*` 变量与 Tailwind 内置 `shadow-md` 并存 → 见 §5.3 的 remap 方案。
3. **筛选区手写原生控件**：裸 `<select>` / `<input>` 导致样式、激活态与表单内不一致 →
   统一封装 `FilterSelect` + 复用 `Input`。

### 10.5 🟡 组件小细节

- **`size="icon"` 是定死的**：需要正方形但不同高度时，要用 `className="size-11"` 覆盖，
  并同步调整旁边元素的对齐（错误提示缩进 `pl-14` = 44 + 12）。
- **文本域行数上限 ≠ 视觉合法性**：`text-lg` 塞进 `h-9` 的输入框，28px 行盒进 26px 内容框会被裁 → 高度要跟着字号走（`h-11`）。
- **`--popover` 忘了定义** → 所有浮层透明（见 §5.1）。
- **Radix Select Item 空串非法** → 用哨兵值（见 §9.1）。

---

## 11. 新项目落地清单（照着做 12 步）

1. `pnpm create vite` + React TS 模板，装 §1 依赖；**开 TS `strict`**。
2. 配 `vite.config.ts`：`@` 别名指向 `src`、port `strictPort`、`/api/v1` 与 `/files` **两条**代理。
3. 配 Biome；scripts 里补齐 `typecheck / lint / test / build` 四门命令。
4. 建立 `lib/utils.ts` 的 `cn()`。
5. 写 `index.css`：oklch 令牌（`:root` + `.dark`）+ `@theme inline` 映射 + `app-bg` + 三级 elevation。
6. 建 `components/ui/` 原子组件（先 Button / Input / Textarea / Card / Dialog / Select / Label）。
7. 建 `lib/request/`（core / errors / session / helpers）+ `errorCodes.ts`，含 **401 同飞去重**。
8. 建 `hooks/useTableQuery.ts`（URL 同步）+ `hooks/useToast.ts` + `lib/queryClient.ts`（`qk` 工厂）。
9. 建 `components/form/FormField.tsx` 统一外壳，再长出 TextField / SelectField / TextAreaField / TagsField。
10. 建 `components/data/`（DataTable / TablePagination / BatchActionBar / BatchFailures）
    与 `components/feedback/`（ConfirmDialog / StateShell / FullPageLoading / QueryErrorState / UnsavedChanges）。
11. 写 `layouts/AdminLayout`（三档响应式）+ `router/`（懒加载 + 守卫）。
12. 跑四门门禁，对着 §10 逐条自查一遍，再开始堆业务页面。

---

## 12. 交接给开发 AI 时的话术建议

> 你现在要开发一个新系统的管理后台。请先完整阅读这份文档，尤其是 §5（视觉系统）、§6（交互规范）、
> §10（反模式清单）。硬性约定（标 🔒）不要自行变更，有疑问先问。
> 每完成一个页面，自查：① 有没有绕过 `FormField` 手写字段；② 有没有硬编码色值或 `shadow-md`；
> ③ 空 / 错 / 加载三态是否齐全；④ 四门门禁是否全绿。
> **不要**为了实现速度引入 UI 全家桶或第二个图标库。
