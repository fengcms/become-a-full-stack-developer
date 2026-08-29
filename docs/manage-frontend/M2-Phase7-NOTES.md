# M2 Phase 7 · 个人中心 · 交付 NOTES

> 状态：已交付，四门门禁全绿（test 62 passed，较 Phase6 的 53 +9）。
> 审阅背景：第四轮审阅（Phase4+5+6）综合 90/100 无阻塞，明确「可推进 Phase 7 个人中心 / Phase 8 跨切面」。
> 本批对应 `docs/manage-frontend/M2-开发计划.md` §10 Phase 7。

## 一、交付物清单

**API 层**
- `src/api/me.ts`：`getMyProfile` / `updateMyProfile`(PATCH) / `changePassword` / `listMyLikes` / `listMyFavorites` / `addFavorite` / `removeFavorite`
- `src/api/notify.ts`：`listMyNotifications` / `getUnreadCount` / `readAllNotifications` / `markNotificationRead`

**Hooks**
- `src/hooks/useMe.ts`：`useMyProfile` / `useUpdateProfile` / `useChangePassword` / `useLikes` / `useFavorites` / `useToggleFavorite`
- `src/hooks/useNotifications.ts`：`useNotifications` / `useUnreadCount`(refetchInterval 60s) / `useNotificationActions`(readAll+markRead)

**页面（个人中心二级路由，挂在 `/profile` 下）**
- `src/pages/profile/ProfileLayout.tsx`：左侧二级导航 + `<Outlet/>`
- `src/pages/profile/ProfilePage.tsx`：资料编辑（昵称/头像/邮箱）+ 只读用户名
- `src/pages/profile/ChangePasswordPage.tsx`：改密码（旧密码校验 + 新密码 ≥8 + 二次确认）
- `src/pages/profile/NotificationsPage.tsx`：通知列表 + 全部已读 + 单条已读
- `src/pages/profile/LikesPage.tsx`：我的点赞（裸数组）
- `src/pages/profile/FavoritesPage.tsx`：我的收藏（分页 + 取消收藏）

**跨文件改动**
- `src/components/form/ImageUploadField.tsx`：由 Phase6 `LogoUploadField` **泛化**而来（新增 `accept` / `shape` 可选 prop）
- `src/pages/site/SiteSettingsPage.tsx`：改用 `ImageUploadField`（删 `LogoUploadField.tsx`）
- `src/layouts/Topbar.tsx`：用户菜单加**通知铃铛 + 未读红点**（轻轮询 `useUnreadCount`）
- `src/router/index.tsx`：`/profile` `/profile/password` 占位页换成 `ProfileLayout` 嵌套路由树（5 个二级页）
- `src/lib/queryClient.ts`：加 `me.profile/likes/favorites` + `notifications.list/unreadCount` 键
- `src/api/me.test.ts`(5) / `src/api/notify.test.ts`(4)：契约守卫（钉死端点路径 + 信封/data 形状）

## 二、选型与决策理由

- **路由结构**：`/profile` 套 `RequireAuth` + `ProfileLayout`（导航 + Outlet），五个二级页（资料/密码/通知/点赞/收藏）走 `index`/`password`/`notifications`/`likes`/`favorites`。member 即可访问，无需 `<RequireCan>`（member 是登录下限）。
- **未读红点 = 轻轮询而非 WebSocket**：契约未提供推送通道；`useUnreadCount` 用 `refetchInterval: 60_000` + `staleTime: 60_000` 拉 `/me/notifications/unread-count`，简单可靠，上线前无需后端改动。
- **头像上传 = F0.2 泛化触发点**：第四轮审阅 R-留意明确指出「LogoUploadField 是首个场景，出现头像（第二个）就该泛化为通用件」。个人资料头像正是第二个场景 → 把 `LogoUploadField` 泛化为 `ImageUploadField`（`shape: 'circle' | 'square'`、`accept` 可选），站点设置与个人资料共用，删除旧文件避免重复造轮子。
- **点赞/收藏交互**：收藏走 `useToggleFavorite`（取消即 `removeFavorite` 幂等）；点赞为只读列表（无取消端点）。
- **反馈纪律**：`useUpdateProfile` / `useChangePassword` 已统一 toast，页面层不重复提示（避免双 toast）。
- **用户名只读**：`User.username` 是登录名不可改，页面仅静态展示（disabled Input），不进 RHF。

## 三、🔴 关键坑 / 契约偏差（已正确处理）

1. **R5 契约内部矛盾：`/me/likes` 返回裸数组，非分页**——计划 §10 与路线图写「`GET /me/likes` 取 Top N（page）」，但契约 `openapi.v1.yaml:3612` 实际 `data: type: array`（裸 `ArticleSummary[]`，**无 `list/pagination`**，`R5` 已登记后端「契约维护批次」）。前端按数组消费，`me.test.ts` 反向断言 `data` 既非 `{list}` 也非 `{pagination}`，防后人照计划「修正」成 `data.list` 静默空白。
2. **评论排序偏差同类**：`/me/notifications` 支持 `isRead` 筛选 + 分页，`unread-count` 是独立轻端点 `/me/notifications/unread-count`（路径自身含该子串，断言靠 `/me/notifications/unread-count` 全串匹配区分，不踩 `not.toContain` 坑）。
3. **头像/Logo 上传先传后存**：`ImageUploadField` 只负责「选图→`POST /upload`→回填 URL」，落库由父表单 PATCH 统一完成（契约要求先上传拿可访问地址）。

## 四、运行 / 联调方式

```bash
cd manage-frontend
pnpm typecheck   # tsc -b --noEmit（strict）
pnpm lint        # biome check --write
pnpm test        # vitest（62 passed，含 me/notify 契约守卫）
pnpm build       # tsc -b && vite build
```

联调（dev 走 Vite 同源代理，方案 B）：登录后点右上角用户菜单 → 个人资料 / 修改密码；点铃铛进通知页；个人中心左侧导航切资料/密码/通知/点赞/收藏。

## 五、待留意 / 后续

- 上线前 checklist（第四轮 R4 续）：公开 `GET /site/settings` 仍可能 5000 属后端修复项，本端未触碰，需确认后端已修（影响前台页头品牌区，不影响本批个人中心）。
- 组件/E2E 测试（第四轮 R4-工）：本批仍无 jsdom 组件测试 / Playwright E2E，纯逻辑与契约守卫已覆盖；规模爬坡时补「资料提交 / 通知已读」组件测试。
- 下一轮：**Phase 8 跨切面**（M2-13 构建优化 / M2-14 部署 / M2-15 复盘文档），按计划在个人中心之后收尾。

> 原则重申：本批只动前端代码与文档，未改冻结契约；端点以 `openapi.v1.yaml` v1.11.0 为唯一真相。文档未 git commit（owner 自管）。
