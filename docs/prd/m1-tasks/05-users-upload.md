# M1 后端 · 批次 B5：用户 / 资料 / 上传（Users, Profile, Upload）

> 依赖 B1。覆盖用户管理、个人资料、密码、文件上传与附件。

## 直接给开发 AI 的提示词（复制即可）
```
阅读主计划 + docs/prd/m1-tasks/05-users-upload.md，实现用户/资料/上传批次。
实现契约 /api/v1/members/{id}、/api/v1/users*、/api/v1/me/profile、/api/v1/me/change-password、
/api/v1/admin/users/{id}/reset-password、/api/v1/upload、/api/v1/me/attachments、/api/v1/attachments/{id} 的全部 11 个端点。
重点：角色提升（member→editor，admin 经 PATCH /users/{id}）、StorageProvider 双存储（R2 主/本地兜底）。
完成后门禁全绿、逐端点核对契约。
```

## 本批端点清单（以契约为准）
- `GET    /api/v1/members/{id}` → 公开资料（脱敏：不返密码/邮箱等敏感字段）
- `GET    /api/v1/users` → 用户列表（admin，分页）
- `GET    /api/v1/users/{id}` → 用户详情（admin）
- `PATCH  /api/v1/users/{id}` → 更新（admin；含 `role` 提升 member→editor）
- `POST   /api/v1/admin/users/{id}/reset-password` → 管理员重置密码（admin）
- `GET    /api/v1/me/profile` → 当前用户资料（含敏感字段）
- `PATCH  /api/v1/me/profile` → 更新自身资料
- `POST   /api/v1/me/change-password` → 改密码（校验旧密码）
- `POST   /api/v1/upload` → 上传文件（登录；走 StorageProvider）
- `GET    /api/v1/me/attachments` → 我的附件列表
- `DELETE /api/v1/attachments/{id}` → 删附件（owner 或 admin）

## 关键行为指引
- **角色提升**：注册默认 `member`；admin 经 `PATCH /users/{id}`（改 `role` 字段）升 `editor`；`editor` 管全站内容不管用户/角色/站点配置；`level` 仅展示（不要当权限用）。
- **上传双存储（适配层）**：`POST /upload` 调 `StorageProvider.put()`，由 `STORAGE_DRIVER=r2|local` 决定落 R2 还是本地磁盘；返回可访问 URL + 写入 `attachments` 表（owner=当前用户）。R2 主、本地兜底（见主计划 §一）。
- 公开资料脱敏：对外 `members/{id}` 不返回 `passwordHash`/`email` 等；`me/profile` 可返回。
- 改密码：校验旧密码正确再更新哈希。

## 验收门禁
1. `typecheck` + `test` 绿。
2. 用例覆盖：admin 提升 member→editor、普通用户改自己资料、未授权改他人 403、change-password 旧密码错失败、upload 返回 URL 且可再查到、删他人附件 403。
3. 逐端点核对响应与契约一致。

## 禁止项
- 不改契约；不新增 error.code。
- 不在此批实现收藏/历史/通知（属 B6）。

## 交付物
- `src/routes/users.ts` + `src/routes/upload.ts` + schema 的 `attachments` 表。
- 一个 commit：`M1 B5 用户资料上传端点 + 测试`。
- NOTES：脱敏字段清单、STORAGE_DRIVER 本地兜底路径策略。
