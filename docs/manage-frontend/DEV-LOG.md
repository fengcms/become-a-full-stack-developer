# M2 React 管理后台 · 开发流水账（DEV-LOG）

> 性质：流水账。不追求结构，只记录**踩过的坑、当时的判断、以及事后验证**。供 owner 回头复盘、学习前端工程化与「契约驱动」协作的真实过程。
> 配套：每阶段交付结论见 `M2-基座-NOTES.md` / `M2-Phase0~3-NOTES.md`；规范见 `开发规范.md`；计划见 `M2-开发计划.md`。
> 门禁四件套：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`（全绿才算阶段收口）。

---

## 2026-08-29 下午 · M2-01 基座脚手架

- 吸收 `telemarketing-saas-manage` 的 12 篇经验文档 + 其 `src/`，出了一份《M2 前端开发准备简报》。核心结论：参考项目是**已被生产验证的 Vite6 后台**，它的「请求层 / 状态分层 / 两阶段弹窗 / 配置驱动权限 / 偏严 TS+Biome」能直接搬；但**它的 API 契约与本系列不同**，请求层必须改写。
- 脚手架实际生成的是 **Vite 8（rolldown 构建）**，不是参考的 Vite 6。一开始在简报里写成了 Vite6，后面对照 `package.json` 才纠正——这是第一处会被自己误导的点。
- `pnpm create vite` 出来的 React 19 + TS 6.0 + Biome 2.5.11。本工程 `packageManager = pnpm@9.4.0`，不是参考项目的 pnpm 11，所以参考项目那套「裸 `./node_modules/.bin/tsc`」的坑不本工程适用，门禁直接走 `pnpm` scripts。
- **类型生成首波就上代码生成**：`openapi-typescript@7` 由 `docs/api/openapi.v1.yaml` 生成 `src/types/api.gen.ts`（约 4886 行）。唯一别扭：`openapi-typescript@7` 要求 ts ^5，本工程 ts 6.0，只有 peer 警告、不影响生成。记一笔，别以后再为这个警告纠结。
- **请求层改写（与参考项目最大的差异）**：
  - 信封 `{code,message,data,requestId,timestamp}`，`code===0` 成功（参考用 `success` 布尔）。失败抛 `ApiRequestError(code, message, status)`，`code` 是**数字**。
  - base `/api/v1`。错误码数字分段：1xxx 认证 / 2xxx 授权 / 3xxx 资源 / 4xxx 参数 / 5xxx 服务。
  - 401 无感刷新：用 `refreshTask` Promise 锁做并发去重，白名单 `/auth/login`、`/auth/refresh`、`/auth/logout` 不被 401 逻辑误伤。
- **CORS 踩坑（当时没定论，记成「待拍板」）**：线上 `https://api-befull.kao9.com` 返回 `access-control-allow-credentials: true` + `vary: Origin`，但**从不回显 `Access-Control-Allow-Origin`**。凭据模式下浏览器要求精确 allow-origin，缺了会拦截。当时列了方案 A（改后端 CORS_ORIGINS + Cookie 刷新）和方案 B（Vite 代理 + 内存 refreshToken 走 body），没敢擅自定。→ 后来 owner 拍板 B。

## 2026-08-29 下午 · 线上联调实测（方案 B 落地前先用代理试）

- dev 直接 `vite.config.ts` 加 `/api/v1` + `/files` 双代理到线上，绕开 CORS。
- 实测信封一致、分页 `{list, pagination:{page,pageSize,total,totalPages}}` 与 `Page<T>` 完全一致。
- **`/site/settings` 线上返回 5000**：库里没种子 `site_settings` 行。前端 `usePublicSiteSettings` 加了 `retry:false` + 侧栏回落默认品牌名，不崩。这锅是后端的，交后端 AI。
- 登录 `AuthResult` 同时给 `accessToken`(JWT) + `refreshToken`(体) + HttpOnly Secure Cookie + `user`。
- **关键陷阱**：后端 Set-Cookie 带 `Secure`，`http://localhost:12000` 不回传 → 基于 Cookie 的静默恢复只在 HTTPS 生效。dev 期靠**内存 refreshToken(体)** 保活，刷新页面需重登。这是方案 B 的已知代价。
- 顺手注册了个探针会员 `probe_member_x` 在线上库，记得让 owner 用 admin 删掉。

## 2026-08-29 晚 · 第一波代码规范回炉

- owner 补了 5 条硬规范：① 文档归 `docs/manage-frontend/`；② 函数一律箭头（禁 `function`）；③ 文件头注释 + 函数 TSDoc；④ 单文件 ≤200 行（特例文件头注明）；⑤ 如上。
- 41 个手写文件全箭头化 + 标准文件头。拆 `request.ts`(350) → `request/{errors,session,core,helpers,index}.ts`；`core.ts` 258 行高内聚，文件头注明 §4 例外。`AdminLayout`(265) 拆 Sidebar+Topbar；`LoginPage`(205) 拆 LoginForm；`StatePages` 拆 3 错误页。
- 门禁复绿：tsc 0 / biome 46 文件 0 / vite build 2086 模块 0。合规核对：手写文件 `function` 声明 0；超 200 仅 `core.ts`(258) 与 `router/index.tsx`(201)。

## 2026-08-29 深夜 · F0.5 Markdown 编辑器选型

- owner 原话：「要找一个好用的 markdown 编辑器，这是这个管理系统的核心功能。」计划原本想用 TipTap。
- **踩坑**：TipTap v3 已移除 `@tiptap/extension-markdown`（markdown 序列化脆弱），而且契约 `Article.content` 是纯 string（max 65535），不需要富文本 DOM。改采 **`@uiw/react-md-editor` v4.1.2**（CodeMirror6：左写右预览 + 工具栏 + 暗色跟随 `next-themes`）。
- pnpm 严格解析：预览 CSS `@uiw/react-markdown-preview/markdown.css` 解析失败 → 把 `@uiw/react-markdown-preview` 加为直接依赖解决。
- biome `noStaticElementInteractions`：编辑器静态 div 不能挂拖拽 → 改挂 `textareaProps` 上的 `onPaste/onDrop`。
- 粘贴/拖拽图片走 `POST /upload` 自动上传并插入 `![alt](url)`，用 `fileUrl()` 修正 `/files` 根路径（避开 /api/v1 前缀坑）。

## 2026-08-29 深夜 · Phase 1 文章管理

- 端点严格对齐契约 v1.11.0：`GET /admin/articles` / `POST /articles` / `PUT /articles/{id}`（非 PATCH）/ `DELETE /articles/{id}`(软删) / `POST /admin/articles/{id}/approve` / `POST /admin/articles/{id}/status`。
- 分页统一 `data.list` + `data.pagination`（之前简报里误抄参考项目的 `items`，已纠正；代码本就用 `list`，没被带歪）。
- 体积告警初现：`ArticleFormPage` 1MB（md-editor 引 CodeMirror+highlight.js），懒加载、仅 advisory，非错误。

## 2026-08-29 深夜 · 第一轮架构审阅（eno 专家）

- 综合 80/100 ⭐⭐⭐⭐。两处被标 🔴：
  1. **P2-1 CORS 方案 B 被误判「擅自决定」**：实际是 owner 的暂定决策，不是我自作主张。初版误判，已更正为「✅ 已确认决策」，但「Cookie 分支 dev 无实测」作为已知权衡保留。
  2. **P2-2 `tsconfig.app.json` 没开 `strict`**：当时只开 noUnusedLocals/Parameters，strictNullChecks/noImplicitAny 没生效。
- 🟡 工程化空白：P3-1 `@tanstack/react-table` 死依赖（DataTable 自建列模型，零引用）；P3-2 1.06MB chunk；P3-3 状态色硬编码 `bg-slate-200`（偏离令牌纪律）；P3-4 仓库根 3 个 0 字节 `_tmp_*` 被 git 跟踪；P3-5 零测试/零 CI/零 hook。
- 契约一致性专项 47/50（⭐⭐⭐⭐⭐）：`data?.list` 取数确认正确，七端一致最高价值维度确认前端请求层适配对了。

## 2026-08-29 深夜 · 第一轮整改（收口，评分 80→88）

- **A-P2-2 开 strict**：`tsconfig.app.json` 加 `"strict": true`，**0 类型错误**。怕门禁「假绿」，插了个哨兵文件（TS18047 's' is possibly null / TS7006 implicit any）验证 tsc 真拦，再用 `tsc --showConfig` 确认 `strict:true` 是生效值。现有代码零错是因为此前已习惯 `??` + `isApiError` 守卫。
- **P3-1** 移除 `@tanstack/react-table`。
- **P3-3** 状态色抽语义令牌：`--status-{draft,pending,published}-{bg,fg}` + `.dark` 深底亮字，组件改 `bg-status-draft text-status-draft-fg`。
- **P3-2（重点，体积 -47%）**：两步。① `manualChunks` 把编辑器生态拆独立 chunk → `ArticleFormPage` 1.06MB → 8.79kB。② 继续归因，真凶是 `rehype-prism-plus` 默认入口**同时** import `refractor`(36语言) 与 `refractor/all`(**297 全量**)。新增 `build/refractor-languages.ts`，vite alias **只顶替 `refractor/all`**（common 36 + 补 jsx/tsx/nginx/docker/http = 41 种）。md-editor chunk **1059.87 → 563.94 kB**（gzip 363.46 → 180.24）。
  - **关键发现**：官方 common 集（36 种）**没有 jsx/tsx**——React 技术栈后台文章里 jsx/tsx 高频，直接用 common 会让高亮静默失效，必须补。`html` 不用补（markup 自带 html 别名）。
  - 两个 alias 踩坑：① 不能写 `refractor/lib/common.js`（不在包 exports，解析失败）；② 不能 alias 裸 `refractor`（该文件自身 import 它 → 自循环）。
- **P3-4** `git rm` 三个 `_tmp_*` + `.gitignore` 加 `_tmp_*`，`git check-ignore` 验证生效。
- **P3-5 测试+CI**：装 vitest 4，28 测试 / 5 文件，覆盖审阅点名的四条路径。最值钱的两处「会静默失败」固化成守卫：
  1. `articles.test.ts` **反向断言** `data.items`/`data.total` 为 undefined（防参考项目 `{items,total}` 习惯串味致列表静默空白）。
  2. `refresh.test.ts` 401 并发刷新去重（刷新接口加 20ms 延迟撑开并发窗口，断言只打 1 次 refresh + 新令牌落内存、无 localStorage）。
  - CI `.github/workflows/manage-frontend-ci.yml` 用 `biome check .`（只读），当场抓到 2 处 import 排序——本地 `--write` 会自动改、永远「看着绿」。
- 门禁四门全绿：typecheck 0 / biome 73 文件 0 / vitest 28 / build 通。
- **owner 三项裁决**：① md-editor 563.94kB 超 500kB 告警线 → **接受不改**（文章系统含优质编辑器是必要项，且已省到 41 语言）；② 高亮 297→41 → 目视通过；③ Cookie 刷新分支 dev 无实测 → 上线前测试，暂忽略。

## 2026-08-29 深夜 · Phase 2 评论审核

- **发现计划与契约偏差（重要）**：`M2-开发计划.md` §5 写的 `POST /admin/comments`（代回复）与 `DELETE /admin/comments/{id}` **契约里不存在**——`/admin/comments` 只有 GET。真实端点：
  - 列表 `GET /admin/comments`（无 sort 参数）
  - 审核 `PATCH /comments/{id}/status`（reviewing 唯一进出路径）
  - 代回复 `POST /articles/{idOrSlug}/comments`（传 parentId 即回复；返回值**可能 rejected**，别插列表）
  - 删除 `DELETE /comments/{id}`（editor+ownerOverride，级联删子回复）
- 处理：契约是唯一真相源，按契约实现；偏差写进 `api/comments.ts` 文件头 + 用 `comments.test.ts` 钉死路径（防后人照计划文档「修正」成 404）。
- 三个设计取舍：① 契约不支持 sort → DataTable 刻意不传 sort；② `Comment` 无 articleTitle → 列显示 `#articleId` 跳编辑页；③ 代回复不做乐观插入（可能 rejected）。
- 门禁：test 33 passed（新增 5）。

## 2026-08-29 深夜 · Phase 3 分类树 + 标签

- **计划偏差 #2**：计划 §6 提标签「新建/合并/删除」，但契约**没有 merge 端点**（全仓 grep 无果）→ 合并不做，写进 `api/tags.ts` 文件头 + 页面注释「须先改契约再改实现」。
- **三条硬约束前置到 UI**（不点了才吃 409）：`Category.x-max-depth:4`（深度达 4 禁用新建子分类）；`DELETE /categories/{id}` 须无子分类无文章、不级联（有子节点禁用删除）；`DELETE /tags/{id}` 须无文章引用（`articleCount>0` 禁用）。
- **关键坑（契约缺口，前端兜底）**：`CategoryNode` schema **没有 parentId 字段**，父子靠 children 嵌套。而 `PUT /categories/{id}` 是**全量替换**——编辑子分类漏传 parentId 会被后端置空、静默挪到根。解法：抽纯函数 `buildParentMap(tree)` 从树反推 id→parentId，编辑时回填。成环防护 `collectSubtreeIds(node)` 从父级候选排除。
- 新增测试 `categoryTree.test.ts`(8) + `tags.test.ts`(4)。门禁：test 45 passed（新增 12）。

## 2026-08-29 末 · 简报纠错

- owner 指出《M2 前端开发准备简报》是动工前写的，含过时声明会误导后续。逐条对照 `package.json`/`vite.config.ts`/实测/裁决订正：Vite6→8、补编辑器选型、Cookie→方案 B 内存 refreshToken、门禁三→四、pnpm 11→9.4、CORS 待拍板→已选 B。新增 §8 纠错记录表 + 顶部状态标注 + 内联「🔧 已纠正」。

---

## 2026-08-29 收尾 · 后端契约校验清单自检（R1/R2/R3）

- owner 让后端修了 R1 的「分类 PUT 静默挪根」bug，并交来 `docs/prd/M2-后端契约校验清单-前端自检.md`（R1 局部更新 / R2 list 非 items / R3 /files 根路径），要我核对 P3 代码与 NOTES。
- **R1 实测结论：前端代码无需改功能**。P3 编辑表单从第一天就 `buildParentMap(tree)` 反推并**显式回传 parentId**（CategoryFormDialog 提交逻辑），从没依赖后端兜底——所以新旧语义下都正确。但代码注释里写的「PUT 是全量替换，漏传会静默挪根」与已更新契约（openapi:1541-1542）冲突，会误导后续，已改为「后端已修局部更新 + 前端双保险」。
- **R2 实测**：`grep 'data\.items'` 命中全是菜单配置 `group.items` 与 `articles.test.ts`/`comments.test.ts` 的**反向断言**（故意 `.items` 为 undefined），无真实列表取数误用；`Page<T>` 仍是 `list`。
- **R3 实测**：`grep '/api/v1/files'` 0 命中；`fileUrl()` 用 ORIGIN 拼 `/files/<key>`，helpers.test.ts 已钉死。
- **P3 NOTES 文档纠错**：§三「PUT 全量替换」论断改为「历史 bug + 后端已修局部更新 + 前端双保险」；§五 `parentId` 不再是缺口。
- 门禁复验：typecheck/lint/test(45)/build 全绿（仅 md-editor 563.94kB 告警，owner 已裁决接受）。
- 给 owner 的提醒：R1 文档 §0 注明「修复尚未确认重部署」，前端自检前**先确认后端已 `wrangler deploy` node-backend-v1.0.1**，否则线上仍会复现旧静默挪根。

## 2026-08-29 深夜 · Phase 4 用户管理（admin 专属）

- 按计划继续推进 Phase 4。先核契约，又发现**计划文档与契约偏差**（同 Phase 2/3 一类）：计划 §7 写 `GET/GET/PATCH /admin/users/{id}`，契约里这三个端点在 **`/users` 下**（admin 鉴权、路径不含 admin）；仅重置密码是 `POST /admin/users/{id}/reset-password`。按契约实现，偏差钉进 `users.test.ts`。
- 第二条偏差：计划写「重置后返回一次性凭证（等宽加粗+自动复制）」；契约 `AdminResetPasswordRequest` **要 admin 主动填 newPassword**（min 8），响应不返回凭证。故 `ResetPasswordDialog` 是输入密码，不是展示凭证。
- 复用范式：UserListPage 仿 CommentListPage（useTableQuery + DataTable + TablePagination）；编辑/重置两个弹窗仿 CategoryFormDialog（RHF+zod+Dialog）。
- **两处 TS 坑**：① `z.coerce.number()` 把 level 输入推成 unknown，与 RHF zodResolver 泛型冲突 → 改 `z.string()` + 提交转 number；② 字段级 `.refine` 也会破坏 zodResolver 泛型推断 → 改 `.regex(/^(?:[1-9]\d?|99)$/)` 校验 1~99（CategoryFormDialog 已验证 `.regex` 可编译）。
- **自锁保护**：编辑自身时禁用 `disabled` 状态选项，避免 admin 把自已封号锁死后台（真实 footgun）。
- 加 `role-*`(admin/editor/member) 与 `user-status-*`(active/disabled) 语义令牌（明暗），徽标不再硬编码调色板。
- 门禁：test 49 passed（新增 4）。下一步 Phase 5 仪表盘。

## 2026-08-29 深夜 · Phase 5 仪表盘（M2-17，替换探针）

- 关键认知：**仪表盘在基座（M2-09）已提前接真实 `/stats` 与 `/categories/stats`**，"探针"即是真数据。Phase 5 实为增强收口，不是从零替换探针。
- recharts 已装（^3.10.1，计划 R3 风险核实通过）。按计划"图表拆 StatsChart"，新增 `src/components/dashboard/StatsChart.tsx`（recharts 环形饼图）替换原 CSS 条形分类分布。
- 新增"近期文章"：`listAdminArticles({ sort: '-createdAt', pageSize: 5 })`——契约 admin/articles **支持** sort（openapi:2365 引用 Sort 参数）。
- 新增"近期评论"：⚠️ **又一处计划/契约偏差**——计划写 `GET /admin/comments?sort=-createdAt`，但契约 admin/comments（openapi:2130-2143）**无 sort**（仅 page/pageSize/status/articleId）。按契约取默认前 5 + 前端 `localeCompare(createdAt)` 兜底倒序，"近期"语义稳定不依赖后端默认顺序。
- 布局：统计卡网格 `xl:grid-cols-5`（editor 含待审）/ `4`；下方 `lg:grid-cols-3`（分类图 + 近期文章 + 近期评论，后两者 editor+）；member 仅见 4 卡 + 分类图。
- 守卫：`src/api/site.test.ts`（2 例）钉死 `/stats` 与 `/categories/stats` 路径 + 形状；注意 `/stats` 是 `/categories/stats` 子串，用 `not.toContain('categories')` 区分两者。
- 坑：recentComments select 用 `b.createdAt!` 触发 biome `noNonNullAssertion` → 改 `?? ''`（filter 已排空，冗余但消除断言告警）。
- 门禁：test 51 passed（新增 2）。DashboardPage chunk 336kB(gzip 99kB) 含 recharts，仅 lazy 仪表盘页承担；md-editor 563.94kB owner 已裁决接受告警。下一步 Phase 6 站点配置。

## M2 Phase 6 站点配置（2026-08-29 深夜）
- 交付：SiteSettingsPage.tsx（拉 GET /admin/site/settings 回填 + PATCH 局部更新 6 字段）+ LogoUploadField.tsx（替代计划中未实现的 F0.2，受控 + 复用 useImageUpload 走 POST /upload 拿 URL）+ 路由接入真实页 + site.test.ts(+2 admin 守卫)。门禁全绿（test 53，+4）。
- 坑①：计划 Phase 6 把 F0.2 `ImageUploadField` 当"已有组件"用，但基座阶段它根本没落地（grep 全仓只命中 useImageUpload hook）。→ 自建最小够用的 LogoUploadField，不回头补通用版（超出本阶段范围）。
- 坑②：权限 `canXxx` 是**函数式** `(actor) => boolean`，不是布尔。`enabled: canManageSiteSettings` 直接 TS 报错（函数不能当布尔）。正确写法：`useAuthStore((s)=>s.user)` → `const canSite = canManageSiteSettings(user)` → `enabled: canSite`。
- 坑③：契约守卫测试写 `not.toContain('/site/settings')` 误判——`/admin/site/settings` 本就含该子串，必然失败。区分公开/后台版应看 `/admin/` 段。
- 偏差：契约公开 `GET /site/settings` 返回 5000 是后端 R4 风险，本阶段只碰 admin 端点、不碰公开版；上线前需确认后端已修。

## 复盘要点（给 owner 的快速索引）

- **契约驱动的真义**：计划文档会写错端点（评论、标签合并），代码必须**以 `openapi.v1.yaml` 为唯一真相**，偏差写进文件头 + 用测试钉死路径。
- **「静默失败」比「报错」更可怕**：分页 `items` vs `list`、高亮语言缺失、parentId 静默挪根——都是不报错但功能坏。对策是**把风险固化成反向断言测试**。
- **门禁「假绿」防范**：strict 用哨兵文件验证、CI 用只读 `biome check`、refresh 并发用延迟撑开窗口。
- **体积优化要归因到根**：chunk 大不是 md-editor 的问题，是 `refractor/all` 297 语言；alias 只顶替 `/all` 即可。
- **决策权属**：CORS 方案 B 是 owner 拍板，不是 AI 擅自；审阅报告把「已确认决策」误判成「擅自」要更正。
- **未 git commit**：以上全部 owner 自管，建议按阶段单独提交（基座 / Phase0 / 第一轮整改 / Phase1 / Phase2 / Phase3）。
- **计划文档会"幻想已实现组件"**：F0.2 ImageUploadField 基座阶段根本没落地，计划却当已有用——动手前 grep 确认组件/字段真实存在，别信计划文档的"已完成"假设。

## Phase 7 · 个人中心（2026-08-29 晚）

- 第四轮审阅（Phase4+5+6）综合 90/100 无阻塞，明确可推进 Phase 7。本批交付：资料编辑 / 改密码 / 通知 / 点赞 / 收藏，全部 member 可访问。
- 路由：`/profile` 套 RequireAuth + ProfileLayout（左导航 + Outlet），5 个二级页（资料/密码/通知/点赞/收藏）。
- **F0.2 泛化落地（审阅 R-留意建议）**：头像上传是第二个图片场景 → 把 Phase6 的 `LogoUploadField` 泛化为通用 `ImageUploadField`（`accept`/`shape` 可选），站点设置与个人资料共用，删旧文件。
- **未读红点 = 轻轮询非 WS**：Topbar 加通知铃铛 + 红点，`useUnreadCount` 用 `refetchInterval: 60s` 拉 `/me/notifications/unread-count`（契约无推送通道）。
- 🔴 **R5 契约矛盾坐实**：`/me/likes` 契约返回**裸数组** `ArticleSummary[]`（非分页 `{list,pagination}`），计划/路线图写的 page 是错的——前端按数组消费，`me.test.ts` 反向断言非 `{list}`/非 `{pagination}` 防回归。这是契约生成层的已知内部矛盾，已钉死。
- 反馈纪律：useUpdateProfile/useChangePassword 已统一 toast，页面层不重复提示（避免双 toast）。
- 门禁全绿：typecheck/lint/build 0 错；test 62 passed（+9：me.test 5 + notify.test 4）。仍仅 md-editor 563.94kB 告警（owner 已裁决接受）。
- 上线前 checklist（R4 续）：公开 `GET /site/settings` 可能 5000 属后端修复项，本端未碰，需确认后端已修。

---

## 2026-08-29 深夜 · M2 Phase 8 跨切面（构建/部署/复盘，计划最后一轮）

- **M2-13 构建优化**：路由级懒加载早已就位（登录/仪表盘/文章/评论/分类/标签/用户/站点/个人中心 5 子页全 `React.lazy`），`manualChunks` 早已把编辑器生态隔离成 `md-editor` chunk（Phase1 整改 P3-2）。本阶段补**真实体积证据**：装 `rollup-plugin-visualizer@7.1.1`（dev 依赖），挂 `vite.config.ts` 但**仅 `ANALYZE=1` 时生效**（gated），平时/CI 零开销；`pnpm analyze` 生成 `dist/stats.html` treemap（1.5MB 可交互）。
- 实测产物（gzip）：共享 vendor `index` 127.77kB（首屏基线）、`md-editor` 180.24kB（唯一 >500kB，owner 已接受）、`DashboardPage` 99.05kB（含 recharts，仅 /dashboard 按需）、其余业务页 2~3.4kB。**首屏 ≈127kB gzip + 小页面 chunk**，体积策略已到位。
- 纪律：未擅自抬高 `chunkSizeWarningLimit`（md-editor 大是真实信号，抬阈值=藏问题，与审阅原则相悖）。
- **M2-14 部署指南**：写 `docs/manage-frontend/M2-14-部署指南.md`，Cloudflare Pages + Nginx 双方案，重点讲清 ① SPA 路由回退（`_routes.json` / `try_files $uri /index.html`）② `/api/v1` 与 `/files` 反代（dev 代理是方案 B 专用，生产不能指望）③ 缓存策略（哈希资源 immutable、index.html no-cache）④ 部署后验证清单 6 条。附件 `/files` 根路径坑写入 FAQ。
- **M2-15 复盘**：写 `docs/manage-frontend/M2-15-复盘文档.md`——四门门禁 + 62 测试 + 依赖增量；4 处「计划↔契约偏差」全部以契约为真相源回流 + 测试钉死；选型对错逐条给证据；七端契约一致性结论；组件/E2E 测试缺口列为工程化爬坡项（非阻塞）。
- **踩坑小记**：归档 treemap 到 `docs/manage-frontend/build-report/` 被 biome 扫出 1 warning（扫描 html 生成物）→ 改为只留 `dist/stats.html`（gitignore，biome 不扫），`biome.json` 加 `!docs/manage-frontend/build-report` 防再生。lint 复绿 111 文件 0 issue。
- 门禁四门全绿（实测）：typecheck 0 / lint 111 文件 0 / test 62 passed / build 通。未 git commit（用户自管）。
- **M2 前端全系列收官**：骨架 + Phase 0~8 全部落地，四门门禁持续全绿，端点严格对齐冻结契约 v1.11.0，文档（NOTES/部署/复盘/DEV-LOG）齐备。唯一跨端遗留 R4（公开 site/settings 5000）转后端上线前确认。
