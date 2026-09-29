# 成为全栈·Next.js 网站前台篇·OpenNext 部署 Cloudflare：构建成功不等于缓存正确

> `next build` 成功，只证明 Next.js 能生成生产产物；OpenNext 打包成功，只证明 Worker 产物形成。域名、Cookie、R2 增量缓存和重新验证仍要在目标环境逐项验收。

{{IMG:M3-23-封面}}

## 前言

App Router 的输出不是一包普通静态文件。公开页面包含服务端执行、RSC 响应、流式渲染和增量缓存；会员功能还依赖同源代理与 Cookie。

因此部署到 Cloudflare 不能只上传 `.next/static`。项目使用 OpenNext 将 Next.js 产物适配为 Worker，并用 R2 保存增量缓存。适配器解决运行形式，不能替我们证明生产行为。

## 部署链路包含四层

```text
Next.js 源码
  → next build
  → OpenNext Cloudflare 打包
  → Worker + 静态 Assets + R2 增量缓存
  → 域名、Cookie、后端 API 与真实流量
```

{{IMG:M3-23-部署链路}}

| 层次 | 成功意味着 | 尚未证明 |
| --- | --- | --- |
| Next build | 路由与生产产物可生成 | Worker 可运行 |
| OpenNext build | Worker 适配打包完成 | 远程资源已配置 |
| wrangler local | 本地 workerd 可运行 | 真实 R2 与 CDN 行为 |
| 远程部署 | 资源可访问 | 缓存、Cookie、性能均正确 |

## OpenNext 配置增量缓存

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: 'direct',
})
```

R2 为公开页面和数据的增量缓存提供跨请求存储。`queue: 'direct'` 影响重新验证任务执行方式，但不会改变文章定义的 60 秒业务窗口。

## Wrangler 绑定必须与代码约定一致

```json
{
  "name": "web-frontend-codex",
  "main": ".open-next/worker.js",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "r2_buckets": [
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET",
      "bucket_name": "web-frontend-codex-cache"
    }
  ]
}
```

binding 名称、桶名和环境要对应。预览、正式环境最好使用独立 Worker 与 R2，避免测试重新验证污染生产缓存。

## 本地模拟 R2 不等于远程 R2

```bash
pnpm build:cf
pnpm exec wrangler dev --local
```

本地模式使用模拟桶，不会创建远程资源。它可以证明 Worker 产物在 workerd 中启动、路由和代理能运行，却不能证明多节点传播、远程 R2 权限、配额与延迟。

项目本地测试观察到公开设置过期后能更新，也记录过一次后台重新验证连接中断，后续请求恢复。正确表述是“本地链路有成功证据，并保留过异常记录”，不是“生产缓存已完全可靠”。

## 环境变量分服务端与公开构建值

```text
API_ORIGIN=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://www.example.com
NEXT_PUBLIC_API_BASE_URL=/api/v1
```

`API_ORIGIN` 只在服务端 Worker 中使用；`NEXT_PUBLIC_SITE_URL` 参与 canonical、sitemap 和分享地址，通常在构建时确定；浏览器 API 地址保持同源 `/api/v1`。

用本地域名构建后再直接上传，会把 localhost 写进公开元数据。生产部署必须使用正式变量重新构建，而不是只在 Worker 运行时补一项 secret。

## Cookie 必须在真实域名和 HTTPS 下复核

```text
登录 → Set-Cookie(codex_refresh; HttpOnly; Secure; SameSite=Lax)
刷新页面 → /auth/refresh 自动携带 Cookie
退出 → 清除同名、同 Path Cookie
```

本地回环主机允许去掉 Secure，生产域名必须保留。还要检查反向代理后的 Host/Origin 比较、Cookie Domain 与 Path，以及新旧前台是否共享主机。

本地端口隔离不了 Cookie，因为 Cookie 不按端口区分；项目采用独立 `codex_refresh` 名称正是为了避免同主机旧前台冲突。

## HTML、RSC 与缓存版本要一致

App Router 客户端导航会请求 RSC Payload。若 CDN 分别以错误规则缓存 HTML 与 RSC，首次打开可能看到版本 A，站内导航却合并版本 B。

因此不要在 OpenNext 外再套一层“缓存所有 GET”的粗暴规则。平台缓存必须理解 Next.js 生成的响应头与变体，重新验证也要覆盖对应条目。

## 生产缓存验收脚本

```bash
curl -sS https://www.example.com/ -o /tmp/home-a.html
curl -sS https://www.example.com/sitemap.xml -o /tmp/sitemap.xml
curl -i https://www.example.com/api/v1/me/profile
```

```text
1. 发布唯一标题 A，访问首页与详情
2. 后台改成 B，在 TTL 内观察可接受旧值
3. 过期后触发再验证，再次访问确认 B
4. 从站内 Link 导航，确认 RSC 与直接打开一致
5. 两个账号检查私有响应始终 no-store 且不串用户
6. 登录、刷新恢复、退出，检查 Cookie 完整生命周期
7. 停止上游，确认代理 502 与旧公开内容策略
8. 检查 Worker 日志、R2 写入和错误率
```

{{IMG:M3-23-缓存验收}}

## 远程部署前的资源清单

| 项目 | 上线前动作 |
| --- | --- |
| Worker | 创建独立服务与环境 |
| R2 | 创建正式增量缓存桶并绑定 |
| 域名 | 配置正式域名、HTTPS 与路由 |
| 后端 | 设置生产 API_ORIGIN 与网络访问 |
| 站点 URL | 用正式 NEXT_PUBLIC_SITE_URL 重建 |
| Cookie | 验证 Secure、SameSite、Path、清除行为 |
| 回退 | 保留上一版本和域名切回方案 |

## 构建与部署命令要分开理解

```bash
pnpm build:cf       # 生成 Worker 产物
pnpm deploy:cf      # 构建并执行远程发布
```

本项目只完成了本地构建与 Worker 验收，没有执行远程资源创建、域名切换和线上发布。部署命令存在不等于部署已经发生。

## 适用边界

OpenNext 与 Cloudflare 的兼容能力会随版本变化。升级 Next.js、OpenNext 或 Wrangler 时，应重新阅读对应版本文档，并重跑构建、代理、Cookie 和缓存用例。

需要强一致发布、全球低延迟或大规模个性化时，当前 60 秒 ISR 与 R2 方案还需结合业务重新设计。

## 小结

Cloudflare 部署不是构建命令的最后一行，而是一条从 Next 产物到 Worker、Assets、R2、域名、Cookie 和后端的完整链路。

构建成功值得记录，但缓存正确、登录可恢复和公开 URL 无误，只能由目标环境的行为证据证明。

## 延伸阅读

- [数据获取与缓存](https://blog.csdn.net/fungleo/article/details/166784128)
- [质量门禁]({{LINK:M3-22}})
- [总复盘]({{LINK:M3-24}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`OpenNext`、`Cloudflare Workers`、`R2`、`ISR`、`网站部署`

### 文章简介（250 字以内）

Next build 与 OpenNext build 成功都不等于生产缓存正确。本文拆解 Worker、静态 Assets、R2 增量缓存、环境变量、正式域名、Cookie 和 HTML/RSC 一致性，并给出从 TTL 更新到双账号私有数据的目标环境验收清单。

### 建议发布分类

云计算 / Next.js / Cloudflare

### 封面短标题

构建成功不等于缓存正确

### 配图 AI 提示词

1. `M3-23-封面`：16:9 技术博客封面，Next.js 构建产物经过 OpenNext 进入 Cloudflare Worker、Assets 和 R2，终点是域名与真实用户；中文短标题“构建成功不等于缓存正确”，深蓝背景、橙色云边界，无 Logo 和水印。
2. `M3-23-部署链路`：16:9 横向架构图，源码→Next build→OpenNext→Worker/Assets/R2→域名/API/Cookie，每层标明能证明与未证明，中文清晰。
3. `M3-23-缓存验收`：16:9 时序图，版本 A 缓存、后台发布 B、TTL 过期、首访触发再验证、后续取得 B，并行展示直接 HTML 与站内 RSC 导航一致，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-04、22、24 发布后回填站内链接
- [ ] 不把本地模拟 R2 描述成远程部署完成
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中 JSON、命令与表格正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
