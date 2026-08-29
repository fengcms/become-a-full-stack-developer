# M2 Phase 3 · 分类树 + 标签模块 · 交付与 NOTES

> 批次：Phase 3（分类树 + 标签，任务卡 #13）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint 绿 ✅ / **test 45 passed**（新增 12）✅ / build 绿 ✅

---

## 一、本批交付物

| 模块 | 文件 | 说明 |
|---|---|---|
| 标签 API | `src/api/tags.ts` | CRUD（**无 merge 端点**，见 §2） |
| 标签 Hooks | `src/hooks/useTags.ts` | RQ 封装 |
| 分类 API | `src/api/categories.ts` | 扩 CRUD + 导出 `CATEGORY_MAX_DEPTH = 4` |
| 分类 Hooks | `src/hooks/useCategories.ts` | 扩 3 mutation |
| 分类树页 | `src/pages/categories/{CategoryTreePage,CategoryNodeRow,CategoryFormDialog,categoryTree}.tsx` | 树渲染 + 行 + 表单 + 纯函数 |
| 分类树纯函数 | `src/pages/categories/categoryTree.ts` | `buildParentMap` / `collectSubtreeIds`（见 §3 坑） |
| 标签页 | `src/pages/tags/{TagListPage,TagFormDialog}.tsx` | 列表 + 表单 |
| 路由 | `src/router/index.tsx` | `/categories`、`/tags` 占位换真实页 |
| 守卫测试 | `src/pages/categories/categoryTree.test.ts`(8) / `src/api/tags.test.ts`(4) | 纯函数 + 标签约束 |

---

## 二、🔴 计划与契约偏差（按契约实现）

- **标签「合并」端点不存在**：`M2-开发计划.md` §6 提标签「新建/合并/删除」，但契约**无 merge 端点**（全仓 grep 无果）。→ 合并不做，已写进 `src/api/tags.ts` 文件头 + 页面注释「须先改契约再改实现」。
- 其余端点（`GET/POST/PUT/DELETE /tags/{id}`、`GET/POST/PUT/DELETE /categories/{id}`、`GET /categories/tree`）与契约一致。

---

## 三、🔴 关键坑（契约缺口，前端兜底）

- **`CategoryNode` schema 无 `parentId` 字段**：父子关系靠 `children` 嵌套表达（树结构设计如此，非字段缺失）。编辑子分类时若漏传 parentId，历史上后端会把子分类**静默挪到根**——这是早期的真实 bug（P3 开发时按「全量替换」假设兜底）。
  - 🔧 **后端已修（node-backend-v1.0.1）**：`PUT /categories/{id}` 现为**局部更新**（openapi.v1.yaml:1541-1542），省略 parentId / description / sortOrder 保留原值，不再静默挪根。详见 `docs/prd/M2-后端契约校验清单-前端自检.md` R1。
  - 前端双保险：抽纯函数 `buildParentMap(tree)` 从树反推 `id → parentId`，编辑表单**始终显式回传** parentId（见 `categoryTree.ts` 头注释 + `CategoryFormDialog` 提交逻辑）。即便后端语义回退也不踩坑。
  - 成环防护：`collectSubtreeIds(node)` 收集自身+子孙，编辑时从父级候选排除（后端 PUT 校验环返 409/3002，但不该让用户先提交再吃瘪）。
- **三条硬约束前置到 UI**（不点了才吃 409）：
  - `Category.x-max-depth: 4` → 深度达 4 的节点「新建子分类」按钮禁用。
  - `DELETE /categories/{id}` 须**无子分类且无文章**、**不级联** → 有子节点的行删除按钮禁用并提示先迁移。
  - `DELETE /tags/{id}` 须无文章引用 → `articleCount > 0` 的标签删除按钮禁用。

---

## 四、运行方式

随 `pnpm dev` 访问 `/categories`（树）、`/tags`（列表）；`pnpm test` 含 `categoryTree.test.ts`(8) + `tags.test.ts`(4)。

---

## 五、待总把控留意 / 回流项

- 未改动契约；标签合并（无 merge 端点）已记文件头/注释，待契约层决策。
  `CategoryNode.parentId` 不再是缺口——后端 PUT 已修为局部更新，前端亦显式回传 parentId 双保险。
- 下一步：Phase 4 用户管理（#16）→ Phase 5 仪表盘（#18）→ Phase 6 站点配置（#17）→ Phase 7 个人中心（#20）→ Phase 8 跨切面（#19）。
