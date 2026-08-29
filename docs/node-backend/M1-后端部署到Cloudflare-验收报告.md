# M1 后端部署到 Cloudflare · 验收报告

> 模块：node-backend（已冻结 `node-backend-v1.0`，本次为冻结后增量维护 + 生产部署）
> 日期：2026-08-29
> 执行角色：SeniorDeveloper（统筹 AI）
> 部署目标：Cloudflare Workers + D1 + R2，自定义域名 `api-befull.kao9.com`
> 状态：**全链路验收 GREEN ✅**

---

## 一、验收结论

M1 后端已成功部署至 Cloudflare 生产环境，并以真实线上接口逐项实测通过。**从 Worker 启动、D1 数据查询、CORS、管理员登录，到 R2 附件读写全链路，均已在 `https://api-befull.kao9.com` 实测确认**。后端联调地基齐活，可正式交接前端以 `https://api-befull.kao9.com/api/v1` 联调。

| 验收维度 | 结论 |
|---|---|
| 部署形态 | Workers + D1（database `node-backend`）+ R2（bucket `node-backend`）+ 自定义域名 |
| 契约基线 | `docs/api/openapi.v1.yaml` v1.11.0（OpenAPI 3.1）字节级零变更 |
| 代码门禁 | 六门全绿（见 §二） |
| 线上实测 | 六条链路全绿（见 §三） |

---

## 二、代码门禁（六门，冻结复验 + 架构师复批）

本次部署涉及的改动（`storage.ts` R2 驱动补齐、`files.ts` 统一直出、`wrangler.toml` 生产骨架 + R2 绑定名修正、seed 脚本、README、注释同步）在合并前均已通过以下门禁。门禁数字来自 2026-08-29 R2 部署复验与 BackendArchitect 复批（`review/B-R2部署-复审批复.md`）。

| # | 门禁 | 命令 / 依据 | 结果 |
|---|---|---|---|
| 1 | TypeScript 编译 | `tsc --noEmit`（strict） | **0 error** |
| 2 | 代码规范 | `biome check`（117 文件） | **0 问题** |
| 3 | 单元测试 | `vitest run` | **140 passed** |
| 4 | 契约结构门 | `openapi-spec-validator` | **OK** |
| 5 | 契约语义门 | `docs/api/check_contract.py` | **33 OK** |
| 6 | 契约字节级 | `git diff docs/api/openapi.v1.yaml` | **0 diff**（未改契约） |

> 说明：M1 原始冻结基线为 tsc0 / biome 115文件0 / vitest 133；R2 驱动补齐 + 结构调优后演进为上表数字（117 / 140），契约双门与字节级约束始终未变。

补充部署层约束：
- `wrangler.toml` 已配置 `compatibility_flags = ["nodejs_compat"]`——`storage.ts` 顶层 `import "node:crypto"` 使 Worker 必须能解析 `node:*`，无此 flag 时 `wrangler deploy` 模块求值即崩。本次真实 CF 运行时（34ms 启动）已闭环验证。
- 本次 R2 绑定名修正（`node_backend` → `R2_BUCKET`）为**纯配置变更**，冻结代码未动，六门门禁不受影响，无需重跑。

---

## 三、线上实测证据

所有证据取自 2026-08-29 在 `api-befull.kao9.com` 的真实 curl 往返。

### 1. Worker 启动 / 部署成功
`wrangler deploy` 输出：Total Upload 1104.89 KiB、Worker Startup **34ms**、D1 `node-backend`、R2 `node_backend`→`R2_BUCKET`、Vars `STORAGE_DRIVER=r2`、trigger `api-befull.kao9.com`、Version `f7ac1420-...`。响应头 `server: cloudflare` / `cf-ray` 证实为真实 CF Worker。

### 2. D1 查询
```http
GET /api/v1/articles  →  200
{"code":0,"message":"ok","data":{"list":[],"pagination":{"total":0,...}}}
```
`total:0` 空列表而非 500，证明 **D1 表已建且可查**（表不存在会报 `no such table` → 500）。`DB` 绑定名与 `env.ts` 一致。

### 3. CORS
响应头 `access-control-allow-credentials: true` + `vary: Origin`，CORS 已生效。

### 4. 管理员登录（bcryptjs12 同源）
```http
POST /api/v1/auth/login  {"username":"admin","password":"Admin.123"}  →  200
{"code":0,"data":{"accessToken":"...","user":{"role":"admin","status":"active",...}}}
```
登录响应字段为 `data.accessToken`（非 `token`）。密码由 D1 UPDATE 用 **`bcryptjs.hashSync(pwd, 12)` 同源哈希**重置后比对通过——旧 seed 哈希与线上 `hashPassword` 不同源，是此前「密码错误」的根因。

### 5. R2 写路径（上传）
```http
POST /api/v1/upload  (Bearer <admin token>, multipart)  →  200
{"code":0,"data":{
  "url":"/files/a4dd28db6e6d3fc0d43cdbef1e8ef161b353ce67d27e81d400f796bc77045ae6.png",
  "storage":"r2",
  "mimeType":"image/png","size":70}}
```
`storage:"r2"` 直接证明 `wrangler.toml` 的 `binding="R2_BUCKET"` 修正已随重部署生效（`env.ts` 读取对齐）。key 为内容寻址 sha256 + 扩展名。

### 6. R2 读路径（附件直出）
```http
GET /files/a4dd28db6e6d3fc0d43cdbef1e8ef161b353ce67d27e81d400f796bc77045ae6.png  →  200
content-type: image/png
content-length: 70
x-content-type-options: nosniff
```
70 字节二进制体正确透出，R2 读路径线上打通。

> 注：读回路径**不带** `/api/v1` 前缀。文件直出路由刻意挂在根 `/files`（`app.ts:69` 策略 A：附件直出不进 `/api/v1`），故正确取法是 `ORIGIN + /files/<key>`。详见 §四 FAQ-4。

---

## 四、踩坑 FAQ（四次排障沉淀）

### FAQ-1 · R2 绑定名须对齐 `R2_BUCKET`
**现象**：上传接口 500，报错 `R2_BUCKET 未绑定`。
**根因**：活的 `wrangler.toml` 的 `[[r2_buckets]] binding` 误写为 `node_backend`，与 `src/config/env.ts` 期望的 `R2_BUCKET` 不一致。当 `STORAGE_DRIVER="r2"` 时，`createStorage` 因 `env.R2_BUCKET` 为 `undefined` 直接抛错。
**修复**：改为 `binding = "R2_BUCKET"` 后重部署。附录 toml 模板（指南 §8.1）本就正确，本次为活配置漂移回正。grep 全仓确认无其它 `node_backend` 旧引用。

### FAQ-2 · D1 改密码的哈希含 `$`，必须用文件执行
**现象**：直接 `--command="...$2b$12$..."` 执行后密码仍错，或 UPDATE 未生效。
**根因**：bcrypt 哈希含 `$` 字符，bash 会把 `$2`/`$1` 当位置参数展开，哈希被截断报废。
**正确做法**：哈希必须用 `bcryptjs.hashSync(pwd, 12)` 本地生成（与线上 `hashPassword` 同源），再用 heredoc 落文件 + `--file` 执行：
```bash
cat > /tmp/reset-admin.sql <<'EOF'
UPDATE users SET password_hash = '$2b$12$...', updated_at = unixepoch()*1000
WHERE username = 'admin';
EOF
wrangler d1 execute node-backend --remote --file=/tmp/reset-admin.sql
```

### FAQ-3 · curl `-F file=@~/x` 的 `~` 不被展开
**现象**：`curl: (26) Failed to open/read local data from file/application`。
**根因**：`~` 是 shell 才展开的，curl 处理 `@` 前缀时不展开 `~`，把它当相对路径查找。此外测试图 `91.png` 实际不在 `~/Downloads`。
**正确做法**：用**本机真实存在的绝对路径**（测试 PNG 须生成在你运行的 Mac 上，沙箱生成的本机读不到）：
```bash
python3 -c "import base64; open('/tmp/test-upload.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='))"
curl -i -X POST https://api-befull.kao9.com/api/v1/upload \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/test-upload.png"
```

### FAQ-4 · 附件 URL 前缀坑（前端联调高发）
**现象**：`GET /api/v1/files/<key>` 返回纯文本 `404 Not Found`（非 JSON 信封）。
**根因**：文件直出路由挂在根 `/files`（`app.ts:69` 策略 A），不在 `/api/v1` 下；`/api/v1/files/<key>` 未注册 → Hono 默认 404。上传本身成功（200 + `storage:"r2"`）。
**正确取法**：`https://api-befull.kao9.com/files/<key>`（域名根 + `/files`，不带 `/api/v1`）。
**前端必读**：`Attachment.url` 返回 `/files/<key>`，拼接时必须用 `ORIGIN + url`（`https://api-befull.kao9.com/files/...`），**不能**用 `API_BASE + url`（若 `API_BASE` 含 `/api/v1` 会拼成 404）。

---

## 五、后续行动建议（owner 自管，AI 不自动提交）

1. **提交增量**：本次累积的冻结后增量（R2 驱动补齐、`files.ts` 统一直出、`wrangler.toml` 生产骨架 + R2 绑定名修正、seed 脚本、README、注释同步、部署文档/验收报告）建议 `git commit`。按 M1 冻结约定「增量维护 fix→门禁复绿→commit→必要时 bump patch tag，不热改主干」。
2. **bump patch tag**：建议打 `node-backend-v1.0.1`（或 owner 裁定版本），锁定跨端协作代码基线。
3. **交接前端**：联调基址 `https://api-befull.kao9.com/api/v1`，附件直出 `https://api-befull.kao9.com/files/<key>`；M2 前端须用 `ORIGIN + url` 拼接（FAQ-4）。

---

## 六、相关文档索引

- 部署操作手册：`docs/node-backend/部署到Cloudflare指南.md`（阶段 0–5 复制即跑命令 + FAQ + 附录 toml 模板 + D1 seed SQL）
- R2 部署审阅链路：`review/B-R2部署-后端代码审阅报告.md` → `review/B-R2部署-后端代码-开发AI回复.md` → `review/B-R2部署-复审批复.md`
- 代码基线：M1 冻结交付 `M1-后端交付文档.md`；契约 `docs/api/openapi.v1.yaml` v1.11.0
- 开发日志：`DEV-LOG.md`
