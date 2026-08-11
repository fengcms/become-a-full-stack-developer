# 项目长期记忆 ·《成为一个全栈开发工程师》

## 项目性质
用真实多端文章系统作素材载体，写全栈技术专栏。核心定位：文章是产品，代码是素材。文章优先，每切片成文即停，不追求生产级完备。主阵地 CSDN（`blog.csdn.net/fungleo`）；Next.js 站仅演示，不做商业化。

## 关键决策（不可随意变更）
- 技术栈：Hono + Drizzle + Cloudflare D1/R2，兼容普通 Linux（须写适配层，高价值题材 M0-03/M1-24）。
- 角色三角：member/editor/admin。注册默认 member；admin 经 `PATCH /users/{id}` 升 editor；editor 管全站内容不管用户/角色/站点配置；`level` 仅展示。
- 文章三态 draft/pending/published；会员投稿默认 pending。评论三态 approved/rejected/reviewing（reviewing 为管理员兜底态）。
- slug 可选（id 为主）；分类无限级树（`GET /categories/tree`）；阅读量防刷（去重+24h 冷却+计数写分离）；评论敏感词过滤；附件 R2 主/本地兜底（`STORAGE_DRIVER` 驱动）。
- 阅读历史唯写路径 `POST /me/history`（upsert）；`view` 只增计数。第三方登录预留 `POST /auth/{provider}/callback`（首波 501）。
- `SiteSetting` 字段：siteName/siteTitle/siteDescription/siteKeywords/logoUrl/copyright/updatedAt；端点 `GET /site/settings`（公开）+ `GET/PATCH /admin/site/settings`（admin）。
- 辅助接口（v1.10）：adjacent/related/toc/breadcrumb/categories-stats/stats/search + like(`Like`)/notifications(`Notification`)；标签云计数已由 `GET /tags` 的 `Tag.articleCount` 覆盖；RSS/sitemap/robots 不进 JSON 契约。
- 公开可见性铁律：公开 `GET /articles` 忽略 status 只返 published；未发布详情/评论对匿名 404；后台筛选走 `GET /admin/articles`。

## 文章编号体系
M0 开篇/M1 Node/M2 React/M3 Next(含会员中心)/M4 Flutter/M5 Taro/M6 Go/M7 Vue3/M8 收官/B 支线。每篇对应 git tag `article/M1-15`。仓库根 `ARTICLES.md` 做对照。

## 规模
主线 112 + 支线 14 = 126 篇（最小可交付 41 篇）；周更 2 篇，全量约 14 个月。

## 文档位置（v1.13）
- 00-项目章程 / 01-内容路线图 / 02-领域模型与API契约（均 v1.13）
- 契约 `docs/api/openapi.v1.yaml`（**1.10.0**，OpenAPI 3.1）
- 语义自查 `docs/api/check_contract.py`（双门之一）
- `docs/prd/README.md` 索引

## 契约演进与评审时间线（截止 2026-08-11）
| 轮 | 契约 | 范围 | 语义门 |
|---|---|---|---|
| v1.7 冻结 | 1.4.0 | F1–F4 错误码机器化 | 13 OK |
| v1.8 | 1.5.0 | editor 角色 + 站点配置 + Sort 带符号 | 全绿 |
| v1.10 | 1.7.0 | 辅助接口 + like/notification | 全绿 |
| 一审（后端架构师） | — | R1–R11（RBAC/幂等/字段/限流） | 不可冻结 |
| v1.11 | 1.8.0 | R1–R11 整改 | 22 OK |
| 二审 | — | N1–N6（授权求值/字段/限流） | 不可冻结 |
| v1.12 | 1.9.0 | N1–N6 整改（x-authz 自包含） | 28 OK |
| 三审 | — | N7/N8/N9（401 完整性/ownerOverride 一致/02 措辞） | 不可冻结 |
| **v1.13** | **1.10.0** | **N7/N8/N9 整改 + 语义门硬化** | **31 OK** |

## 当前基线（v1.13 / 契约 1.10.0）
- **双门全绿**：结构门 `openapi-spec-validator` → OK；语义门 `check_contract.py` → **31 OK**（53 路径 / 67 操作 / 45 schema / 46 x-authz / 21 公开 429 / 13 值错误码）。
- **机器化约束**：`x-authz`（minRole+ownerOverride）授权求值自包含（第 4 铁律，02 反向引用闭环）；`Unauthorized`(401)+`RateLimited`(429) 共享组件；`x-idempotent`/`x-cascade`/`x-max-depth`/上传约束/限流粒度均机器字段；N2 URL/展示字段约束；N7 401/403 完整性；N8 ownerOverride 一致性。语义门已覆盖 N7a/N7b/N8 与 `$ref` 响应错误码解析。
- **N1–N9 全部清零**，可作为 M1 动手前冻结基线。

## 非阻塞 TODO
1. N7c：7 个内联 401 统一为 `$ref` Unauthorized（纯风格）。
2. F2：应急集 33/35 计数复核（三处引用对齐）。
3. M1 前由非作者跑穿透式独立终审（呼应 N6 方法学）。
4. OAuth redirect 白名单 M3-09 显式声明。
5. M6-09 一致性校验增补「授权行为」断言。

## 注意事项
- 用户 FungLeo，CSDN 前端专家。文风以本项目章程第九节为准（克制结构化，区别于全局 BLOG_STYLE_GUIDE），动笔前仍读全局脱敏规则。
- 领域模型+API 契约是七端共同地基，实现不得偏离；变更先改 OpenAPI 再改实现。
- 双门校验为唯一硬地基，任何契约改动后须复跑（venv：`/Users/fungleo/.workbuddy/binaries/python/envs/default` 含 pyyaml + openapi-spec-validator）。
