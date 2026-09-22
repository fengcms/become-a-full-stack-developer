# 网站前台 · Codex 重做版

已按确认的全站设计完成开发。采用传统内容门户结构、白底、深蓝灰文字与晴蓝点缀，保持现有技术方案和 API 契约。所有工程文件均在本目录内，原前台、后端和管理后台保持不变。

## 本地运行

使用 Node.js 22.14+、pnpm 11.18.0（packageManager 已锁定）。在本目录执行：

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

访问 <http://127.0.0.1:13001>。`API_ORIGIN` 填写正在运行的后端地址，不包含 `/api/v1`；示例的 11001 是本次独立测试服务端口。正式内容从 API 获取，应用没有内置的假文章列表。

| 配置 | 用途 |
|---|---|
| `API_ORIGIN` | 服务端访问后端的根地址，仅服务端可见 |
| `NEXT_PUBLIC_SITE_URL` | 网站完整地址，用于 canonical、sitemap 和分享，构建时确定 |
| `NEXT_PUBLIC_API_BASE_URL` | 保持 `/api/v1`，浏览器经同源代理请求 |

本次验收在 `.local/test.db` 创建独立数据库，使用原后端代码运行测试实例，没有改动原数据库。当前预览中的文章、账号、封面是测试样例；切换到正式 API 后会显示正式内容。`.local/`、本机环境文件和构建产物均已忽略，不应提交。

## 页面与功能

- 首页：四级栏目、焦点切换、最新文章、120px 横幅、分类文章流、累计热门与标签侧栏。
- 浏览：全部文章、分类与标签索引/详情、文章/会员搜索、作者主页、关于页。
- 阅读：Markdown、代码复制、表格、中文目录与重复标题锚点、上下篇、相关推荐、分享、评论及回复。
- 账号：注册、登录、退出、刷新恢复、安全返回路径、资料和密码设置。
- 会员：收藏、阅读历史、点赞、文章状态、通知与已读操作。
- 状态：加载、空内容、失败重试、404、登录失效。桌面双栏，窄屏单栏与折叠菜单。

会员 access token 仅存在内存；refresh token 使用独立 `codex_refresh` HttpOnly Cookie，同一主机下不会覆盖旧前台的 Cookie。私有接口不缓存，账号切换清除私有查询。公开内容采用 60 秒重新验证，搜索实时查询。

## 首页运营配置

编辑 `config/home.ts`：

- `focusItems`：公开文章 id 或 slug，最多展示 5 篇；留空按最新文章选取，优先有封面文章。
- `editorPicks`：精选文章 id 或 slug；留空隐藏该模块。
- `banner.image` / `mobileImage`：桌面/手机横幅，建议桌面 1200×120、手机 750×240（2 倍图）；显示高度均为 120px。
- `banner.href` / `alt`：跳转地址和可访问说明。无图片时显示浅蓝站内系列导读。

资源可放 `public/` 并用根路径引用，或使用可信 HTTPS 图片地址。焦点和精选只选择公开可读文章，失效配置自动跳过。站名、Logo、描述、关键词和版权读取现有后台站点设置。

## 检查与构建

```sh
pnpm gen:api
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

类型生成只读 `../docs/api/openapi.v1.yaml`，输出 `types/api.gen.ts`；生成工具单独使用 TypeScript 5.9.3，应用仍使用 TypeScript 7。首次生成需要安装固定版本工具到 `.local/typegen/`。Node 22 的原生 TypeScript 测试会显示实验性功能提示，不影响测试结果。

`node scripts/integration-test.mjs` 仅用于本次独立测试后端，会创建测试会员、草稿和评论。运行前务必确保 13001 的 `API_ORIGIN` 指向独立 11001 测试实例。Worker 版本使用 `PREVIEW_PORT=13002 node scripts/integration-test.mjs`。`node scripts/smoke-test.mjs` 只读检查两个本地服务，需同时启动。测试样例初始化脚本为 `scripts/seed-preview.py`，不是正式环境数据迁移。

## Cloudflare 本地预览与部署准备

```sh
cp .dev.vars.example .dev.vars
pnpm build:cf
pnpm exec wrangler dev --local
```

本地 Worker 地址为 <http://127.0.0.1:13002>。已配置独立 Worker `web-frontend-codex`、R2 绑定 `NEXT_INC_CACHE_R2_BUCKET`（桶名 `web-frontend-codex-cache`）及直接重新验证队列。`--local` 使用本地模拟桶，不创建远程资源。

正式部署前，需要另行准备独立 R2 桶、生产后端地址与网站域名，并用生产 `NEXT_PUBLIC_SITE_URL` 重新构建。部署命令已保留，但本次没有执行部署、远程资源创建或域名切换。不要将包含本地样例的构建产物直接用于正式站点。

## 交接文档

- [设计与工程方案](docs/01-设计与工程落地方案.md)
- [开发计划完成情况](docs/02-开发计划与验收清单.md)
- [全站设计确认记录](docs/03-全站页面设计评审.md)
- [实施记录与接口差异](docs/04-实施记录.md)
- [验收报告与截图](docs/05-验收报告.md)
