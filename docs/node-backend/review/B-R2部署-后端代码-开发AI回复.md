# M1 后端 · R2 部署补充：代码审阅回复（开发 AI）

> 回复对象：`docs/node-backend/review/B-R2部署-后端代码审阅报告.md`（BackendArchitect，2026-08-29）
> 整改方：开发 AI｜日期：2026-08-29
> 纪律：凡整改均回磁盘取证（`git diff` / 独立跑门禁 / 抓模块导入图）。不自证完成，交架构师复批、owner `wrangler deploy` 终验。

## 一、整改总览

| 级别 | 位置 | 问题 | 状态 |
|---|---|---|---|
| 🔴 P1（部署阻断） | `wrangler.toml` | 缺 `compatibility_flags = ["nodejs_compat"]`，`wrangler deploy` 模块求值阶段因无法解析顶层 `node:*` 导入而失败 | ✅ 已修 |
| 🟡 P2（非阻断） | `src/shared/storage.ts` | `node:fs/promises`/`node:path` 在 R2 路径是死引入，生产 bundle 冗余打包 | ✅ 已做（动态 import 收敛进 `LocalStorage`） |
| 🟢 P3-A | `files.ts`（策略 A 全量经 Worker 中转） | 每附件请求走 Worker egress | ⚪ 接受，记录为后续优化（联调期合理） |
| 🟢 P3-B | `files.ts:37` | 每请求重建 storage 实例 | ⚪ 接受，性能影响极小 |
| 🟢 P3-C | `R2Storage.put` | R2 对象未存 contentType 元数据 | ⚪ 接受，策略 A 下由 `/files` 按扩展名推断，正确 |
| 🟢 P3-D | `R2Storage.put` | 去重 TOCTOU 竞态 | ⚪ 接受，与上传去重 P3-1 同裁定，R2 PUT 幂等无损坏 |

## 二、P1 整改证据（部署阻断，必修）

**根因**：`storage.ts` 顶层 `import { createHash } from 'node:crypto'`（R2 与 local **共用**做内容寻址）。Cloudflare Workers 默认运行时不提供 `node:*` 命名空间，必须靠 `compatibility_flags = ["nodejs_compat"]` 才能解析。即便生产 `STORAGE_DRIVER=r2`、local 驱动永不被实例化，顶层 `import` 仍在模块求值阶段执行 → 无 flag 即崩。这是「测试绿（Node 视角）、部署挂（CF 视角）」盲区，只能靠代码审阅暴露。

**代码修复**（`node-backend/wrangler.toml`，`compatibility_date` 下补 flag）：
```diff
 name = "node-backend"
 main = "src/worker.ts"
 compatibility_date = "2025-01-01"
+# Worker 模块图顶层引入 node:*（node:crypto 两驱动共用；local 驱动用 node:fs/node:path），
+# 必须开启 nodejs_compat 才能在 CF 运行时解析这些导入，否则 wrangler deploy 在模块求值阶段即失败。
+# 注意：即便生产用 STORAGE_DRIVER=r2、local 驱动永不被实例化，顶层 node:fs 导入仍会求值，故本 flag 不可省。
+compatibility_flags = ["nodejs_compat"]
```

## 三、P2 整改证据（非阻断，已做）

**目标**：让 R2 生产 bundle 不再静态引入 `node:fs`/`node:path`（R2 路径永不调用这些 API）。

**做法**：将 `node:fs/promises`、`node:path` 由顶层静态 `import` 改为 `LocalStorage` 内按需动态 `import()`（模块级缓存 `fsCache`），并以字符串拼接 `joinPath` 替代 `node:path.join`（key 经 `SAFE_KEY` 校验无路径分隔符，拼接安全）。顶层仅保留 `node:crypto`（两驱动共用，且 nodejs_compat 已因 P1 必需，故不会因本改动失去 flag）。

**代码修复**（`src/shared/storage.ts`）：
```diff
 import { createHash } from 'node:crypto';
-import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
-import { join } from 'node:path';
 import type { AppEnv } from '@/config/env';
+
+/**
+ * node:fs/promises 与 node:path 仅 local 驱动使用。为让 R2 生产 bundle 不再静态引入 fs，
+ * 这里改为按需动态 import()（仅在 LocalStorage 方法被调用时触发，R2 模式永不触发）。
+ * 依赖 nodejs_compat（见 wrangler.toml）：node:crypto 顶层导入已要求该 flag。
+ */
+let fsCache: typeof import('node:fs/promises') | null = null;
+const loadFs = async (): Promise<typeof import('node:fs/promises')> => {
+  if (!fsCache) fsCache = await import('node:fs/promises');
+  return fsCache;
+};
+
+/** 替代 node:path.join：key 经 SAFE_KEY 校验无路径分隔符，简单拼接即可，规避额外 node: 导入。 */
+const joinPath = (root: string, key: string): string => `${root.replace(/[\\/]$/, '')}/${key}`;
```

`LocalStorage` 三方法（`put`/`get`/`delete`）改为先 `await loadFs()` 再调用，并用 `joinPath` 拼路径；移除了仅被原 `resolveKey` 使用的 `SAFE_KEY` 常量（key 校验已统一在 `files.ts` 路由层）。

**验证**：local 模式测试（经由 `attachment.test.ts` 实际上传 + `本地 /files/{key} 可直接访问` 等用例）全部仍绿，证明动态 import 在 Node 下正常加载、行为零回归。

## 四、P3 处理说明（设计权衡，确认接受，未改动）

- **P3-A**：策略 A（后端 `/files` 中转）已与 owner 在部署决策阶段拍板，前端零感知、URL 本地/生产一致，联调期合理；媒体量大时再评估 R2 public/CDN 前置。本期不动。
- **P3-B**：每请求 `new R2Storage` 开销极小（仅持有 bucket 引用），记录为后续微优化，不阻塞。
- **P3-C**：`R2Storage.put` 不传 `httpMetadata`。在策略 A 下由 `/files` 路由按扩展名推断 mime（含 SVG 强制下载 + nosniff 的 XSS 缓解），行为正确；若未来改 CDN 直链则需补 metadata，届时一并处理。
- **P3-D**：去重「先 get 判命中再 put」的 TOCTOU 与 `LocalStorage` 同构，先前（上传去重批次）已裁定接受；R2 同 key PUT 幂等，无数据损坏风险。

## 五、门禁证据（整改后独立重跑）

| 门禁 | 命令/手段 | 结果 |
|---|---|---|
| typecheck | `tsc --noEmit` | ✅ 0 error |
| lint | `biome check .` | ✅ 117 文件 0 问题 |
| 单测 | `vitest run` | ✅ **140 passed**（原 133 + R2 批次 7，无回归） |
| 契约结构门 | `openapi-spec-validator` | ✅ `openapi.v1.yaml: OK` |
| 契约语义门 | `check_contract.py` | ✅ 全部通过（33 OK，yaml 字节级 0 变更） |
| 部署配置 | `git diff wrangler.toml` | ✅ 含 `compatibility_flags = ["nodejs_compat"]`（P1 落实证据） |

`openapi.v1.yaml` 本批次 **git diff 0 行**：契约未动，冻结保持。

## 六、变更文件清单

- `node-backend/wrangler.toml`：补 `compatibility_flags = ["nodejs_compat"]` + 注释说明。
- `node-backend/src/shared/storage.ts`：`node:fs`/`node:path` 改为 `LocalStorage` 内动态 import；`joinPath` 替代 `node:path.join`；移除死变量 `SAFE_KEY`。
- 契约 `openapi.v1.yaml` **未改动**（仅配置与实现层调整）。
- 测试 **未改动**（既有 local/attachment 用例覆盖动态 import 路径，全绿即证）。

## 七、请求复验

P1（部署阻断）已清零并有 `wrangler.toml` 改写证据；P2 已做，R2 bundle 不再静态引 fs；P3 四项为已接受的设计权衡，记录为后续优化、本期不动。六门门禁全绿、契约零字节变更。

请架构师复批后，由 owner 本机执行 `wrangler login` → 填 D1/R2 id 与 CORS/域名 → `wrangler deploy`，以**真实 CF 运行时**终验 Worker 启动成功（这是 P1 修复的唯一权威验证手段，自动化测试无法替代）。
