# M2 Phase 4 · 用户管理（admin 专属）· 交付与 NOTES

> 批次：Phase 4（用户管理，admin 专属）｜日期：2026-08-29｜开发 AI 交付
> 验收门禁：typecheck 绿 ✅ / lint 绿 ✅（biome 自动修 5 处格式）/ **test 49 passed**（新增 4）✅ / build 绿 ✅

---

## 一、本批交付物

| 模块 | 文件 | 说明 |
|---|---|---|
| 用户 API | `src/api/users.ts` | listUsers / getUser / updateUser / adminResetPassword（按契约，非计划文档的 `/admin/users`） |
| 用户 Hooks | `src/hooks/useUsers.ts` | useUsers + useUpdateUser + useResetPassword；失效 `['users']` 缓存 |
| 用户列表页 | `src/pages/users/UserListPage.tsx` | 筛选(角色/状态/关键词) + 分页 + 角色/状态徽标 + 行操作 |
| 编辑弹窗 | `src/pages/users/UserEditDialog.tsx` | PATCH /users/{id} 改 role/status/level，含自锁保护 |
| 重置密码弹窗 | `src/pages/users/ResetPasswordDialog.tsx` | POST /admin/users/{id}/reset-password，输入新密码 |
| query key | `src/lib/queryClient.ts` | 加 `users.list(q)` |
| 语义令牌 | `src/index.css` | 加 `role-*`(admin/editor/member) 与 `user-status-*`(active/disabled) 明暗令牌 + 工具类 |
| 路由 | `src/router/index.tsx` | `/users` 由 PlaceholderPage 换 UserListPage（守卫 `canManageUsers` 已就位） |
| 守卫测试 | `src/api/users.test.ts`(4) | 钉死端点路径 + 分页结构 |

---

## 二、🔴 计划与契约偏差（按契约实现）

- **列表/详情/改角色路径**：计划 `M2-开发计划.md` §7 写 `GET/GET/PATCH /admin/users/{id}`，但契约里这三个端点在 **`/users` 下**（admin 鉴权，路径不含 admin）：
  - 列表 `GET /users`；详情 `GET /users/{id}`；改角色 `PATCH /users/{id}`。
  - 仅重置密码在 `POST /admin/users/{id}/reset-password`（路径带 admin）。
  - 实现以契约(openapi.v1.yaml:2849/2899/2948)为唯一真相，偏差已钉进 `users.test.ts`（防止后人照计划文档"修正"成 404）。
- **重置密码不是「一次性凭证」**：计划写「重置后返回一次性凭证（等宽加粗+自动复制）」；契约 `AdminResetPasswordRequest` **要求 admin 主动填 newPassword**（minLength 8），响应不返回凭证——新密码由 admin 线下告知用户。故 `ResetPasswordDialog` 是输入新密码，不是展示凭证。

---

## 三、关键设计 / 坑

- **自锁保护**：编辑弹窗读取当前登录 admin 的 id，若编辑的是**自己**，`disabled` 状态选项被禁用——禁用即无法登录/刷新，等于自锁后台。这是真实 footgun，前端显式拦掉。
- **角色三角语义**：member(普通会员) / editor(内容编辑) / admin(后台管理员)；`PATCH /users/{id}` 局部更新，role/status/level 全可选。member→editor 为晋升，admin 亦可降回 member。
- **等级（level）走 string 表单 + 提交转 number**：`z.coerce.number()` 会把输入类型推成 `unknown`，与 RHF `zodResolver` 泛型冲突；字段级 `.refine` 也会破坏 zodResolver 泛型推断——改用 `.regex(/^(?:[1-9]\d?|99)$/)` 校验 1~99（与 `CategoryFormDialog` 的 `.regex` 同法，可编译）。
- **徽标配色走语义令牌**：角色/状态不再硬编码调色板，沿用 Phase 2/3 引入的 `index.css` 明暗令牌纪律（`role-*` / `user-status-*`），暗色下自动「深底+亮字」。
- **分页/筛选范式复用**：`useTableQuery` 把 page/pageSize/role/status/keyword 同步进地址栏 searchParams；`TablePagination` + `DataTable` 与评论页同套。

---

## 四、运行方式

随 `pnpm dev` 访问 `/users`（仅 admin 菜单可见）；筛选/翻页/编辑/重置密码均走线上 API。
`pnpm test` 含 `users.test.ts`(4) 钉死端点路径与 `{ list, pagination }` 结构。

---

## 五、待总把控留意 / 回流项

- 仅 reset-password 走 `/admin` 前缀，其余用户端点在 `/users`；若后端改契约须同步前端（users.test.ts 会先爆）。
- 未做「用户详情独立页」：`getUser` 已封但未单独起页，列表行操作够用；如需详情页可后续补。
- 下一步：Phase 5 仪表盘（#18，替换探针）→ Phase 6 站点配置（#17）→ Phase 7 个人中心（#20）→ Phase 8 跨切面（#19）。
