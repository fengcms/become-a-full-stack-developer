# 部署到 Cloudflare 操作指南（node-backend）

> 适用范围：`node-backend/`（Hono + Drizzle + Cloudflare D1/R2）
> 文档定位：把后端部署到 Cloudflare Workers + D1 + R2，供前端以线上接口联调。
> 当前代码状态：**已冻结 + R2 驱动已补齐 + `nodejs_compat` 已配置**。本文命令均按冻结后代码核对。

---

## 0. 一句话流程

本机 `wrangler login` → 填 `wrangler.toml`（JWT secret / CORS / 域名 / bucket 名）→ `wrangler d1/r2 create` 回填 id → `drizzle-kit generate` + `wrangler d1 execute` 建表 → 用 D1 SQL 建首管理员 → `wrangler deploy` → 配自定义域名 DNS → 给前端联调地址。

凭证（JWT_SECRET）**只走 `wrangler secret put`，不进 git、不写明文到 toml**。

---

## 1. 当前就绪度盘点

| 维度 | 状态 | 说明 |
|---|---|---|
| CF 入口 `src/worker.ts` | ✅ 就绪 | 复用同一套 Hono app，注入 D1 binding |
| D1 适配层 `src/db/client.ts` | ✅ 就绪 | `createD1Db(binding)` 已实现 |
| 环境 `src/config/env.ts` | ✅ 就绪 | `DB`(D1) / `R2_BUCKET` 字段已声明 |
| R2 驱动 `src/shared/storage.ts` | ✅ 就绪 | `R2Storage` 已实现（`STORAGE_DRIVER=r2` 生效） |
| `wrangler.toml` | ✅ 半成品 | `nodejs_compat` + D1/R2 占位已写，**待你填 id / 域名 / CORS** |
| `drizzle.config.ts` | ✅ 就绪 | dialect=sqlite，生成 D1 SQL 用 |
| `drizzle/` 迁移 SQL | ❌ 待生成 | 需 `drizzle-kit generate` |
| `JWT_SECRET` / `CORS_ORIGINS` | ❌ 待填 | 敏感项走 secret；CORS 填前端域名 |
| `package.json` 的 `deploy` 脚本 | ❌ 无（无需） | 直接用 `wrangler deploy` CLI |

> ⚠️ **架构铁律提醒**：Cloudflare Workers 文件系统**只读**，`STORAGE_DRIVER` 必须 `r2`（已在 toml 设定）。`local` 写盘在线上会失败。R2 驱动已补齐，上传接口在生产可用。

---

## 2. 前置准备

| 项 | 命令 / 说明 |
|---|---|
| Node 版本 | 建议 ≥ 18（本机开发用 22.22.2，部署不依赖本地 Node 运行时） |
| 安装 wrangler | `npm i -g wrangler` |
| 登录 CF 账号 | `wrangler login`（浏览器授权，凭证不离开你的机器） |
| 确认账号权限 | 需有 Workers / D1 / R2 的创建与部署权限 |

> 登录后可用 `wrangler whoami` 验证当前账号。

---

## 3. 部署前检查清单

- [ ] 后端冻结后的增量（R2 driver + 测试 + `wrangler.toml` + 注释同步 + seed）已 **git commit**，必要时 bump patch tag（如 `node-backend-v1.0.1`）。
- [ ] `git status` 干净，确认部署的是最新代码。
- [ ] 已知前端联调将用的域名（填 CORS 与可选自定义域名 route）。
- [ ] 准备好强随机 `JWT_SECRET`：`openssl rand -base64 48`。

---

## 4. 分阶段操作（命令可直接复制）

> 约定：`<...>` 为需替换的占位符；示例值仅作演示。

### 阶段 0 — 登录与定位

```bash
npm i -g wrangler
wrangler login
wrangler whoami        # 确认账号
cd node-backend
```

### 阶段 1 — 敏感凭证与非敏感配置

**① JWT_SECRET（敏感，走 secret，不写 toml）**

```bash
wrangler secret put JWT_SECRET
# 提示输入时粘贴：openssl rand -base64 48
```

**② 编辑 `wrangler.toml` 填真实值**（见附录模板）：

- `CORS_ORIGINS`：填前端实际域名，逗号分隔。例如：
  `CORS_ORIGINS = "https://www.yourdomain.com,https://admin.yourdomain.com"`
- 自定义域名（可选）：取消 `routes` 注释，填入你的 API 域名：
  `routes = [{ pattern = "api.yourdomain.com", custom_domain = true }]`
- `[[r2_buckets]]` 的 `bucket_name` 保持 `node-backend`（与阶段 2 创建同名即可）。

> 若先只用 `*.workers.dev` 默认子域联调，可暂不取消 `routes`，部署即得 `https://node-backend.<subdomain>.workers.dev`。

### 阶段 2 — 创建 D1 与 R2，回填 id

```bash
# 创建 D1 数据库（复制返回的 database_id）
wrangler d1 create node-backend

# 创建 R2 存储桶（名称与 toml 中 bucket_name 一致）
wrangler r2 bucket create node-backend
```

把 `wrangler d1 create` 返回的 `database_id` 填进 `wrangler.toml` 的：

```toml
[[d1_databases]]
binding = "DB"
database_name = "node-backend"
database_id = "<这里粘贴返回的 id>"
```

### 阶段 3 — 生成并应用建表 SQL

```bash
# ① 生成迁移 SQL → 落到 ./drizzle/（含 0000_*.sql + meta/）
npx drizzle-kit generate

# ② 应用建表 SQL（两种姿势，任选其一）：

# 方式 A（整目录应用，无需逐个指文件名；贴合"不单独指定每个 sql"的习惯）
#    ⚠️ 当前 wrangler 版本不支持 --migrations-folder 参数，
#       migrations apply 只认默认 ./migrations 目录，
#       所以先把 drizzle-kit 生成的 .sql 复制过去
#       （zsh 下 drizzle/*.sql 能正常展开，无 nomatch 问题）。
mkdir -p migrations && cp drizzle/*.sql migrations/
wrangler d1 migrations apply node-backend --remote
#    wrangler 按文件名顺序应用 ./migrations 下所有 .sql，
#    并用 d1_migrations 表记录已应用项，重跑不会重复建表。

# 方式 B（单文件执行，需写死确切文件名，不要照抄通配符）
wrangler d1 execute node-backend --remote --file=./drizzle/0000_windy_songbird.sql
```

> **关于 `--migrations-folder`**：你当前 wrangler 版本不支持该参数（会报 `Unknown arguments: migrations-folder`）。`migrations apply` 固定读默认 `./migrations` 目录，因此方式 A 需先把生成的 `.sql` 复制/移动到 `./migrations/`。
>
> **可选优化**：把 `drizzle.config.ts` 的 `out` 改为 `./migrations`，以后 `drizzle-kit generate` 直接落进 `apply` 默认目录，省去复制步骤（drizzle 默认 `./drizzle` 与 wrangler 默认 `./migrations` 不一致，对齐即可）。
>
> 若 `apply` / `execute` 报 D1 语法不兼容（极少概率，标准 DDL 一般没问题），把报错贴回开发 AI，改 `src/db/schema.ts` 兼容。

### 阶段 4 — 建首管理员（D1 等价 SQL）

D1 无法跑 Node 种子脚本，改用 `wrangler d1 execute`。密码哈希需**先在本地用相同 bcryptjs(rounds=12) 生成**：

```bash
# 本地生成 bcrypt 哈希（rounds=12，与线上 hashPassword 同源）
node -e "console.log(require('bcryptjs').hashSync('你的强密码', 12))"
```

把输出哈希粘贴进下方 `<BCRYPT_HASH>`，执行：

```bash
wrangler d1 execute node-backend --remote --command="
  INSERT INTO users (username, password_hash, role, email, display_name, level, status, created_at, updated_at)
  SELECT 'admin', '<BCRYPT_HASH>', 'admin', 'admin@example.com', '站点管理员', 1, 'active', unixepoch()*1000, unixepoch()*1000
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
"
```

> `WHERE NOT EXISTS` 保证幂等；重复执行不会建重。

### 阶段 5 — 部署

```bash
wrangler deploy
```

部署成功会输出 Worker 地址（默认 `https://node-backend.<subdomain>.workers.dev`）。

**自定义域名（若阶段 1 已启用 routes）：**

1. 在 Cloudflare DNS 添加 CNAME：`api.yourdomain.com` → `node-backend.<subdomain>.workers.dev`
2. 等待 SSL/TLS 证书自动签发（CF 通常为几分钟内）
3. 用 `curl https://api.yourdomain.com/api/v1/health` 验证

---

## 5. 验证联调

```bash
# 健康检查（确认 Worker 启动正常）
curl https://node-backend.<subdomain>.workers.dev/api/v1/health

# 或用自定义域名
curl https://api.yourdomain.com/api/v1/health
```

**前端联调 base URL：**

- 默认子域：`https://node-backend.<subdomain>.workers.dev/api/v1`
- 自定义域名：`https://api.yourdomain.com/api/v1`

> 上传接口（`POST /upload` 等）走 R2，url 返回 `/files/<key>`，由 `GET /files/:key` 经 Worker 中转返回——前端零改动。

---

## 6. 回滚与重部署

- **改代码后重新部署**：`git commit` → `wrangler deploy`（无需重建 D1/R2，数据保留）。
- **重置数据库**：`wrangler d1 execute node-backend --remote --command="DROP TABLE IF EXISTS ..."` 后重跑阶段 3 + 4（⚠️ 会清空数据，谨慎）。
- **切换域名**：改 `wrangler.toml` 的 `routes` 与 `CORS_ORIGINS` → `wrangler deploy`。

---

## 7. 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `wrangler deploy` 模块求值即崩 / 报无法解析 `node:*` | 缺 `nodejs_compat` | 确认 `wrangler.toml` 有 `compatibility_flags = ["nodejs_compat"]`（已配置，勿删） |
| 上传接口 500 / 文件读不到 | `STORAGE_DRIVER` 设为 `local` | 改为 `r2`（toml 已设 `r2`） |
| 前端跨域被拒 | `CORS_ORIGINS` 未含前端域名 | 填真实域名后 `wrangler deploy` |
| 登录失败（密码不对） | D1 哈希与线上算法不一致 | 必须用 `bcryptjs.hashSync(pwd, 12)` 本地生成后粘贴（rounds=12） |
| D1 建表报语法错 | schema 含 D1 不支持的语法 | 贴报错给开发 AI 改 `schema.ts` |
| 自定义域名 SSL 不生效 | DNS/CNAME 未传播 | 等几分钟；确认 CNAME 指向 `<subdomain>.workers.dev` |

---

## 8. 附录

### 8.1 `wrangler.toml` 模板（当前真实状态）

```toml
name = "node-backend"
main = "src/worker.ts"
compatibility_date = "2025-01-01"
# Worker 模块图顶层引入 node:*（node:crypto 两驱动共用；local 驱动用 node:fs/node:path），
# 必须开启 nodejs_compat 才能在 CF 运行时解析这些导入，否则 wrangler deploy 在模块求值阶段即失败。
# 注意：即便生产用 STORAGE_DRIVER=r2、local 驱动永不被实例化，顶层 node:fs 导入仍会求值，故本 flag 不可省。
compatibility_flags = ["nodejs_compat"]

# ── 自定义域名（部署后需在 CF 配 DNS + SSL）──
# 取消注释并填入你的 API 域名；若先用 *.workers.dev 默认子域联调，可暂保持注释。
# routes = [{ pattern = "api.yourdomain.com", custom_domain = true }]

# ── 部署环境变量（非敏感）──
[vars]
NODE_ENV = "production"
DB_FILE = ":memory:"            # CF 下无意义（走 D1 binding），保留无害
STORAGE_DRIVER = "r2"          # 生产必须 r2（local 写盘在 CF 只读文件系统会失败）
# CORS：填前端实际域名（逗号分隔）；留空或 '*' 将被拒跨域
CORS_ORIGINS = "https://www.yourdomain.com,https://admin.yourdomain.com"

# JWT_SECRET 为敏感项，走加密 secret（不进 git / 不写本文件）：
#   wrangler secret put JWT_SECRET

# ── Cloudflare D1 绑定 ──
# 先执行：wrangler d1 create node-backend → 复制返回的 database_id 填下方
[[d1_databases]]
binding = "DB"
database_name = "node-backend"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# ── Cloudflare R2 绑定 ──
# 先执行：wrangler r2 bucket create node-backend → bucket 名填下方
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "node-backend"
```

### 8.2 首管理员 D1 种子 SQL（等价于 `pnpm seed`）

```bash
# 1) 本地预生成 bcrypt 哈希（rounds=12，与线上 hashPassword 同源）
node -e "console.log(require('bcryptjs').hashSync('你的强密码', 12))"

# 2) 执行（把 <BCRYPT_HASH> 替换为上一步输出）
wrangler d1 execute node-backend --remote --command="
  INSERT INTO users (username, password_hash, role, email, display_name, level, status, created_at, updated_at)
  SELECT 'admin', '<BCRYPT_HASH>', 'admin', 'admin@example.com', '站点管理员', 1, 'active', unixepoch()*1000, unixepoch()*1000
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
"
```

> 本地自管 Linux 部署仍可用 `pnpm seed`（走 `scripts/seed-users.ts`，复用应用层 `hashPassword`），无需此 SQL。

---

## 9. 本案决策记录（与 owner 确认）

- **上传/R2**：前端联调涉及上传 → 已补 R2 驱动（`STORAGE_DRIVER=r2`）。
- **CF 凭证**：owner 本机 `wrangler login`，部署动作在 owner 机器执行，凭证不离开其环境。
- **域名**：绑定自定义域名（部署后配 DNS + SSL）；可先以 `*.workers.dev` 子域快速联调。
- **R2 URL 策略**：采用「后端 `/files` 中转」（策略 A）——`url` 返回 `/files/<key>`，前端零改动、不需配 R2 public 访问。
- **nodejs_compat**：审阅 B-R2 指出缺此 flag 会阻断部署，已补（见附录 toml 注释）。
