# B-R2部署 · 后端代码审阅报告（2026-08-29，BackendArchitect）

> 被审：开发 AI 提交 `2ad49dd`「feat(node-backend): 补齐 R2 存储驱动并升级 Cloudflare 部署骨架」
> 范围：`storage.ts`（R2Storage 实现 + createStorage 接线）、`files.ts`（统一 storage 直出）、
> `wrangler.toml`（生产骨架）、`test/shared/storage.r2.test.ts`、`test/routes/files.r2.test.ts`、`DEV-LOG.md`
> 基线：冻结契约 `openapi.v1.yaml` v1.11.0（字节级不可改）；M1 主线 `node-backend-v1.0`

---

## 一、裁定

**代码层面：通过（功能正确、测试充分、契约零变更、五门全绿）。**

**部署层面：存在 1 个阻断级问题（P1），`wrangler deploy` 前必须修复，否则 Worker 在模块求值阶段即失败、无法启动。**

即：**本次补充的 R2 驱动本身是合格的，但"升级为生产可用配置"的承诺尚未兑现**——缺 `compatibility_flags`，自动化测试（在 Node 跑）无法暴露，只有真实 `wrangler deploy` 才会撞上。

> 流程建议：开发 AI 按 §四 指令修 P1（并可选做 P2 优化）→ 复跑五门 → 架构师复批 → owner `wrangler login` 后部署。

---

## 二、五门门禁独立复验（全绿）

| 门 | 命令/手段 | 结果 |
|---|---|---|
| typecheck | `tsc --noEmit` | ✅ 0 error |
| lint | `biome check .` | ✅ 117 文件 0 问题 |
| 单测 | `vitest run` | ✅ **140 passed**（原 133 + 新增 7，无回归） |
| 契约结构门 | `openapi-spec-validator` | ✅ STRUCTURE_OK |
| 契约语义门 | `check_contract.py` | ✅ 全部通过（33 OK 口径，yaml 字节级 0 变更） |

- 新增 R2 测试：`storage.r2.test.ts`(4) + `files.r2.test.ts`(3) = 7 passed。
- `openapi.v1.yaml` 本提交 **git diff 0 行**：契约未动，冻结保持。

---

## 三、逐项发现

### 🔴 P1（部署阻断）· wrangler.toml 缺 `compatibility_flags = ["nodejs_compat"]`

**根因**：Worker 模块图在 `storage.ts:10-12` 顶层引入了
```ts
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
```
其中 `node:crypto`（createHash，R2 与 local **共用**做内容寻址）与 `node:fs/promises` 在 Cloudflare Workers 中**默认不支持**，必须靠 `compatibility_flags = ["nodejs_compat"]` 才能解析这些 `node:*` 导入。

当前 `wrangler.toml` 仅有 `compatibility_date = "2025-01-01"`，**没有该 flag**。`wrangler deploy` 在模块加载阶段就会因无法解析 `node:*` 导入而失败，Worker 根本起不来——与提交说明"升级 wrangler.toml 为生产可用配置"相悖。

> 说明：即便 `STORAGE_DRIVER=r2` 下 `LocalStorage`（用 node:fs）永不被实例化，顶层 `import node:fs/promises` 仍会在模块求值时执行，无 flag 即崩。故 P1 与具体驱动无关，是 Worker 启动的硬前提。

**为何自动化测试没抓到**：vitest 跑在 Node（原生支持 `node:*`），门禁全绿是"Node 视角"；Cloudflare 运行时视角未覆盖。这是典型"测试绿、部署挂"盲区，只能靠代码审阅发现。

**DEV-LOG 核对**：R-R5 如实记录"绑定为占位 id、用户本机 `wrangler login` 后部署、凭证不离开其机器"，**未虚报已实测 deploy**（诚实）；但同样漏识 nodejs_compat 缺口。

### 🟡 P2（非阻断，健壮性）· `node:fs/promises`/`node:path` 在 R2 生产路径是死引入

R2 模式下从不调用 `mkdir/readFile/unlink/writeFile/join`（仅 `LocalStorage` 用）。在补上 P1 的 nodejs_compat 后模块可加载、运行不触发，**功能无碍**；但 CF bundle 仍打包了无用的 fs 依赖，且一旦哪天误在 R2 分支走到 fs 会抛运行时错。

**可选优化**（非阻断）：把 `node:fs/promises`/`node:path` 的引入收敛进 `LocalStorage`（动态 `import()` 或拆分文件），让生产 bundle 不引 fs。注意 `node:crypto` 的 createHash 两驱动都用，**仍需 nodejs_compat**；若要彻底去掉 flag，应改用 Web Crypto `crypto.subtle.digest('SHA-256', buffer)`（Worker 原生、无需 flag）——属重构，不在本次必修范围。

### 🟢 P3（设计权衡，信息项，均非阻断）

- **P3-A 策略 A 全量经 Worker 中转**：`GET /files/:key` 由 Worker 从 R2 读取后直出（而非 R2 public/CDN 直链）。功能正确、前端零感知、URL 稳定，联调期合理。代价：每个附件请求都走 Worker egress（成本+延迟），媒体量大时建议后续加 R2 public dev URL 或 CDN 前置。本期可接受，记录为后续优化。
- **P3-B 每请求重建 storage 实例**：`files.ts:37` 每次 `createStorage(env)` new 一个 R2Storage/LocalStorage，可提至模块级复用。性能影响极小。
- **P3-C R2 对象未存 contentType 元数据**：`R2Storage.put` 不传 `httpMetadata`；`/files` 路由按扩展名推断 mime（MIME_BY_EXT）。在策略 A（经 Worker 直出）下正确；若未来改 CDN 直链则需补 metadata。
- **P3-D 去重 TOCTOU 竞态**：`R2Storage.put` "先 get 判命中再 put" 与 `LocalStorage` 同构，已先前裁定接受（上传去重 P3-1）。R2 同 key PUT 幂等，无损坏风险。

---

## 四、契约影响（已确认安全）

- `GET /files/:key` 挂在 `/files`（**不在** `/api/v1` 下），OpenAPI 未含此路径 → 不属 JSON 契约范围。
- `Attachment.url` 仅约束 `string / format:uri / maxLength:512`；`/files/{key}`（key 为 sha256 hex + ext，约 70 字符）合规。
- 本提交 **未改** `openapi.v1.yaml`（git diff 0 行）；结构门/语义门仍全绿。**冻结保持，零字节变更。**

---

## 五、开发 AI 修正指令（P1 必修 + P2 可选）

**P1（必修，deploy 前置）**——`wrangler.toml` 在 `compatibility_date` 下补：
```toml
compatibility_flags = ["nodejs_compat"]
```
复跑五门确认仍全绿（nodejs_compat 不影响 Node 侧测试）。

**P2（可选）**——将 `storage.ts:11-12` 的 `node:fs/promises`/`node:path` 引入移入 `LocalStorage` 类内（动态 import 或拆分），使 R2 生产 bundle 不引 fs。如做，需在 `STORAGE_DRIVER=local` 的现有测试下确认无回归。

**DEV-LOG**——在 R-R5 补一句："wrangler.toml 需 `compatibility_flags = ["nodejs_compat"]`（worker 引 node:*）；已补。"

---

## 六、复批门禁（修复后须满足）

1. `tsc --noEmit` → 0 error
2. `biome check .` → 0 问题
3. `vitest run` → **140 passed**（含新增 7，无回归）
4. 契约结构门 STRUCTURE_OK + 语义门 33 OK + `openapi.v1.yaml` git diff 0 行
5. `wrangler.toml` 含 `compatibility_flags = ["nodejs_compat"]`（P1 落实证据）

**待 P1 落实、五门复绿、owner 实际 `wrangler deploy` 验证 Worker 启动成功 → 可裁定 R2 部署补充正式收口。**
