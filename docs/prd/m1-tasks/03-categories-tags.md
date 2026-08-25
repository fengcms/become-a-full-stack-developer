# M1 后端 · 批次 B3：分类 / 标签（Categories & Tags）

> 依赖 B1。分类为无限级树，标签为扁平集合。两者都是文章的元数据支撑。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/03-categories-tags.md，实现分类与标签批次。
实现契约 /api/v1/categories* 与 /api/v1/tags* 的全部 11 个端点。
重点：分类树递归构建（环检测按 §2.2 合理实现并登记 NOTES）、标签 articleCount 计数。
完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET    /api/v1/categories` → 列表（公开）
- `POST   /api/v1/categories` → 创建（admin；含 parentId 支持无限级）
- `PUT    /api/v1/categories/{id}` → 更新（admin）
- `DELETE /api/v1/categories/{id}` → 删除（admin；考虑子节点处理策略）
- `GET    /api/v1/categories/tree` → 无限级树（递归）
- `GET    /api/v1/categories/{id}/breadcrumb` → 祖先路径
- `GET    /api/v1/categories/stats` → 各分类文章计数
- `GET    /api/v1/tags` → 列表（含 `articleCount`，公开）
- `POST   /api/v1/tags` → 创建（admin/editor）
- `PUT    /api/v1/tags/{id}` → 更新（admin/editor）
- `DELETE /api/v1/tags/{id}` → 删除（admin/editor）

## 关键行为指引
- **分类树（§2.2 留契约外）**：`tree` 端点由 `parentId` 递归组装；**环检测**在本批合理实现（如构建时检测 parent 链成环则拒绝/截断），并**在 NOTES 登记算法**，后续由对应后端文章 PRD 层确认。不要过度下沉算法。
- **标签计数**：`Tag.articleCount` 由文章-标签关联实时/定时聚合；列表返回（契约已含此字段）。
- 写操作授权：分类写 = admin；标签写 = editor/admin（对齐角色三角）。
- 删除分类时的子节点策略（级联/拒删/置顶）选一种合理方案写 NOTES。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：建多级分类→tree 正确递归→breadcrumb 正确；删分类策略；标签 articleCount 正确；未授权写操作得 403。
3. 逐端点核对响应与契约一致。

## 禁止项
- 不改契约；不新增 error.code。
- 不在本批实现文章归属的提交逻辑（属 B2/B4）。

## 交付物
- `src/routes/categories.ts` + `src/routes/tags.ts` + schema 的 `categories`/`tags`/`article_tags` 表。
- 一个 commit：`M1 B3 分类标签端点 + 测试`。
- NOTES：树环检测实现、删除分类策略、articleCount 聚合方式。
