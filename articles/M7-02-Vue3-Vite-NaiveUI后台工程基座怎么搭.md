# 成为全栈·Vue 管理后台篇·Vue3 + Vite + Naive UI：后台工程基座怎么搭

> 一个管理后台从“能启动”到“敢继续开发”，中间还需要类型、测试、路由、请求代理和可重复的质量门禁。

{{IMG:M7-02-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`；项目依赖与工具版本以 `manage-frontend-vue/pnpm-lock.yaml` 为准。

## 前言：装好依赖，不代表工程已经搭好

`pnpm dev` 启动成功，是一个很好的开始，但它只证明开发服务器能够运行。它不能证明 `.vue` 模板已经通过类型检查，不能证明用户访问 `/articles/123/edit` 时路由能正确加载，也不能证明 API 请求被代理到了期望的后端。

管理后台尤其容易在这些“启动后才遇到”的环节积累问题：路由守卫和会话状态互相导入，类型检查漏掉 SFC 模板，开发服务器把 API 请求送到错误地址，新增依赖却没有更新锁文件。等业务页面写到一半才发现这些基础不牢，返工范围就会从一条配置变成几十个页面。

这一篇从当前 Vue 后台的真实工程出发，讲清楚项目用了哪些工具、目录怎样分工、入口按什么顺序装配，以及怎样设置最小质量门禁。我们关注的是“这套工程为什么能持续开发”，不是“把依赖安装命令复制一遍”。

## 先把实际技术栈列出来

Vue 后台在独立目录 `manage-frontend-vue/` 中运行。技术版本需要区分三个概念：`package.json` 声明允许的依赖范围，`pnpm-lock.yaml` 固定本次安装解析出的确切版本，`engines` 给出项目接受的 Node.js 下限。

| 范围 | 项目采用 | 在工程中负责什么 |
|---|---|---|
| 应用 | Vue 3 + TypeScript | 组合式 API、单文件组件和应用逻辑 |
| 开发与构建 | Vite + `@vitejs/plugin-vue` | 开发服务器、Vue SFC 转换、生产资源打包 |
| 组件与主题 | Naive UI + Ionicons 图标 | 表格、表单、弹窗、消息、全局主题 |
| 路由 | Vue Router | 页面映射、懒加载、登录与能力守卫 |
| 客户端状态 | Pinia | 会话和少量界面偏好 |
| 服务器状态 | `@tanstack/vue-query` | API 缓存、加载状态、重试和失效刷新 |
| API 类型 | `openapi-typescript` | 从仓库唯一契约生成 TypeScript 类型 |
| 质量验证 | Biome、Vitest、Vue Test Utils、`vue-tsc` | 规范、行为测试、SFC 类型和生产构建 |
| 文章编辑 | `md-editor-v3` | Markdown 编辑、预览、工具栏和图片上传适配 |

截至本文代码快照，锁文件中解析到 Vue 3.5.43、Vite 8.3.4、Naive UI 2.45.3。依赖声明使用 semver 范围，但真正复现时使用锁文件，而不是根据这组数字猜测“最新版本”。Node 下限写在 `package.json` 的 `engines.node` 中，pnpm 版本也通过 `packageManager` 字段记录。一个维护者在本机能启动，不代表 CI 或另一台电脑也会安装出相同的依赖树。

开始开发前，可以先检查工程身份和锁文件：

```bash
cd manage-frontend-vue
node --version
pnpm --version
pnpm install --frozen-lockfile
```

`--frozen-lockfile` 的价值是：如果 `package.json` 已变化、锁文件却没有同步，安装应该明确失败，而不是临时解析一套新的版本继续跑。依赖升级是一个需要审阅的改动，不应该悄悄发生在每个人第一次安装项目时。

{{IMG:M7-02-目录}}

## 目录不是越多越清楚，关键是能沿用户任务找到代码

技术方案曾提出 `features/` 与 `shared/` 作为一种可选的组织方向；当前项目实际采用的是较直接的分层目录：

```text
src/
├── api/          # 按业务域封装 API 调用
├── app/          # Pinia 实例等应用级装配
├── components/   # 跨页面组件与测试
├── config/       # 菜单、角色标签等配置
├── layouts/      # 后台和个人中心布局
├── lib/          # 请求、权限、文件地址等基础能力
├── pages/        # 按页面和业务组织 Vue SFC
├── router/       # 路由、meta 类型与守卫
├── stores/       # Pinia 状态
├── types/        # OpenAPI 生成类型与领域别名
└── assets/       # 全局样式和静态资源
```

按这个结构找一条文章列表的调用路径，大致会经过 `pages/articles/ArticleListPage.vue`、`api/articles.ts`、`lib/request/`、Vue Query 缓存。页面知道当前输入和操作，API 模块知道请求方法与路径，请求层知道如何传凭证和解析统一信封，Vue Query 管理服务器数据的生命周期。

每一层都没有神秘之处。真正的收益是责任边界可读：若接口路径错了，先看业务 API 模块；若多请求的 401 同时刷新，去请求层检查单飞逻辑；若删除后列表不更新，再查 mutation 后的缓存失效。把所有逻辑放进单个大页面里，初期少跳几次文件，后期却会让每次改动都必须理解整张页面。

同时也要承认，目录的名字不是架构本身。把文件放进 `features/articles/` 并不会自动让文章域变得内聚；目录拆分是否有价值，要看模块之间的依赖和变更方式。当前阶段保持 `api/`、`pages/`、`lib/` 等结构，优先让读者能够从页面追到请求，避免为了“看起来像企业级架构”提前造出空壳。

## 应用入口需要明确装配顺序

Vue 后台的启动入口在 `src/main.ts`。它除了创建 Vue 应用，还要准备 Vue Query client、安装 Pinia 和路由、注册未授权处理器、尝试恢复会话，最后才挂载根节点。

简化后，顺序可以表示为：

```text
创建 QueryClient
      ↓
注册 401/禁用账号处理器
      ↓
创建 Vue app 并安装 Pinia、Vue Query、Router
      ↓
bootstrapSession() 恢复登录态
      ↓
设置启动状态 → 等待路由就绪 → app.mount('#app')
```

这里有一个容易被忽略的依赖关系：路由守卫要读取 auth store，而请求层在应用启动时可能发起 refresh 请求。若应用尚未安装 Pinia，某些 store 调用就会处于不明确的上下文里；若先挂载页面、再慢慢恢复会话，路由可能把一个本来有效的用户误判成匿名用户。入口把这些动作排出顺序，是为了让“应用开始显示”之前，关键的会话状态已经有明确结果。

Naive UI 的全局 Provider 放在 `App.vue`，集中配置中文语言、日期语言、主题和对话框/消息/通知容器。这样，业务页面调用 `useMessage()` 时不必各自创建通知实例，主题也有一个稳定的配置入口。路由组件通过懒加载导入，例如：

```ts
{
  path: 'articles',
  component: () => import('@/pages/articles/ArticleListPage.vue'),
  meta: { title: '文章管理', consoleOnly: true, capability: 'articles' },
}
```

懒加载让路由与页面文件保持边界，也使页面代码可以作为独立 chunk 进入构建结果。它不会自动解决页面数据请求、权限判断或加载状态；这些职责仍要在查询层、路由守卫和页面中分别表达。

## Vite 开发服务器不应该把 API 目标藏起来

前端页面一般运行在 `http://localhost:12001`，而 API 由另一套 Node 或 Go 服务提供。当前 Vite 配置通过开发代理把 `/api/v1` 和 `/files` 转发到 `API_TARGET`：

```ts
const env = loadEnv(mode, process.cwd(), '')
const apiTarget = env.API_TARGET ?? 'http://localhost:11000'

server: {
  port: 12001,
  strictPort: true,
  proxy: {
    '/api/v1': { target: apiTarget, changeOrigin: true },
    '/files': { target: apiTarget, changeOrigin: true },
  },
}
```

浏览器请求仍然发到当前页面同源的 `/api/v1/...`，由 Vite 服务端代理转发。`API_TARGET` 可通过本地环境配置指定；代码中的 `localhost:11000` 是未设置变量时的默认值。这个默认值只说明项目配置，不证明你的机器上一定运行着后端，也不证明线上请求会自动发生。

还有一个经常被遗漏的细节：接口代理和文件代理都需要设置。文章编辑器上传后通常会拿到附件路径，文章预览随后还要访问 `/files/...`。若只代理 API，登录和文章列表看起来都正常，图片却会 404。配置中把两条路径指向同一个 target，正是为了让接口与附件请求使用同一套后端环境。

前端公开环境变量与后端秘密也要分开。Vite 的 `VITE_` 前缀变量会进入浏览器可见的构建结果，因此不能把数据库密码、API 私钥或管理凭证放进去。`API_TARGET` 是 Vite 开发服务器读取的配置，不需要暴露给浏览器端代码；登录名、密码也不应硬编码在项目里。

{{IMG:M7-02-质量门禁}}

## 工具门禁要各自负责一件事

当前脚本把日常检查明确列在 `package.json` 中：

| 命令 | 实际负责的检查 | 不能替代什么 |
|---|---|---|
| `pnpm check` | Biome 格式与 lint 检查 | Vue SFC 完整类型分析、接口行为测试 |
| `pnpm typecheck` | `vue-tsc --noEmit` 检查 TS 与模板类型 | 用户操作是否符合业务规则 |
| `pnpm test` | Vitest 执行单元和组件测试 | 生产资源是否正确打包 |
| `pnpm build` | 先执行 `vue-tsc`，再运行 Vite production build | 线上 API 目标和真实写操作是否正确 |
| `pnpm gen:types` | 从仓库 OpenAPI 重新生成类型 | 自动生成 API 请求函数或业务验证 |

这里 Biome 是唯一的格式化和 lint 工具，没有再叠加 ESLint 与 Prettier。配置使用推荐规则、两空格缩进、单引号，并忽略由 OpenAPI 生成的 `src/types/api.gen.ts`。Biome 的 Vue/HTML 支持仍需要结合当前版本验证，所以这套门禁没有把 Biome 当作模板类型检查器：`.vue` 文件的类型由 `vue-tsc` 检查，关键行为由 Vitest 验证。

为什么 `build` 还要显式执行一次 `vue-tsc`？因为负责把模块转成浏览器资源的打包工具，与理解 TypeScript、Vue 模板和组件类型的工具目标不同。把类型检查写入生产构建脚本，可以避免开发者只跑 `vite build` 就以为模板类型都被检查过。

同样，测试和构建的结果也不能互换。某个组件测试通过，不代表 Vite 资源分包和深层路由 fallback 没问题；构建通过，不代表 member 用户能够正确进入个人中心。质量门禁不是一条“全绿即可上线”的神奇命令，而是一组各自边界清楚的证据。

## 新页面接入时，按这条顺序自检

假设我们要新增一个“文章归档”页面，可以按下面步骤推进：

1. 先核对 OpenAPI 是否已经有所需查询，生成类型是否需要同步；不在页面中臆造后端字段。
2. 在 `api/` 中添加类型明确的请求函数，确认 query 参数与统一信封处理一致。
3. 在路由表加入懒加载路由与 `meta`，明确这是后台页面、个人中心页面还是公开页面。
4. 通过 Vue Query 获取数据，定义稳定 query key，并明确筛选变化、失败重试和缓存刷新策略。
5. 在页面中组合 Naive UI 的表格、筛选控件和加载/空/错误状态，避免把整套请求内核塞进页面。
6. 为关键规则补测试，然后运行 `pnpm check`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
7. 若功能依赖真实后端，再区分本地接口、公开线上接口和需要账号的受保护写操作，分别记录验证证据。

这个顺序不需要每次变成一套重型脚手架。它只是让缺少契约、权限、数据缓存、错误处理或构建检查这些问题尽量在页面扩张之前显现出来。

## 小结：工程基座要让下一次改动更容易验证

Vue 后台的工程基座由几部分共同组成：Vite 负责开发与打包，Vue 和 TypeScript 提供组件与类型表达，Vue Router 管页面和访问边界，Pinia 保存客户端状态，Vue Query 管服务器数据，Naive UI 提供统一组件，Biome、Vitest、`vue-tsc` 和生产构建分别把不同风险提前暴露出来。

这些工具没有谁可以独自替代其他工具。工程是否“搭好”，要看新页面能否按清楚的方向接入、接口地址是否可配置、类型和行为是否能验证、锁文件是否能复现安装，而不是看 `package.json` 里有多少热门依赖。

下一篇进入 Vue 单文件组件本身：`<script setup>` 怎样把模板、状态和交互放在一个组件里，又怎样避免页面变成一个越来越大的脚本文件。

## 延伸阅读

- [为什么把 React 管理后台再用 Vue 实现一遍]({{LINK:M7-01}})
- [Vue 管理后台技术方案与工程边界](../docs/vue-manage-frontend/01-技术方案与工程边界.md)
- [Vue 管理后台实施记录](../docs/vue-manage-frontend/03-实施记录.md)
- [后台骨架：布局、数据路由与分层守卫](https://blog.csdn.net/fungleo/article/details/165589276)
- [OpenAPI 生成类型，为什么请求函数仍然手写](https://blog.csdn.net/fungleo/article/details/165721265)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Vite、Naive UI、TypeScript、Biome、前端工程化

### 文章简介（250 字以内）

本文基于已经落地的 Vue 管理后台，介绍 Vue 3、Vite、TypeScript、Naive UI、Vue Router、Pinia、Vue Query、Biome、Vitest 和 `vue-tsc` 各自负责的边界。通过真实目录和入口代码解释应用装配顺序、API/附件代理、锁文件复现以及质量门禁，并区分类型、测试、构建和线上接口验证分别能证明什么，帮助开发者搭出可持续迭代的后台工程。

### 建议发布分类

前端 / Vue.js

### 封面短标题

搭好 Vue 后台工程基座

### 配图 AI 提示词

1. M7-02-封面：16:9 中文技术文章封面，浅白与极浅蓝背景，深蓝灰文字和靛蓝重点。中心展示一个整洁的 Vue 管理后台工程模块图，包含 Vite、TypeScript、Naive UI、Router、Pinia、Vue Query、Biome、Vitest 等标签，分成应用层、状态/请求层、验证层。中文排版正确，留白充足，不出现伪代码和未经授权的品牌图标。
2. M7-02-质量门禁：流程图表现 `pnpm check`、`pnpm typecheck`、`pnpm test`、`pnpm build` 各自检查格式、SFC 类型、行为和生产打包；旁注“通过不等于线上写操作已验收”。白底、清晰中文、专业技术信息图。
3. M7-02-目录：放在正文同名占位处，后台工程目录示意：沿“登录→列表→详情→编辑”的用户任务路径组织模块。

### 发布前核对

- [ ] 对照 `package.json` 和锁文件复核所有版本，不把安装快照说成当前市场最新版本。
- [ ] 确认 `main.ts`、`vite.config.ts`、Biome 配置和项目目录仍与文章代码快照一致。
- [ ] 核对 API 与 `/files` 两条代理规则、`API_TARGET` 默认值和 `.env.example` 的说明。
- [ ] 用实际配图替换三处 IMG 占位，并将延伸阅读中的 LINK 占位替换为已发布文章地址。
- [ ] 发布时删除本段辅助信息，检查表格、代码块和图片排版。
<!-- PUBLISH_ASSIST_END -->
