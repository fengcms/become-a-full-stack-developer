# 成为一个全栈开发工程师 · 项目仓库

> 用一个真实运行的多端文章系统作素材，写一套成体系的全栈技术专栏。
> 仓库地址：<https://github.com/fengcms/become-a-full-stack-developer>

## 项目在做什么

一句话：**文章是产品，代码是素材。**

这不是“先做完系统，再顺便写文章”，而是围绕一套真实系统逐步展开，从领域建模、API 契约与后端实现，走到管理后台、网站前台和移动 App。项目追求的是能支撑文章讲清楚的工程完整度；每个实现的技术选择、验证范围和未覆盖边界，都以仓库中的代码与记录为准。

## 当前进度（2026-10-07）

| 阶段 | 实现 / 目录 | 当前状态 |
|---|---|---|
| M0 · 开篇与规划 | `articles/`、`docs/prd/` | 8 篇已发布 |
| M1 · Node 后端 | [`node-backend/`](node-backend/)、`articles/M1-*.md` | 后端实现完成；31 篇已发布；首个冻结版本为 `node-backend-v1.0`，后续维护版本见 Git tags |
| M2 · React / Vite 管理后台 | [`manage-frontend/`](manage-frontend/)、`articles/M2-*.md` | 管理后台实现完成；22 篇已发布 |
| M3 · Next.js 网站前台（含会员中心） | [`web-frontend/`](web-frontend/)、`articles/M3-*.md` | 网站前台实现完成；24 篇已发布 |
| M4 · Flutter App | [`flutter-app/`](flutter-app/)、`articles/M4-*.md` | App 实现完成，28 篇文章已写完并按评审意见优化；Android 本机验收完成，文章尚待发布 |
| M5 · Taro 小程序 | 待建 | 尚未开始 |
| M6 · Go 后端重写 | `go-backend/` 待建 | 尚未开始；目标是复用同一 API 契约 |
| M7 · Vue 3 管理后台重写 | 待建 | 尚未开始；目标是复用同一 API 契约 |
| M8 · 收官复盘 | — | 待开始 |

目前 M0–M3 共 85 篇文章已发布；M4 的 28 篇稿件在 `articles/` 中，发布后再将 CSDN 链接补入 [`ARTICLES.md`](ARTICLES.md)。M4 的 iOS 构建、真机验收、生产签名与商店发布尚未完成，具体边界见 [Flutter 交付与本机验收记录](docs/flutter-app/09-开发交付与本机验收.md)。

## 仓库结构

| 路径 | 用途 |
|---|---|
| `articles/` | M0–M4 的文章源稿；M0–M3 已发布，M4 目前为待发布稿 |
| `docs/prd/` | 项目章程、领域模型、API 契约设计和内容路线图 |
| `docs/api/openapi.v1.yaml` | 多端共用的 OpenAPI 契约，当前冻结版本 `1.11.0` |
| `docs/flutter-app/` | Flutter 产品规格、工程方案、评审、交付与缓存验收记录 |
| `docs/manage-frontend/`、`docs/web-frontend-codex/` | 管理后台与网站前台的设计、开发和验收资料 |
| `node-backend/` | Node.js API 后端，支持 Cloudflare Workers 与 Node/Linux 运行环境 |
| `manage-frontend/` | React + Vite 管理后台 |
| `web-frontend/` | Next.js 网站前台与会员中心 |
| `flutter-app/` | Flutter Android / iOS 客户端 |
| `ARTICLES.md` | 已发布文章的标题、源稿、CSDN 链接与发布状态索引 |

M1–M7 是七个实现阶段；M0 是前期规划，M8 是最终复盘，不对应独立代码库。后续阶段会按路线图顺序推进，不把尚未开始的 M5–M7 写成已交付内容。

## API 契约是多端协作的基础

- 唯一事实源：[`docs/api/openapi.v1.yaml`](docs/api/openapi.v1.yaml)，当前版本 `1.11.0`。
- 领域设计：[领域模型与 API 契约](docs/prd/02-领域模型与API契约.md)。
- 内容与阶段：[内容路线图](docs/prd/01-内容路线图.md)。
- 后端、React、Next.js 与 Flutter 复用相同的接口语义；未来的 Go 与 Vue 3 实现也以该契约为对齐目标。
- 修改契约时，先更新契约和领域说明，再同步实现与验证；不要仅为了某一个客户端悄悄改变服务端行为。

## 文章与代码如何对应

项目使用**里程碑 tag**锁定契约或实现版本，不为每篇文章单独打 tag。已存在的例子包括 `contract-v1.11.0`、`node-backend-v1.0` 和后续 Node 后端维护 tag。文章的源稿与发布链接由 `ARTICLES.md` 索引；各项目的启动和验证方式以对应目录 README、工程记录及验收文档为准。

```bash
git tag --list
git checkout <里程碑 tag>
```

## 从哪里开始

- **按专栏顺序阅读**：从 CSDN 博客 [FungLeo](https://blog.csdn.net/fungleo) 开始，或先看 [`ARTICLES.md`](ARTICLES.md) 中已发布文章的索引。
- **了解整体规划**：阅读 [项目章程](docs/prd/00-项目章程.md) 和 [内容路线图](docs/prd/01-内容路线图.md)。
- **运行某个子项目**：进入对应目录，按它自己的 README 安装依赖、配置环境并执行验证；Flutter 的命令与环境隔离说明见 [`flutter-app/README.md`](flutter-app/README.md)。
- **复核 M4 实际交付**：查看 [Flutter 开发交付与本机验收](docs/flutter-app/09-开发交付与本机验收.md) 及 [缓存优化实施与验收](docs/flutter-app/14-缓存优化实施与验收.md)。

请勿将本地测试账号、`.env` 文件、数据库或 `.local/` 测试数据用于线上环境。生产配置与平台发布需要按相应项目的部署记录单独核对。

## 作者

- 作者：**FungLeo**
- 主发布阵地：<https://blog.csdn.net/fungleo>
- 仓库持续记录文章源稿、可运行实现与工程决策；已发布状态以 `ARTICLES.md` 为准。
