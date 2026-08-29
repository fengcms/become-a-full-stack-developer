# M2 基座 · 工程脚手架（M2-01~09） · 交付与 NOTES

> 批次：基座（M2-01~09 工程搭建）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint(biome) 绿 ✅ / build 绿 ✅ / 线上联调 GREEN ✅

---

## 一、本批交付物

`manage-frontend/`（Vite 8 + React 19 + TS 6 + Tailwind 4 + shadcn/ui）含：

| 模块 | 文件 | 说明 |
|---|---|---|
| 工程配置 | `package.json` / `tsconfig.json` / `tsconfig.app.json` / `biome.json` / `vite.config.ts` / `vitest.config.ts` / `index.html` / `src/vite-env.d.ts` / `src/main.tsx` / `src/App.tsx` | pnpm9.4 + strict-ready TS + biome 2.5 + rolldown 构建 + dev 端口 12000 |
| 请求层 | `src/lib/request/{index,core,errors,session,helpers}.ts` / `src/lib/errorCodes.ts` | 信封解包 + 401 分流 + 旋转令牌并发去重 + 数字错误码映射 |
| 鉴权/状态 | `src/store/auth.ts` / `src/store/ui.ts` | Zustand 仅鉴权（内存 token，不 localStorage）+ UI 态 |
| 权限模型 | `src/lib/permission.ts` / `src/config/roles.ts` / `src/config/menu.ts` | 三角色 `member/editor/admin` + `canXxx` + `canOperateOwned` + 数据驱动菜单 |
| 布局/路由 | `src/layouts/{AdminLayout,Sidebar,Topbar}.tsx` / `src/router/{index,guards}.tsx` | 侧栏 + 顶栏 + `RequireAuth`/`RequireRole` 双层守卫 |
| 页面 | `src/pages/login/{LoginPage,LoginForm}.tsx` / `src/pages/dashboard/DashboardPage.tsx` / `src/pages/errors/{ForbiddenPage,NotFoundPage,NoAccessPage,index}.tsx` / `src/pages/PlaceholderPage.tsx` | 登录 / 仪表盘探针 / 三状态页 / 占位页 |
| 类型 | `src/types/common.ts` / `src/types/api.gen.ts` | `Page<T>` + OpenAPI 代码生成（4886 行） |
| UI 套件 | `src/components/ui/*`（16 件 shadcn：avatar/button/calendar/card/dialog/drawer/dropdown-menu/input/label/popover/select/separator/skeleton/sonner/switch/textarea/table） | new-york/slate 主题 |
| 工具 | `src/lib/utils.ts` | `cn()` 等 |

---

## 二、依赖选型理由（请总把控复核）

1. **Vite 8（rolldown）而非参考的 Vite 6**：`create vite` 当前默认产物，构建更快、配置更简。参考项目的 Vite6 经验仍适用，仅版本号不同（简报已订正）。
2. **OpenAPI 代码生成首波即上**：`openapi-typescript@7` 由 `docs/api/openapi.v1.yaml` 生成 `api.gen.ts`，前端只消费契约、绝不手改。已知 `openapi-typescript@7` 要求 ts ^5、本工程 ts 6.0 仅有 peer 警告，不影响生成。
3. **请求层自写（不引 axios）**：参考项目的 `request.ts` 范式照搬，但信封/`/api/v1`/数字错误码/并发刷新去重按本契约改写；`fetch` 原生足够，无额外依赖。
4. **Zustand 仅管鉴权**：服务端态全交给 TanStack Query，避免双源。accessToken 存内存（绝不 localStorage），刷新令牌 dev 期走内存 + `/auth/refresh` 请求体（方案 B）。
5. **biome 2.5.11 单一 lint/format**：`lint` 脚本 `biome check --write .`；CI 用只读 `biome check .` 防本地自动改掩盖问题。

---

## 三、关键设计（供后续阶段复用）

- **信封解包在 `request/core.ts`**：`payload.code === 0` 成功，否则抛 `ApiRequestError(code, message, status)`，`code` 为数字。
- **401 无感刷新并发去重**：`refreshTask` Promise 锁 + `_isRefresh`/`_retried` 防递归；白名单 `/auth/login`、`/auth/refresh`、`/auth/logout`。
- **权限原语 `canXxx(token, ...)` + `canOperateOwned`**：`src/lib/permission.ts` 纯函数，配 `<Can>` 组件做按钮级管控；真防线是路由守卫 + 后端 403。
- **`Page<T> = { list: T[]; pagination: { page, pageSize, total, totalPages } }`**：**禁用 `data.items`**（参考项目约定，会静默空白，已用测试钉死）。
- **附件 URL `fileUrl(key) = ORIGIN + /files/<key>`**：不带 `/api/v1` 前缀（vite 代理已配 `/files` 规则），否则 404。

---

## 四、运行方式

```bash
cd manage-frontend
pnpm install
pnpm dev          # Vite dev，端口 12000，代理 /api/v1 + /files 到 https://api-befull.kao9.com
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # biome check --write .
pnpm test         # vitest run
pnpm build        # tsc -b && vite build
pnpm gen:types    # 由 openapi.v1.yaml 重新生成 api.gen.ts
```

---

## 五、待总把控留意 / 回流项

- **未改动契约** `docs/api/openapi.v1.yaml`。
- **CORS 方案 B（已选）**：dev 走 Vite 同源代理，不开 `credentials`；`core.ts`「空体→HttpOnly Cookie」分支 dev 无实测，转上线前 checklist（切方案 A / HTTPS 时补验）。
- **线上联调遗留（交后端 AI，勿碰）**：① 探针会员 `probe_member_x` 待清理；② `/site/settings` 缺 `site_settings` 种子行会 5000（后端数据问题，非前端路径错）。
- **`tsconfig.app.json` 当时未开 `strict`**，Phase 0 后第一轮整改已补（见 `M2-Phase0-NOTES.md` 的整改记录 / `M2-第一轮审阅回复.md`）。
- 基座仅含骨架与登录/仪表盘探针；真实业务表从 Phase 0 基础件起逐模块落地。
