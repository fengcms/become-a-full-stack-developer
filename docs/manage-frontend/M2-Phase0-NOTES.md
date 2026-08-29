# M2 Phase 0 · 基础件（DataTable/表单/弹窗/编辑器/<Can>） · 交付与 NOTES

> 批次：Phase 0（基础件，任务卡 #12）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint 绿 ✅ / build 绿 ✅
> 注：本批同时涵盖 F0.5 Markdown 编辑器选型；第一轮架构审阅后的整改（开 strict / 去死依赖 / 抽令牌 / 拆 chunk / 测试+CI）也归口本批记录。

---

## 一、本批交付物

| 模块 | 文件 | 说明 |
|---|---|---|
| 列表范式 | `src/components/data/DataTable.tsx` / `src/components/data/TablePagination.tsx` | 通用表格（列模型自管，不引 @tanstack/react-table）+ 分页器，绑定 `Page<T>` |
| 查询同步 | `src/hooks/useTableQuery.ts` | 查询参数 ↔ URL 同步 |
| 表单范式 | `src/components/form/{FormField,TextField,TextAreaField,SelectField,SwitchField}.tsx` | RHF + Zod 字段封装，等宽加粗一次性凭证 |
| 确认/反馈 | `src/components/feedback/{ConfirmDialog,StateShell,FullPageLoading}.tsx` | 两阶段弹窗（禁背景关闭）+ 状态壳 |
| 权限组件 | `src/components/auth/Can.tsx` | 按钮级 `<Can>` 包裹，内部走 `canXxx` |
| 提示 | `src/hooks/useToast.ts` | 封装 sonner |
| Markdown 编辑器 | `src/components/editor/MarkdownEditor.tsx` / `src/hooks/useImageUpload.ts` / `src/api/attachments.ts` / `src/components/form/TagsField.tsx` | `@uiw/react-md-editor` v4 受控封装 + 粘贴/拖拽上传 + 标签 chip 输入 |
| 令牌 | `src/index.css` | `status-*` 语义令牌（draft/pending/published，明暗各一套） |

---

## 二、依赖选型理由（请总把控复核）

1. **Markdown 编辑器选 `@uiw/react-md-editor` v4，而非 TipTap**：TipTap v3 已移除 `@tiptap/extension-markdown`（markdown 序列化脆弱），且契约 `Article.content` 是纯 string（max 65535），不需要富文本 DOM。md-editor 是 CodeMirror6 真 Markdown 源文 + 实时预览，贴合文章系统。
2. **不引 `@tanstack/react-table`**：DataTable 自建列模型更轻、可控，react-table 零引用（第一轮审阅 P3-1 已确认移除，无残留）。
3. **预览 CSS 依赖显式化**：`@uiw/react-markdown-preview` 加为直接依赖，解决 pnpm 严格解析下 `markdown.css` 导入失败。

---

## 三、关键设计

- **DataTable 泛型绑定 `Page<T>`**：`data.list` 取行、`data.pagination` 取分页；刻意不接收 sort 当契约不支持时（评论模块用到）。
- **`<Can>` 组件**：`role`/`ownerId` 驱动显隐/禁用，纯展示层；真防线路由守卫 + 后端 `x-authz`。
- **MarkdownEditor 受控**：`value/onChange` 受控；粘贴/拖拽走 `POST /upload` 自动上传并插入 `![alt](url)`；`fileUrl()` 修正 `/files` 根路径。a11y：拖拽挂 `textareaProps` 而非静态 div（避 `noStaticElementInteractions`）。
- **状态色语义令牌**：`--status-*-{bg,fg}` + `@theme inline` 映射，暗色改深底亮字保对比度，组件只用令牌不硬编码。

---

## 四、运行方式

基础件为内部复用资产，无独立运行入口；随业务页（Phase 1+）经 `pnpm dev` 验证。

---

## 五、第一轮架构审阅整改（归口本批，评分 80→88）

审阅报告 `review/M2-前端代码第一轮审阅报告.md`，回复 `review/M2-第一轮审阅回复.md`。

| 项 | 整改 | 验证 |
|---|---|---|
| A-P2-2 开 `strict` | `tsconfig.app.json` 加 `"strict": true`，**0 错** | 哨兵文件验证 tsc 真拦 + `tsc --showConfig` 确认生效值 |
| P3-1 去死依赖 | 移除 `@tanstack/react-table` | `package.json` 全量无此包 |
| P3-2 chunk 瘦身 | `manualChunks` 拆编辑器 + alias `refractor/all`→41 语言集 | md-editor 1059.87→563.94kB（gzip 180.24）；jsx/tsx 补齐防高亮静默失效 |
| P3-3 状态色令牌 | `index.css` 抽 `status-*` | `ArticleListPage` 改 `bg-status-*` |
| P3-4 清 `_tmp_*` | `git rm` + `.gitignore _tmp_*` | `git ls-files | grep _tmp_` = NONE |
| P3-5 测试+CI | vitest 28 测试 / 5 文件 + `.github/workflows/manage-frontend-ci.yml`（只读 `biome check`） | 四门禁全绿 |

**owner 裁决**：md-editor 563.94kB 超 500kB 告警线 → 接受不改（文章系统必要项）；高亮 297→41 目视通过；Cookie 刷新分支 dev 无实测 → 上线前测试。

**固化成守卫的两处「静默失败」**：① `articles.test.ts` 反向断言 `data.items`/`data.total` 为 undefined；② `refresh.test.ts` 401 并发刷新去重（20ms 延迟撑开并发窗口）。
