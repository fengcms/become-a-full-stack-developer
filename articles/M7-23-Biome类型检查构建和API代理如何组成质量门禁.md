# 成为全栈·Vue 管理后台篇·Biome、类型检查、构建和 API 代理如何组成质量门禁

> “本地能打开”不足以说明后台可交付。格式与 lint、Vue 模板类型、自动化测试、生产构建、深层路由和后端代理分别发现不同问题。本文把 Vue 工程的门禁和 Node/Go 联调方式串成一条可重复的验证流程。

{{IMG:M7-23-封面}}

> 本文代码快照：Vue 后台提交 `d3ee41a`。主要参考 `manage-frontend-vue/package.json`、`biome.json`、`vite.config.ts`、`.env.example`、`README.md` 和路由配置。

## 前言：质量门禁不是一个 build 命令

后台前端会在开发、测试、构建和部署阶段遇到不同问题：未用变量、格式差异、Vue 模板类型错、接口参数字段漂移、路由刷新 404、代理打错后端，以及生产 base URL 不匹配。单条命令无法证明所有这些层面都正确。

Vue 工程用 Biome 作为唯一格式与 lint 工具，不使用 ESLint/Prettier；`vue-tsc` 检查 Vue 单文件组件模板和 TypeScript；Vitest 运行自动化测试；Vite 生产打包；本地 Vite server 将 API 与文件请求代理到选定后端。每项门禁负责独立问题，组合起来才构成反馈闭环。

## 固定运行时版本和依赖管理

项目要求 Node.js `>=22.12.0`、pnpm `10.4.1`，依赖版本由 `pnpm-lock.yaml` 锁定。统一运行时减少“我本机可以、CI 不行”的差异；提交前不应在未确认兼容性的情况下更新锁文件或工具大版本。

README 中的常用命令包括：

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

`pnpm build` 运行 `vue-tsc --noEmit -p tsconfig.app.json`，通过后才执行 `vite build`。这意味着 production build 本身也包含 Vue-aware 类型检查，但开发期间仍可单独运行 typecheck 快速反馈。

## Biome：格式和 lint 一个工具负责

`biome.json` 固定两空格缩进、100 列宽、单引号、无分号，并启用 recommended lint 规则及未使用 import/变量错误。`pnpm check` 同时运行 Biome 的格式、lint 和 import 检查；`pnpm lint` 与 `pnpm format:check` 可以分别聚焦某一部分。

生成的 `src/types/api.gen.ts` 在 Biome includes 中排除，不让格式化器重写 OpenAPI 生成文件。这个例外应精准限定于机器生成结果，不代表整类 TypeScript 文件都不受检查。Biome 不执行 TypeScript 类型推导，也不懂后端运行时契约，不能替代 `vue-tsc` 或 API 测试。

项目选择 Biome 是明确的工程约束：工具链更少、配置统一，格式和 lint 由同一套规则维护。增加新工具前先确认它解决了 Biome 没覆盖的具体问题，避免 ESLint/Prettier 与 Biome 同时改写文件。

## vue-tsc：把检查延伸进模板

`.vue` 文件中有模板语法、组件 props/events、slot、`v-model` 和绑定表达式。普通 `tsc` 不会完整理解 Vue 单文件组件；项目使用 `vue-tsc --noEmit -p tsconfig.app.json`，由 Vue 类型工具解析 SFC 并检查绑定。

类型别名追溯至冻结 OpenAPI 生成 schema，页面表格行、请求 payload 和组件 prop 能在编译期发现不少字段错误。但泛型断言并非运行时 JSON 校验；类型检查通过也不代表后端部署版本必然返回预期字段。契约测试与真实环境联调仍然必要。

## Vitest：自动化验证项目规则

`pnpm test` 运行 Vitest。项目当前覆盖权限函数、请求信封/刷新/FormData、UI store 和 Router 守卫。运行结果证明这些测试用例断言通过，不能直接推导所有页面和线上网络环境全部正确。

若改了文章分页、上传、主题或路由，先运行相邻测试，再跑完整 test/build。没有对应测试的行为应通过页面验收或后续补测覆盖，而不是把“Vitest 通过”作为未测试路径的证明。

## Vite 代理：本地开发可切换 Node 与 Go

`vite.config.ts` 从环境变量读取 `API_TARGET`，默认 `http://localhost:11000`；开发服务器将 `/api/v1` 和 `/files` 代理到该目标：

```ts
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

`.env.example` 给出本地 Node/Go 后端兼容配置。要验证 Go，只需在开发环境将 `API_TARGET` 指向正在运行的 Go 服务，再用相同页面和账号走相同请求契约。代理是浏览器开发服务器的能力，不会自动成为 production build 的反向代理。

如果需要前端直接请求另一域，可设置 `VITE_API_BASE`，但那涉及浏览器 CORS、Cookie 和凭证属性；仅有 `API_TARGET` 不能替代生产域名配置。上线时应由静态托管/反向代理按部署方案处理 API 与文件路径。

## 深层路由刷新与静态托管

项目使用 `createWebHistory`，路由如 `/articles/123/edit` 在应用内部导航时正常，但直接刷新该地址时，浏览器会向 Web server 请求这个路径。开发服务器和 Vite preview 提供 SPA fallback；真实静态托管也必须将未知前端路径回退到 `index.html`，同时确保 `/api/v1`、`/files` 不被错误重写为 HTML。

这需要在部署配置上单独验证。`vite build` 成功只证明静态 bundle 可构建，不证明生产 Web server 已设置 history fallback。

## 建议的本地门禁顺序

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

之后在浏览器做关键路径 smoke：打开登录页、登录、访问文章列表、翻页、进入编辑器、返回页面、刷新深层路由、检查文件与 API 请求都走预期 host。若支持不同后端，分别将 `API_TARGET` 指向 Node 与 Go，确认页面行为和响应契约一致。

顺序可以依团队 CI 优化，但每一条命令的结果必须独立记录。Biome 格式错误应先修，类型失败先确认生成类型和 SFC 绑定，测试失败看相应逻辑，Vite build 解决资源打包/环境注入。不要只重跑最后一条命令然后忽略前面失败。

## 验证报告要区分构建与线上验收

完成本地门禁可以报告 Biome、`vue-tsc`、Vitest、Vite build 各自通过。若没有可用的生产凭证、没有在真实部署域执行写操作，就应明确说明尚未验证生产 cookie/cors、附件文件、管理写入或账号状态。用户不会因此少信任项目；模糊声称“全量线上通过”才会损害可信度。

同样，Node 与 Go 都通过相同 API contract，并不表示任一目标正在运行。`API_TARGET` 指到哪个服务、该服务健康状态、数据库 fixture 和用户角色，都要在联调记录中写清。

## 小结：门禁按责任组合，而不是互相替代

Biome 负责格式与 lint，`vue-tsc` 检查模板和 TS，Vitest 验证已覆盖逻辑，Vite build 检查生产打包，Vite proxy 便于本地切换后端，托管层还需支持 history fallback。每一层能提供有价值证据，也有清楚边界。

最后一篇将把这一整套 M7 工程和 React 管理后台放在一起复盘：对照状态模型、组件库、代码边界、实际缺陷与验证数据，限定结论在这个项目内，不把一次重写变成 Vue/React 的普遍排名。

## 延伸阅读

- [Vue 后台测试怎么分层：从纯函数到真实页面路径]({{LINK:M7-22}})
- [同一管理后台的 React/Vue 对照与重写复盘]({{LINK:M7-24}})
- [Vue 管理后台工程说明](../docs/vue-manage-frontend/README.md)
- [API 契约与兼容性：接口文档怎样约束前后端]({{LINK:B-16}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Vue.js、Biome、TypeScript、Vite、前端工程化、质量门禁

### 文章简介（250 字以内）

本文把 Vue 管理后台的工程门禁串起来：Biome 格式/lint、vue-tsc SFC 检查、Vitest、生产构建、OpenAPI 生成文件排除和 Vite `/api/v1`/`/files` 代理。重点说明 `API_TARGET` 只控制本地开发代理、生产仍需部署层支持 history fallback 与反向代理，并区分本地门禁通过和真实线上 Cookie/CORS/写操作验收。

### 建议发布分类

前端 / Vue.js

### 封面短标题

Vue 后台质量门禁

### 配图 AI 提示词

1. M7-23-封面：Biome、vue-tsc、Vitest、Vite build 四道门禁串联，之后连浏览器 smoke 和生产环境验收；白底浅蓝，标注每道门禁的验证范围。
2. M7-23-代理：Vite dev server 将 `/api/v1` 与 `/files` 代理到 `API_TARGET`，可指向 Node/Go；旁边强调这是开发代理，生产由部署层实现。

### 发布前核对

- [ ] 对照 package.json 脚本、Biome includes 与 Vite proxy 配置。
- [ ] 确认 API_TARGET 与 VITE_API_BASE 的开发/直连差异。
- [ ] 更新实际门禁执行结果，不把配置存在写成线上验收完成。
- [ ] 补齐 M7-22、M7-24、B-16 内链。
- [ ] 发布时删除本段辅助信息，检查所有命令可运行。
<!-- PUBLISH_ASSIST_END -->
