# M1 后端 · 批次 B5：用户 / 资料 / 上传 实现笔记

> 依赖 B1（鉴权）。覆盖用户管理、个人资料、密码、文件上传与附件（11 端点）。
> 门禁：tsc 0 / biome 0 / vitest 104 passed（含 B5 14 例）/ 契约双门 OK（openapi.v1.yaml 未改动）。

## 一、端点清单（11 端点 → 实现文件）

| 方法 & 路径 | 授权（x-authz） | 契约 operationId | 实现文件 |
|---|---|---|---|
| `GET /api/v1/members/{id}` | 公开（security: []，disabled→404） | getMemberProfile | `routes/members.ts` |
| `GET /api/v1/users` | admin | listUsers | `routes/users.ts` |
| `GET /api/v1/users/{id}` | admin | getUser | `routes/users.ts` |
| `PATCH /api/v1/users/{id}` | admin（role/status/level） | updateUser | `routes/users.ts` |
| `POST /api/v1/admin/users/{id}/reset-password` | admin | adminResetPassword | `routes/users-admin.ts` |
| `GET /api/v1/me/profile` | member | getMyProfile | `routes/me.ts` |
| `PATCH /api/v1/me/profile` | member | updateMyProfile | `routes/me.ts` |
| `POST /api/v1/me/change-password` | member | changePassword | `routes/me.ts` |
| `POST /api/v1/upload` | member | uploadFile | `routes/upload.ts` |
| `GET /api/v1/me/attachments` | member | listMyAttachments | `routes/upload.ts` |
| `DELETE /api/v1/attachments/{id}` | editor + ownerOverride（userId） | deleteAttachment | `routes/upload.ts` |

挂载：`app.ts` 同挂 `usersRoute@/api/v1/users`、`usersAdminRoute@/api/v1/admin/users`、
`meRoute@/api/v1/me`、`membersRoute@/api/v1/members`、`uploadRoute@/api/v1`、`filesRoute@/files`（本地直出）。
行数（铁律 ≤200）：users 116 / users-admin 47 / me 119 / members 37 / upload 150 / attachment(lib) 61 / files 52（新增）。

## 二、关键设计

### 1. 角色三角（minRole 守住边界）
- 注册默认 `member`；`admin` 经 `PATCH /users/{id}`（`role` 字段）升 `editor` / 重置 `member` / 升 `admin`。
- `editor` 不可管用户/角色/站点配置：用户管理批次全部端点 `guard('admin')`，editor 自然被拒（与 §3.3 一致）。
- `level` 仅展示（无业务权限语义），admin 可改。

### 2. 脱敏字段清单（公开 vs 私有）
- **公开 `GET /members/{id}`**（MemberProfile）：仅 `id / nickname / avatar / level / articleCount / articles[published]`。
  绝不外泄：`passwordHash`、`email`、`role`、`status`、`createdAt`。
- **私有 `GET /me/profile` / admin `GET /users`**：返回完整 `User`（含 `email`，admin/本人可见；`role`/`status` 仅 admin 列表/详情可见）。
- `disabled` 会员公开主页返回 404（等同不存在，防账号枚举）；但其已发布文章保留（内容下架走文章状态机，与账号状态解耦）。

### 3. 上传双存储（适配层，STORAGE_DRIVER 驱动）
- `POST /upload` → `createStorage(getActiveEnv())` → `storage.put(buffer, ext)`。
- **STORAGE_DRIVER 本地兜底路径策略**：`local` 实现 `LocalStorage` 落 `./uploads`，对外 url = `/files/{key}`（`key=randomUUID()+ext`）；
  R2 主存储在 Node 开发/测试中 `createStorage` 直接抛错（与 `storage.ts` 既有裁定 D10 一致，R2 绑定待生产注入，B10 deferred）。
- 落 `attachments` 表：`storage` 字段记录**本次实际使用的后端**（r2/local），`storageKey` 为底层内部 key（**不**进响应，仅用于删除定位）。
- 文件校验在信任边界（multipart 无 JSON schema）：`ACCEPTED` 类型白名单（png/jpeg/gif/webp/svg+xml/pdf）+ `MAX_BYTES=10MB`，不合法 → 400 code 4001（`data.errors=[{field:'file',...}]`）。
- `articleId` 可选，从表单 `articleId` 字段写入（编辑器内上传关联文章场景）。

### 4. 删除附件（ownerOverride + 双存储真实边界）
- `guard('editor', resolveAttachmentOwner)`：editor/admin 直接放行（roleOk）；member 须 `userId === 本人`。
- 删除：先查行（取其 storageKey）→ `db.delete().run()` → `res.changes===0` 兜底 404；
  底层 `storage.delete(key)` 尽力执行，失败仅 catch 记日志、**不阻塞行删除**（双存储适配层真实边界，M1-24 题材）。
- 缺失附件：resolveAttachmentOwner 抛 404（member 路径）；editor/admin 路径由 changes 兜底 404。

### 5. 密码相关
- `change-password`：校验旧密码（`verifyPassword`）→ `hashPassword` 更新 → `revokeUserTokens` 强制重登；
  旧密码错 → 400 code 4001（`data.errors=[{field:'oldPassword',message:'旧密码错误'}]`）。
- `admin/users/{id}/reset-password`：管理员重置 → `revokeUserTokens`（忘记密码唯一兜底，v1 无邮件找回）。
- 二者均复用 `lib/password.ts` 的 bcrypt 封装，哈希不可逆。

## 三、文件清单
- 新增：`src/db/schema.ts`（attachments 表 + AttachmentRow）、`src/db/migrate.ts`（attachments DDL）、
  `src/lib/attachment.ts`（toAttachment + 我的附件分页）、`src/routes/users.ts`、`src/routes/users-admin.ts`、
  `src/routes/me.ts`、`src/routes/members.ts`、`src/routes/upload.ts`、`src/routes/files.ts`（本地 /files 直出）、
  `test/routes/users.test.ts`（18 例）。
- 改动：`src/app.ts`（挂载 6 条路由含 `filesRoute@/files`）、新增 `node-backend/.gitignore`（`/uploads/` 本地存储副作用不入库）。
- 未动：articles 系列、categories、tags、comments（严格守 B5 边界，不碰其他批次）。

## 七、B5 审阅 P3 整改（用户要求优化后补）

审阅报告 `review/B5-后端代码审阅报告.md` 裁定放行，并给出 5 项 P3 非阻塞观察。用户要求逐项优化，均已真修：

- **P3-1（本地 /files 静态路由）**：新增 `src/routes/files.ts`（52 行），仅当 `STORAGE_DRIVER==='local'` 时直出 `./uploads/{key}`，带 `SAFE_KEY` 路径穿越防护；`app.ts` 挂载 `app.route('/files', filesRoute)`。生产（R2+CDN）因 `STORAGE_DRIVER!=='local'` 直接 404 不服务。本地开发预览上传素材不再 404。
- **P3-2（成员文章列表分页）**：`members.ts` 弃用 `.all()` 全量拉取，改为复用 `queryArticles({ c, authorId: id, forcedStatus: 'published' })`（与公开列表一致的 page/sort），`articleCount` 取分页 `total`；响应体积随分页上限而非文章总数增长。
- **P3-3（upload 重复 parseBody）**：`parseUpload` 一次 `parseBody` 同时解析 `file` 与 `articleId` 并一并返回，删除 POST handler 内第二次 `parseBody` 调用；顺带改用 `form.file`/`form.articleId` 点号访问消除 biome info。
- **P3-4（用户管理护栏）**：`PATCH /users/{id}` 增加两道护栏——① 自我护栏：admin 对自身做 role/status 变更时返回 403（FORBIDDEN），防自我降级/封禁锁死；② 最后 admin 保护：当被操作者是 admin 且本次将失去 admin 或遭禁用时，若活跃 admin 仅剩 1 名则 409（CONFLICT）拒绝。测试覆盖「自我变更 403」「双 admin 降级另一位 200」。
- **P3-5（SVG XSS 缓解）**：`files.ts` 对 `image/svg+xml` 强制 `Content-Disposition: attachment` 并统一加 `X-Content-Type-Options: nosniff`，杜绝 SVG 内联脚本 XSS；CDN 侧最终策略仍由生产配置决定（本批仅补本地直出路径的缓解）。

> 门禁：整改后 tsc 0 / biome 0 / vitest **108 passed**（B5 行为级 18 例 + 存量 90）/ 契约双门 OK / 契约未改。详见 `review/B5-代码审阅-回复.md`。

## 四、门禁证据（自跑，含 P3 整改后复验）
| 门禁 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 0 error |
| `biome check .` | ✅ 0 error / 0 warning / 0 info（70 文件） |
| `vitest run` | ✅ 108 passed（15 文件；B5 行为级 18 例，P3 整改新增 4 例） |
| 契约结构门 `openapi-spec-validator` | ✅ `openapi.v1.yaml: OK` |
| 契约语义门 `check_contract.py` | ✅ 全部通过（未改动契约） |
| 契约改动 | ✅ 未触碰 `openapi.v1.yaml`（`git status` 干净） |

## 五、假设与待确认
- 用户列表 `keyword` 匹配 `username / displayName / email` 子串（按契约描述）。
- `GET /members/{id}` 文章列表取该会员 `published` 文章（page 1 默认 pageSize 20，与公开列表一致）。
- 测试用本地 `STORAGE_DRIVER=local` 会在 `node-backend/uploads/` 写真实文件（已加 `.gitignore`），删除测试会清理对应文件。
- 无契约偏离登记：B5 严格按冻结契约实现，未新增 error.code、未改契约。

## 六、下一步
待总把控独立复验（重跑门禁 + `wc -l` 确认 ≤200 + 测试仍绿 + 契约双门复跑）通过后，进 **B6（收藏 / 历史 / 点赞 / 通知，15 端点）**。
