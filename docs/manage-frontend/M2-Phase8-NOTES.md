<!--
@doc M2-Phase8-NOTES.md
@description M2 Phase 8 跨切面收口（M2-13 构建优化 / M2-14 部署 / M2-15 复盘）。仿 B0-NOTES 五段式。
@module manage-frontend/phase8
@date 2026-08-29
-->

# M2 Phase 8 · 跨切面（构建 / 部署 / 复盘）收口

## 一、交付物

| 文件 | 性质 | 说明 |
|:---|:---|:---|
| `vite.config.ts` | 改 | 挂 `rollup-plugin-visualizer`，**仅 `ANALYZE=1` 时生效**（gated），平时零开销 |
| `package.json` | 改 | 加 `analyze` 脚本（`ANALYZE=1 pnpm build`） |
| `dist/stats.html` | 生成物（`ANALYZE=1 pnpm build` 产出） | treemap 体积分析，1.5 MB 可交互；`dist/` 已 gitignore，重新生成即 `pnpm analyze`；biome 已忽略 `build-report` 防噪点 |
| `docs/manage-frontend/M2-14-部署指南.md` | 新 | Cloudflare Pages + Nginx 两套静态托管：SPA 回退 + /api/v1 反代 + /files 回退 + 缓存 |
| `docs/manage-frontend/M2-15-复盘文档.md` | 新 | 代码量/返工点/选型对错/七端契约一致性/工程化爬坡项 |

## 二、选型理由

- **M2-13 用 `rollup-plugin-visualizer` 且 gated**：计划 §11 点名要「分析体积」；挂 `ANALYZE` 开关避免污染正常/CI 构建（否则每次落一个 1.5 MB 噪点 html）。证据驱动，不靠估算。
- **不擅自抬高 `chunkSizeWarningLimit`**：md-editor 563.94 kB 超 500 kB 告警是真实信号，owner 已裁决「接受不改」。抬阈值=藏问题，与本轮原则相悖，故不动（审阅专家原话「若想消除告警噪音须附注释说明，等 owner 点头」）。
- **部署指南双方案**：后端在 Cloudflare，故首选 CF Pages（同生态、Functions 反代最省心）；Nginx 版供自托管/内网。两者都强调 SPA `try_files`/`_routes.json` 回退 + 反代 `/api/v1`、`/files`（dev 代理是方案 B 专用，生产不能指望它）。

## 三、关键设计 / 实测证据

**M2-13 构建优化（实测，非自陈）**
- 路由级懒加载：登录/仪表盘/文章列表/文章编辑/评论/分类/标签/用户/站点设置/个人中心 5 子页 **全部 `React.lazy`**，各业务页产物 4–9 kB（gzip 2–3.4 kB）。
- `manualChunks` 隔离编辑器生态：`md-editor` 563.94 kB / gzip 180.24 kB（唯一 >500 kB chunk，owner 已接受）。
- 共享 vendor `index` 395.09 kB / **gzip 127.77 kB**（首屏基线，合理）。
- DashboardPage 336.44 kB / gzip 99.05 kB（含 recharts，仅 `/dashboard` 按需）。
- 结论：**首屏 ≈127 kB gzip + 小页面 chunk**，编辑器/图表均懒加载，体积策略已到位。

**M2-14 部署**
- 明确 dev 代理 ≠ 生产反代；生产必须反代或后端开 `CORS_ORIGINS`，否则线上 CORS 报错。
- 附件 `/files` 根路径坑写入指南 FAQ（契约 Attachment.url 不带 /api/v1）。
- 部署后验证清单 6 条（登录/深链刷新/API 同源/附件/刷新保登录/懒加载）。

**M2-15 复盘**
- 四门门禁全绿、62 测试、依赖增量清晰。
- 4 处「计划↔契约偏差」全部以契约为真相源回流 + 测试钉死。
- 选型对错逐条给证据（md-editor/方案 B/refractor 语言集/strict/co-location）。

## 四、运行 / 门禁

```bash
pnpm typecheck   # 0
pnpm lint        # biome 111 文件 0 issue
pnpm test        # 62 passed
pnpm build       # 通（md-editor 563.94 kB 告警，owner 已接受）
pnpm analyze     # 额外生成 dist/stats.html treemap
```

## 五、待留意（非阻塞）

1. **组件级 / E2E 测试缺口**：当前 62 测试覆盖请求层/契约守卫/纯函数，`pages/*` 缺 jsdom/RTL 渲染测试、缺 Playwright E2E。三轮审阅一致标记 R4（工程化爬坡项），非本轮 regression。
2. **R4 续**：公开 `GET /site/settings` 5000 仍属后端上线前确认项（前端只碰 admin 端点）。
3. **`openapi-typescript@7` 要求 ts ^5，项目 ts 6.0.3**：仅影响类型生成工具，待工具链升级解。
4. 部署指南未实际跑过 CF Pages / Nginx 真部署——属文档，owner 按 §2/§3 实操验收。
5. 未 git commit（用户自管）。
