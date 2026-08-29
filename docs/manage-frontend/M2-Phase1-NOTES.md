# M2 Phase 1 · 文章管理模块 · 交付与 NOTES

> 批次：Phase 1（文章管理，任务卡 #15）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint 绿 ✅ / build 绿 ✅

---

## 一、本批交付物

| 模块 | 文件 | 说明 |
|---|---|---|
| 文章 API | `src/api/articles.ts`（骨架路径已对齐契约）/ `src/api/categories.ts`（`GET /categories/tree`） | 端点严格对齐 v1.11.0 |
| 文章 Hooks | `src/hooks/useArticles.ts`（useAdminArticles / useArticle / useCreateArticle / useUpdateArticle / useDeleteArticle / useApproveArticle / useSetArticleStatus） | RQ 封装，写后失效 `['articles']` |
| 分类 Hooks | `src/hooks/useCategories.ts` | 树加载 |
| 标签输入 | `src/components/form/TagsField.tsx` | chip 输入（F0.5 已建） |
| 列表页 | `src/pages/articles/ArticleListPage.tsx` | DataTable + 筛选 + 分页 + 过审/删除确认 |
| 表单页 | `src/pages/articles/ArticleFormPage.tsx` | RHF + Zod + MarkdownEditor；编辑态 `GET /articles/{id}` 预填 |
| 路由 | `src/router/index.tsx` | `/articles`、`/articles/new`、`/articles/:id/edit` |
| 守卫测试 | `src/api/articles.test.ts` | 5 用例（含分页 `list` 反向断言） |

---

## 二、端点对齐（契约 v1.11.0 为唯一真相）

| 操作 | 端点 | 角色 |
|---|---|---|
| 列表（后台） | `GET /admin/articles` | editor+ |
| 创建 | `POST /articles` | member+ |
| 更新 | `PUT /articles/{id}`（**非 PATCH**） | editor 或作者 |
| 软删 | `DELETE /articles/{id}` | editor 或作者 |
| 过审 | `POST /admin/articles/{id}/approve`（pending→published） | admin |
| 强改状态 | `POST /admin/articles/{id}/status` | admin |

> 注意：`PUT /articles/{id}` 是契约既定（非 PATCH），无偏离。

---

## 三、关键设计

- **分页取数铁律**：`data.list` + `data.pagination.{page,pageSize,total,totalPages}`，**不用 `data.items`**（`articles.test.ts` 反向断言 `items`/`total` 为 undefined 防静默空白）。
- **状态机在 UI 前置**：过审/强改走独立按钮与 `status` 选择；`approved`/`rejected` 视觉用 `status-*` 令牌（Phase 0 已抽）。
- **MarkdownEditor 懒加载**：`ArticleFormPage` 仅编辑页一次加载，chunk 独立（`manualChunks` 拆 md-editor）。

---

## 四、运行方式

随 `pnpm dev` 访问 `/articles` 列表、`/articles/new` 新建、`/articles/:id/edit` 编辑；门禁 `pnpm test` 含 `articles.test.ts`。

---

## 五、待总把控留意 / 回流项

- 未改动契约。
- 体积告警（md-editor 563.94kB）owner 已裁决接受不改（见 Phase 0 NOTES）。
- 下一阶段：Phase 2 评论审核（#14）。
