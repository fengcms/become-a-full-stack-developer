# M1 后端 · 批次 B7：辅助接口 / 站点（Aux & Site）

> 依赖 B2、B3。收尾批次：文章辅助查询、全站统计、搜索、站点设置。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/07-aux-site.md，实现辅助接口与站点批次（收尾）。
实现契约 /api/v1/articles/{id}/adjacent、/related、/toc、/api/v1/stats、/api/v1/search、
/api/v1/site/settings、/api/v1/admin/site/settings 的全部 8 个端点。
重点：adjacent/related/toc 基于已发布文章；site/settings 公开读、admin 写。完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET /api/v1/articles/{id}/adjacent` → 上一篇/下一篇（按发布时间，仅 published）
- `GET /api/v1/articles/{id}/related` → 相关文章（同分类/同标签，仅 published）
- `GET /api/v1/articles/{id}/toc` → 目录（解析 Markdown 标题生成）
- `GET /api/v1/stats` → 全站统计（文章数/评论数/用户数等）
- `GET /api/v1/search` → 关键词搜索（仅 published 文章）
- `GET /api/v1/site/settings` → 站点设置（公开）
- `GET /api/v1/admin/site/settings` → 站点设置（admin 读）
- `PATCH /api/v1/admin/site/settings` → 更新站点设置（admin 写）

## 关键行为指引
- **adjacent/related/toc** 仅对 `published` 文章有效；匿名访问未发布文章的相关接口返回 404（与公开可见性铁律一致）。
- **toc**：解析 `content`（Markdown）的标题层级生成目录树；纯展示，勿改动原文。
- **search**：在 published 文章标题/摘要/正文中做关键词匹配，分页返回；不要求全文检索引擎，LIKE 或简单匹配即可（写 NOTES 说明取舍）。
- **SiteSetting 字段**（02 §二）：`siteName`/`siteTitle`/`siteDescription`/`siteKeywords`/`logoUrl`/`copyright`/`updatedAt`。公开 `GET /site/settings`；`GET+PATCH /admin/site/settings` 仅 admin。
- 本批完成后，M1 后端契约覆盖即告一段落。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：adjacent 取对上下篇、related 命中同分类、toc 解析正确、stats 数值合理、search 命中/未命中、site/settings 公开可读、admin 可改、匿名改 403。
3. 逐端点核对响应与契约一致。
4. **全量回归**：本批结束后跑一遍 `npm test`，确认 B0~B7 全部绿（收尾回归）。

## 禁止项
- 不改契约；不新增 error.code。

## 交付物
- `src/routes/site.ts` + 辅助查询逻辑（adjacent/related/toc/search）+ schema 的 `site_settings` 表。
- 一个 commit：`M1 B7 辅助接口与站点端点 + 测试`。
- NOTES：search 实现取舍、toc 解析边界。

---

## B7 完成后
通知总把控（我）做全量验收：跑 `tsc --noEmit` + `vitest run` 全绿、抽查契约一致性核查表、读所有批次 NOTES。
无误 → M1 后端代码冻结，进入"写 M1 后端文章"阶段（由总把控执笔，以验证过的代码为素材）。
