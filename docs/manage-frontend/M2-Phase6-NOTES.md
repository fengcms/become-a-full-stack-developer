# M2 前端 · Phase 6 站点配置 · 交付 NOTES

> 时间：2026-08-29（续 Phase 5 之后）。
> 范围：admin 专属的站点设置（名称/标题/描述/关键词/Logo/版权）。
> 配合文档：`docs/manage-frontend/M2-开发计划.md` 的 Phase 6（#17）、`docs/api/openapi.v1.yaml` 的 `/admin/site/settings`。

## 一、交付物

| 文件 | 作用 |
|---|---|
| `src/pages/site/SiteSettingsPage.tsx` | 站点设置页：拉 `GET /admin/site/settings` 回填表单，`PATCH /admin/site/settings` 局部更新 |
| `src/components/form/LogoUploadField.tsx` | 自建 Logo 上传字段（替代计划中未实现的 F0.2 `ImageUploadField`）：受控 + 选图即传 `POST /upload` 拿 URL 回填 `logoUrl` |
| `src/router/index.tsx` | `/settings/site` 占位页替换为 `SiteSettingsPage`（守卫保留 `canManageSiteSettings`） |
| `src/api/site.test.ts`（+2） | 钉死 `getAdminSiteSettings→/admin/site/settings`、`updateSiteSettings→PATCH` 同路径 |
| `src/lib/queryClient.ts` | 沿用既有 `qk.site.adminSettings` 缓存键（Phase 5 已建） |

## 二、选型理由

- **F0.2 `ImageUploadField` 在基座阶段并未真正落地**（grep 全仓只命中 `useImageUpload` hook，无组件）。计划 Phase 6 把它当"已有组件"用，是计划与实现的偏差。我没有回头补 F0.2 的通用版本（超出本阶段范围），而是自建**最小够用的 `LogoUploadField`**：受控（`useController` 驱动，与 `TextField`/`TextAreaField` 同范式）、复用 `useImageUpload`（`POST /upload`，支持无 `articleId` 的游离附件）。后续若别的页要图片上传，再把它泛化为 F0.2。
- **端点严格按契约**：`GET /admin/site/settings` 与公开的 `GET /site/settings` 是两条路（后者不含 `admin` 段，且公开版字段更窄）。本阶段只碰 admin 端点，`site.ts` 在基座阶段已封好路径正确。
- **编辑即传全量可选字段**：契约 `SiteSettingUpdate` 全字段可选（PATCH 局部更新语义），提交时只传页面上这 6 个字段，未改动字段随表单当前值一并提交——幂等且不会误清空（表单回填时已用原值，用户没改就是原值）。

## 三、关键设计

- **权限判定是函数式，不是布尔**：`lib/permission.ts` 的 `canXxx` 全是 `(actor: Actor) => boolean`。页面内必须从 `useAuthStore((s) => s.user)` 取当前 actor，再 `const canSite = canManageSiteSettings(user)` 得到布尔用于 `useQuery` 的 `enabled`。直接写 `enabled: canManageSiteSettings` 会 TS 报错（函数不能当布尔）——这是 Phase 6 第一版踩的坑，已改。
- **表单回填避免空串覆盖未设字段**：`useEffect` 在 `settings.data` 到手后 `form.reset(toFormValues(data))`，未设字段兜底 `''`。这样保存时传的是"原值或用户改动"，不会把后端未设字段写成 `null`/`undefined` 触发契约校验。
- **Logo 两步落库**：`LogoUploadField` 只负责"选图→上传→回填 `logoUrl` 字符串"，不碰后端；真正的写库由本页 `PATCH` 统一提交（契约要求 `logoUrl` 必须是已上传的可访问地址）。
- **重置按钮**：重置回「最近一次拉取的原值」（`toFormValues(settings.data)`），而非清空，避免误丢未改动字段。

## 四、运行方式（门禁）

```bash
cd manage-frontend
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- typecheck：`tsc -b --noEmit` 通过（0 错）。
- lint：`biome check --write .` 通过；CI 只读 `biome check .` 视角 `EXIT=0`。
- test：**53 passed**（较 Phase 5 的 51 +4，来自 `site.test.ts` 新增的 admin 端点守卫）。
- build：通过；仅 `md-editor` 563.94 kB 告警（owner 已裁决接受，不处理）。
- 本地验证：`pnpm dev` → 登录 admin → 侧栏「站点设置」→ 改名称/换 Logo → 保存，网络面板应见 `PATCH /api/v1/admin/site/settings`。

## 五、待留意

- 🔴 **R4 风险不在本阶段**：契约公开 `GET /site/settings` 在旧后端会返回 5000（见契约校验清单 R4），属后端修复范围。前端本阶段只碰 admin 端点，未触碰公开版；上线前需确认后端已修，否则前台页头取品牌信息仍可能 5000。
- **F0.2 仍悬空**：`LogoUploadField` 是站点设置专用的最小实现，不是计划里设想的通用 `ImageUploadField`。若后续文章封面/用户头像也要图片上传，应把它泛化为 `ImageUploadField`（支持 `accept`/`articleId` 参数）并补通用测试，避免重复造轮子。
- **站点设置字段是子集**：契约 `SiteSetting` 可能还有 `icp`/`contactEmail`/`footerScript` 等字段（公开版更窄），本阶段只暴露计划列的 6 个高频字段。若运营需要icp备案号等，再扩表单 + PATCH 字段。
- 门禁假绿防范：本阶段照例用契约守卫测试钉死 admin 端点路径与方法，防止后人照计划文档把 `GET /admin/site/settings` 误改成 `/site/settings`（后者是公开版，admin 调会 401/404）。
