# 领域模型与 API 契约 v1 · 文章系统

| 项 | 内容 |
|---|---|
| 文档版本 | v1.12 |
| 状态 | 已确认（v1.12：二次评审 N1–N6 整改——**授权求值机器化（x-authz 重构）**：46 个需登录端点的 `x-required-roles` 列表 + 6 个 `x-owner-resource` 字符串合并为结构化 `x-authz: {minRole, ownerOverride:{param, ownerField}}`；`ownerField` 用真实字段（article→authorId / comment&attachment→userId / notification→userId，并为 Notification 补 `userId`）；第 4 铁律改写为**自包含求值规则**（删除"详见 02"，仅凭 OpenAPI 即可确定性推出授权结果）；`submitArticle` 由 [member] 收紧为 minRole:admin + ownerOverride（防任意 member 越权提交）。**N2 字段约束统一**：URL 类（coverImage/redirectUri/logoUrl/avatar/url/link）统一 `format: uri + maxLength: 512`；反范式展示字段（authorName/categoryName/userName/rejectedReason/body）补 `maxLength`。**N5 限流粒度**：`x-rate-limit` 加 `scope: per-endpoint` + `key: client`。语义门新增 R1 授权求值 / N2 字段约束 / N5 限流粒度断言（22→28 条 OK）。契约 1.8.0→1.9.0。前序 v1.11：后端架构师评审 R1–R11 整改） |
| 最后更新 | 2026-08-11 |
| 上游文档 | [00-项目章程](./00-项目章程.md) |
| 机器可读契约 | [../api/openapi.v1.yaml](../api/openapi.v1.yaml)（契约版本 1.9.0） |
| 契约校验 | `python -m openapi_spec_validator docs/api/openapi.v1.yaml`（结构） + `python docs/api/check_contract.py`（语义自查） |

---

## 一、为什么这一步必须先做

本项目有七个子项目：Node 后端、React 管理后台、Next.js 网站、Flutter App、Taro 小程序、Go 后端重写、Vue3 后台重写。

它们的依赖关系里，只有一样东西是刚性的：

- Go 后端要实现**和 Node 后端完全一致的接口**
- Vue3 后台要对接**和 React 后台完全一致的接口**
- Flutter 与 Taro 复用同一套 API

也就是说，**API 契约和领域模型是整个工程唯一的硬地基**。它一旦在第一波定歪，后面六个子项目全部返工。其余一切（ORM 选型、UI 库、目录结构、状态管理）都允许边做边改，改动本身还是好素材。

因此，在写第一行业务代码之前，先定下：

1. 系统有哪些实体、它们之间什么关系（领域模型）
2. 这些实体对外暴露成哪些接口、长什么样（API 契约）

这套契约用 OpenAPI 3.1 维护在 `docs/api/openapi.v1.yaml`，是独立于任何实现的单一事实来源。契约变更必须先改 OpenAPI 文档，再改实现；各端请求层类型尽量由 OpenAPI 自动生成，避免手写漂移。

### 契约的两道校验门（缺一不可）

第二轮评审踩过一个坑：用宽松 YAML 解析器"校验通过"，实际漏掉了非法嵌套。第三轮又暴露出更深一层的问题——**结构合法不等于逻辑无漏洞**。所以现在固定两道门，改契约后都要跑：

| 门 | 命令 | 保证什么 | 保证不了什么 |
|---|---|---|---|
| 结构门 | `python -m openapi_spec_validator docs/api/openapi.v1.yaml` | 符合 OpenAPI 3.1 规范 | 状态机是否闭环、实体是否有端点 |
| 语义门 | `python docs/api/check_contract.py docs/api/openapi.v1.yaml` | `$ref` 可解析、200 有 schema、operationId 全量唯一、**无孤儿 schema**、**枚举态均有写入路径**、sort 已枚举、可选鉴权写法正确 | 业务语义是否合理（仍需人评审） |

> 语义门是第三轮整改的产物。它上线后立刻抓出一个人工评审没发现的孤儿 schema（`ErrorDetail`，与 `ValidationError` 重复且无端点引用），已删除。这类脚本本身就是 M1-20（接口文档自动化）和 M6-09（契约一致性校验）的现成素材。

---

## 二、领域模型（实体与关系）

### 2.1 实体关系总览

```
┌─────────┐       ┌──────────┐       ┌────────┐
│  User   │───1:N─▶│ Article  │─N:N──▶│  Tag   │
│ (作者/会员)│      │ (文章)    │       └────────┘
└─────────┘       └────┬─────┘
      │ 1:N            │ 1:N
      ▼                ▼
┌──────────┐      ┌──────────┐       ┌──────────┐
│ Comment  │      │ Category │─N:1─▶│ Category │  (自关联，支持层级)
│ (评论)    │      │ (分类)    │       │ (父分类) │
└──────────┘      └──────────┘       └──────────┘

┌──────────┐      ┌────────────┐      ┌────────────┐
│ Favorite │◀─N:1─│   User     │─1:N─▶│ ReadingLog │
│ (收藏)    │      │           │      │ (阅读历史)  │
└──────────┘      └───────────┘      └────────────┘

┌──────────┐
│ Attachment│  (上传的附件/图片，挂在文章或用户下)
└──────────┘
```

### 2.2 实体说明

#### User（用户 / 作者 / 会员）

系统里只有一类账户。通过 `role` 区分后台管理员/作者与普通会员，通过 `status` 控制启用禁用。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint（整数主键） | 主键；本期不采用 uuid，详见下文「主键类型口径」 |
| username | string | 登录名，唯一 |
| email | string | 邮箱，唯一，用于注册与找回 |
| password_hash | string | 密码哈希（bcrypt/argon2），绝不落明文 |
| nickname | string | 展示名 |
| avatar | string? | 头像 URL |
| role | enum | `admin` / `editor` / `member` |
| status | enum | `active` / `disabled` |
| level | int | 会员等级，**仅展示用、无业务功能**；默认 1；在会员公开主页呈现 |
| created_at | datetime | |
| updated_at | datetime | |

> 设计取舍：不做多租户，单站点单管理员起步。会员中心与后台共用同一套用户表，靠 `role` 区分权限，而不是拆成两张表——这能最大化"同一套 API 服务多端"的复用率。

> **主键类型口径（R13 澄清）**：所有实体主键统一为**整数自增**。在 Cloudflare D1 / SQLite 下为 `INTEGER`，在 PostgreSQL 下为 `BIGINT`；本期不引入 uuid。OpenAPI 契约中统一以 `integer` 表达，实现层按所用数据库适配，避免 D1 与 PG 之间摇摆。

> **角色边界、会员等级与注册默认角色（N13/N14/N20）**：注册默认角色 `member`。`admin` 经 `PATCH /users/{id}`（可改 `role` / `status` / `level`）将 `member` 晋升为 `editor`。三角色权限分层：
> - `member`：普通会员，仅阅读与评论，不能发布内容（创建文章传入 `published` 会被降级为 `pending`）。
> - `editor`：内容编辑，拥有全站内容管理权——文章的创建/编辑/发布、评论的审核与删除、分类与标签管理；但**不可**管理用户、变更他人角色、重置密码、改站点配置（这些仅 `admin`）。这是「权限管理」可演示的边界：`editor` 调用用户管理类端点会吃 403。
> - `admin`：后台管理员，含 `editor` 的全部内容权 + 用户/角色/站点配置等系统权。
>
> 会员 `level` **仅展示用、无业务功能**，默认 1，本期仅由 `admin` 经上述端点手动上调，普通流程不会自动变化——读者不应误以为有自动升级逻辑。
>
> **授权求值权威（v1.12 澄清）**：角色边界的**具体求值算法**（min-role OR owner-override）以 OpenAPI `info.description` 第 4 铁律为唯一权威，且该规则自包含、不引用本文档——七端实现只需读契约即可产出一致的授权结果。本节为上溯性说明，不得与第 4 铁律冲突；若歧义，以契约为准。

#### Article（文章）

系统的核心实体。内容存 Markdown 源文，渲染由前端负责。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| title | string | 标题 |
| slug | string? | URL 别名，**可选**。留空时前台用 `id` 路由（`/articles/123`）；手动填写则需唯一，用于更友好的 URL |
| summary | string? | 摘要，列表页与 SEO 用 |
| content | text | Markdown 源文 |
| cover_image | string? | 封面图 URL |
| author_id | bigint | 外键 → User.id（文章作者，任意角色均可；与已删除的 `author` 角色无关，仅为「写这篇文章的人」） |
| category_id | bigint? | 外键 → Category.id，一篇文章归属一个分类 |
| status | enum | `draft` / `pending` / `published` |
| view_count | int | 阅读量，只读，由接口递增；递增带防刷去重（见 §2.4） |
| published_at | datetime? | 发布时间，用于排序与展示 |
| created_at | datetime | |
| updated_at | datetime | |

> 一篇文章只挂一个分类、多个标签。这是刻意的简化：多分类在内容量少时收益低、查询复杂，后期要加再扩。标签走多对多中间表。

> **slug 唯一约束与软删除的共存（R10）**：文章删除为软删除（不物理删行）。若对 `slug` 建全局唯一索引，被删文章的 slug 将永久占用、无法重建或重发同标题。解决方案：唯一约束只作用于「未删除」行——PostgreSQL / SQLite 均支持**部分唯一索引** `CREATE UNIQUE INDEX uq_article_slug ON articles(slug) WHERE deleted_at IS NULL`；会员投稿被拒 / 下架后重发同标题时，旧行 `deleted_at` 非空，新行即可复用该 slug。此解法在 M1-15（文章 CRUD 与状态机）落地。

#### Category（分类）

**无限级树形结构（自关联）**。虽然多数小站点用不到多级分类，但作为教学点我们实现完整递归树，而非只支持一层或两层。

- 数据层：用 `parent_id` 自关联即可表达任意层级，不预计算 `path` / `level`（避免写入复杂度）。
- 查询层：提供 `GET /api/v1/categories/tree` 一次性返回整棵树（后端递归或扁平表在内存中构建）；同时保留 `GET /api/v1/categories` 平铺列表，供后台表单的级联选择器使用。
- 前端：拿平铺列表 + `parent_id` 在客户端用一次 `reduce` 构树，不依赖后端递归。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| name | string | 名称 |
| slug | string | 别名，唯一 |
| description | string? | 描述 |
| parent_id | bigint? | 外键 → 自身.id，顶层为 null（无限级） |
| sort_order | int | 同层级排序 |
| created_at | datetime | |

> **删除语义（N8）**：`DELETE /api/v1/categories/{id}` 删除前须无子分类且无文章归属该分类，否则返回 `409`（code 3002）。不允许级联删除，需调用方先迁移子节点与文章。

> **成环防护（P5 类沉默点补齐）**：`PUT /api/v1/categories/{id}` 变更 `parentId` 时，后端必须校验**不产生环**——不能把一个节点挂到它自己的子孙下面，否则整棵树的递归查询会死循环。违反返回 `409` / code 3002。这是无限级自关联树最经典的陷阱，契约不写死，Node 与 Go 一定有一个会漏掉。M1-25 专门讲这个校验怎么写（向上回溯父链 vs 预计算路径）。

#### Tag（标签）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| name | string | 名称 |
| slug | string | 别名，唯一 |
| created_at | datetime | |

> **删除语义（N8）**：`DELETE /api/v1/tags/{id}` 删除前须先清除 `ArticleTag` 关联（无文章引用该标签），否则返回 `409`（code 3002，避免孤儿中间表行）。

> **补齐更新端点（第三轮自查发现）**：原契约里标签只有「增 / 查 / 删」，而删除又被 409 保护。结果是**一个已被文章引用的标签，既改不了名（无更新端点）也删不掉（有引用）**，成为永久不可维护的死数据。现补 `PUT /api/v1/tags/{id}`（改 name / slug，slug 冲突 409）。这属于评审报告 P2「孤儿实体」的同类问题——实体生命周期不完整，只是它表现为「改不动」而非「建不出」。

#### ArticleTag（文章-标签关联，多对多）

| 字段 | 类型 | 说明 |
|---|---|---|
| article_id | bigint | 外键 |
| tag_id | bigint | 外键 |

#### Comment（评论）

楼中楼结构，`parent_id` 为 null 表示一级评论。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| article_id | bigint | 外键 → Article.id |
| user_id | bigint | 外键 → User.id |
| parent_id | bigint? | 外键 → 自身.id，null 为一级 |
| content | text | 内容 |
| status | enum | `reviewing` / `approved` / `rejected`（三态的进出路径见 §2.5） |
| rejected_reason | string? | 拒绝原因，`approved` 时清空 |
| created_at | datetime | |

> **删除语义（N16）**：`DELETE /api/v1/comments/{id}` 删除评论时**级联删除其所有子回复**（`parent_id` 指向它的行一并删除），避免孤儿回复。

#### Favorite（收藏，会员中心）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 外键 |
| article_id | bigint | 外键 |
| created_at | datetime | |

#### ReadingLog（阅读历史，会员中心）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 外键 |
| article_id | bigint | 外键 |
| last_read_at | datetime | 最后阅读时间 |
| progress | int | 阅读进度百分比（0-100），可选 |

> **写入路径（N4）**：阅读历史**唯一**的写入端点为鉴权端点 `POST /api/v1/me/history`（upsert `last_read_at` 与可选 `progress`）。`POST /api/v1/articles/{id}/view` 只递增 `view_count`、不写 ReadingLog——两个职责分离，避免"阅读历史功能不可实现"。详见 §2.4。

> **删除路径（P18）**：补 `DELETE /api/v1/me/history/{articleId}`（删单条）与 `DELETE /api/v1/me/history`（清空）。阅读历史是典型的隐私数据，"只能写不能删"在 M3-10（会员中心：C 端数据建模与隐私）里会自打嘴巴。两个端点都做**幂等**——删不存在的记录同样返回 200。

#### Attachment（附件 / 上传资源）

**契约的一等实体，不是内部影子表。**（第三轮复审 P2 整改）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 外键，上传者。由令牌推断，不由客户端传入 |
| article_id | bigint? | 外键，可选关联。由上传表单的 `articleId` 字段写入（编辑器内上传场景） |
| url | string | 存储地址 |
| storage | enum | 实际存储后端：`r2` / `local`（见 §2.6） |
| mime_type | string | 如 image/png |
| size | int | 字节 |
| created_at | datetime | |

> **为什么要改（P2）**：原契约里 `POST /upload` 返回的是内联对象 `{url, storage}`，全契约没有任何端点产出或返回 `Attachment`。于是模型里定义了 `id / mime_type / size / article_id`，契约里却永远无处落地——读者写 M1-18 时只能自己猜"要不要建这张表"。现整改为：
>
> | 生命周期 | 端点 |
> |---|---|
> | 创建 | `POST /api/v1/upload` → 返回完整 `Attachment`（含 id / mimeType / size / storage） |
> | 关联 | 上传表单可选字段 `articleId`（给 `article_id` 一条真实写入路径，而非悬空字段） |
> | 读取 | `GET /api/v1/me/attachments`（分页，同时是编辑器「素材库」数据源，M2-10） |
> | 删除 | `DELETE /api/v1/attachments/{id}`（上传者本人或 admin） |
>
> 删除时**先删表行、再尽力删底层对象**；底层删除失败只记日志、不回滚行删除——这是双存储适配层的真实边界（本地磁盘删得掉、R2 可能超时），M1-24 会讲为什么不追求强一致。

#### SiteSetting（站点基础配置）

站点级基础配置，单条记录。承载站点名称、标题、描述、关键词、Logo、版权等前台展示与 SEO 所需信息，是「一个真实站点」不可缺的一块；也是演示「后台设置 → 前端消费」数据流的绝佳题材（admin 经 PATCH 更新，前台经公开端点读取）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键（恒为 1，单条配置） |
| site_name | string | 站点名称（品牌短名，页头/Logo alt/文章页标题拼接用） |
| site_title | string? | 站点标题（浏览器标签/SEO `<title>` 主页默认标题；文章详情页由前端拼接为「{文章标题} · {site_name}」） |
| site_description | string | 站点描述（SEO meta description / 页脚简介） |
| site_keywords | string? | 站点关键词（meta keywords，逗号分隔，如「全栈,前端,React」） |
| logo_url | string? | Logo 图片地址（经上传端点获得） |
| copyright | string? | 版权信息（页脚展示，如「© 2026 成为全栈开发工程师」） |
| updated_at | datetime | 最后更新时间 |

- 公开读取：`GET /api/v1/site/settings`（无需登录，供页头/页脚/SEO）。
- 后台读写：`GET /api/v1/admin/site/settings`（取全量回填）、`PATCH /api/v1/admin/site/settings`（字段可选，仅传变更项；仅 `admin`）。
- Logo 不在此端点内上传，先走 `POST /upload` 拿到 URL 再写入 `logo_url`。

#### Like（点赞，会员互动）

文章点赞记录。一条 `(user_id, article_id)` 唯一，幂等（重复点赞不报错）；`article.like_count` 由触发器或应用层维护，与 `Like` 表行数一致。仅登录会员可操作。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 点赞者，由令牌推断 |
| article_id | bigint | 被赞文章 |
| created_at | datetime | 点赞时间 |

- 端点：`POST /api/v1/articles/{id}/like`（点赞，幂等）、`DELETE /api/v1/articles/{id}/like`（取消，幂等）、`GET /api/v1/articles/{id}/like/status`（当前用户点赞态 + 总赞数，公开）、`GET /api/v1/me/likes`（我的点赞列表）。
- `Article` / `ArticleSummary` 已加 `likeCount` 字段，由该表聚合得出。

#### Notification（通知）

系统事件（评论审核通过、文章发布等）由服务端生成，客户端不可直接创建。仅本人可读取 / 标记已读。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| type | enum | `article_published` / `comment_approved` / `system` |
| title | string | 标题 |
| body | string? | 正文 |
| link | string? | 跳转链接（如 `/articles/{id}`） |
| is_read | bool | 是否已读 |
| created_at | datetime | |

- 端点：`GET /api/v1/me/notifications`（列表，支持 `isRead` 筛选）、`GET /api/v1/me/notifications/unread-count`（未读数）、`POST /api/v1/me/notifications/read-all`（全部已读）、`PATCH /api/v1/me/notifications/{id}`（标记已读，仅本人）。
- 通知之外，RSS / sitemap / robots 等 SEO 格式输出**不进 JSON 契约**——属 M3 实现笔记（在 Next.js 端以非 OpenAPI 方式落地），详见 §五 注。

### 2.3 文章状态机（会员投稿审核流）

为维持一个**极简的状态机**，文章 `status` 只有三个值：

| 状态 | 含义 | 可见性 |
|---|---|---|
| `draft` | 作者本人的草稿 | 仅作者自己 |
| `pending` | 会员投稿后、待管理员审核 | 仅作者与管理员 |
| `published` | 已审核 / 已发布 | 所有人（进入公开列表与详情） |

**默认状态规则（核心）：**

- 会员通过 `POST /api/v1/articles` 创建文章：传 `pending` 即进入待审，传 `draft`（或不传）则为草稿。**会员无法直接创建 `published`**。
- 管理员创建文章可直接 `published`（管理员发布即已审核）。
- 会员把 `draft` 提交为 `pending`：`POST /api/v1/articles/:id/submit`。
- 管理员审核 `pending`：`POST /api/v1/admin/articles/:id/approve` → `published`。
- 下架：`published` → `draft`，由 `POST /api/v1/admin/articles/:id/status` 统一置位。

**合法状态转移：**

```
draft --会员提交--> pending --管理员审核通过--> published
draft ---------------管理员直接发布---------------> published   (仅 admin)
published --下架(status)--> draft                  (仅 admin)
pending   --管理员退回(status)--> draft            (仅 admin)
published --作者编辑自己的已发布文章--> pending      (自动，需重新审核)
```

> **权限约束（与 OpenAPI `ArticleCreate.status` 一致）**：`member` 创建文章时若传入 `published`，后端**忽略并降级为 `pending`**（会员无法直接发布）；`editor` 与 `admin` 可将文章直接置为 `published`。该约束写入契约，前端无需自行拦截，生成代码即知。
>
> **slug 的同规格约束（P8）**：原契约只给 `status` 写了"member 传入则忽略降级"，`slug` 却只写了"仅管理员可指定"，**没说 member 传了会怎样**——是忽略、报错还是照收？实现者只能自由发挥。现与 `status` 对齐并写死：**member 传入 `slug` 时后端一律忽略**（创建留空、更新保持原值），不报错也不写入；`editor` 与 `admin` 可直接指定。slug 重复返回 409 / code 3002，命中预留路径黑名单返回 400 / code 4001。

**转移合法性矩阵（P14 · 消除"错误前态"的沉默）**

原契约没说"对 `published` 文章调 `submit` 会怎样"，两个后端必然分歧。现在逐格写死：

| 端点 | 合法前态 | 非法前态的行为 |
|---|---|---|
| `POST /articles/:id/submit` | 仅 `draft` | `pending` / `published` → **409 / code 3003**，不静默幂等 |
| `POST /admin/articles/:id/approve` | 仅 `pending` | `draft` / `published` → **409 / code 3003** |
| `POST /admin/articles/:id/status` | 任意（admin 万能置位） | 目标态与当前相同 → **幂等 200** |

> 为什么 submit / approve 选 409 而不是幂等 200：这两个是**业务动作**，前态不对说明前端状态过期（比如两个管理员同时点审核），静默成功会掩盖并发问题；而 `status` 是**声明式置位**（"我要它变成 X"），幂等才符合直觉。这个区分本身就是 M1-15 的讲点。

> **编辑已发布文章的副作用（自查补充）**：`PUT /articles/:id` 原本完全没说会不会影响 `status`。现定死：**`member` 编辑自己已 `published` 的文章，保存后自动退回 `pending` 需重新审核**；`editor` 与 `admin` 编辑不改变状态。理由是投稿制系统里"发布后随意改内容"等于绕过审核。这条不写，Node 与 Go 各写一半，M6-09 的对照测试还查不出来（结构相同、行为不同）。

> 设计取舍：刻意**去掉 `archived`**。v1 只需"草稿 / 待审 / 已发布"三态即可讲清投稿审核的全部后端要点；归档是内容运营动作，与"讲清全栈"无关，留作后续扩展或专题。这个状态机是系列"后端状态机设计"专题（M1-15）的天然素材。

---

### 2.4 阅读量防刷机制（view_count 去重）

阅读量是内容运营的关键指标，但也最容易被刷。设计要点：

- **计数与写分离**：`view_count` 仍是 Article 上的展示字段，但它的递增**不经过主表 UPDATE**，而是写入独立的计数记录（以「去重键 + 冷却时间戳」建立唯一约束）。插入成功 → 展示计数 +1；唯一约束冲突（窗口内重复访问）→ 忽略。这既避免热点行行锁竞争，又不引入消息队列/异步聚合——与 Non-goals「不追求高并发架构、不做消息队列」严格一致。
- **去重键**：登录用户按 `user_id` 去重；匿名用户按 `ip + user_agent` 的哈希去重。契约层面 `POST /api/v1/articles/{id}/view` 声明为**可选鉴权**，写法见 §3.3——携带 Bearer 则按 `user_id` 去重，否则退化为 `ip+ua` 哈希。
- **冷却窗口**：同一去重键在窗口内（默认 24 小时）重复访问不重复计数。
- **触发端点**：`POST /api/v1/articles/:id/view` 带防刷地计数；详情接口不再隐式自增，便于前端精确控制（如阅读满 N 秒后才上报）。仅 `published` 文章可计数，draft/pending 一律 404（含作者本人）——否则计数接口会变成"探测未发布文章是否存在"的旁路。
- **教学价值**：去重键设计、冷却窗口、计数写分离，是"指标类字段"的经典后端考题，单篇即可讲透。

> 不引入 Redis 等外部依赖（Non-goals：不追求高并发架构）。用"唯一约束 + 冷却时间戳"即可在单实例 / 边缘函数上成立，复杂度可控。对应 M1 新增篇目「阅读量防刷专题」。

### 2.5 评论内容安全：脏话 / 违禁词过滤

评论审核不能靠人工逐条看。设计一套"自动过滤 + 自动判定"：

- **敏感词字典**：维护一份词表（配置文件 `sensitive-words.txt` 或 DB 表），支持精确词与可选的前缀 / 正则规则。
- **过滤动作**：扫描内容，命中即替换为**等长 `*`**（如"垃圾"→"**"）；无论最终是否通过，落库与对外展示的都是转义后的版本。
- **违规比率**：`违规字符数 / 总字符数`（或违规词数 / 总词数）得到比率，阈值默认 **10%**，可配置。
- **自动判定**：
  - 比率 > 阈值 → `status = rejected`（不展示，返回拒绝原因，如"含过多不当内容"）
  - 比率 ≤ 阈值 → `status = approved`（展示转义后的内容）
- **人工兜底态 `reviewing`**：管理员可手动把某条 `approved` / `rejected` 评论置为 `reviewing` 进入人工复核；正常自动流不产生 `reviewing`。评论 `reviewing` 与文章 `pending` 同名异义，特此区分（评论为「人工复核中」，文章为「待管理员审核」）。
- **教学价值**：敏感词匹配（Trie / Aho-Corasick）、等长替换、比率阈值判定、状态机兜底，是"内容安全"最朴素也最实用的入门。

> 仅做关键词过滤，**不做语义级审核**（超出本项目复杂度）。它的定位是"降低明显违规"，不是"保证 100% 合规"。对应 M1 新增篇目「评论内容安全专题」。

#### `reviewing` 的进出路径（P1 · 原本是 100% 不可达的死胡同）

第三轮复审指出一个硬伤，且完全成立：上面这段散文写着"管理员可手动置为 `reviewing`"，但契约里评论**只有一个 `DELETE` 端点**。也就是说 `reviewing` 既进不去（无置位端点）、也出不来（无移出端点），自动流又不产生它——它在 API 层面 100% 不可达。读者照契约实现，只能写出一个自己文档批评过的反例。

现补齐两个端点，闭环如下：

```
发表评论 ──自动流──> approved  或  rejected      (自动流永不产生 reviewing)
                        │              │
                        └──── admin ───┴──> reviewing      PATCH /comments/:id/status
                                   ▲                 │
                                   └─────────────────┘
                        reviewing ──admin──> approved / rejected
```

| 职责 | 端点 | 权限 | 说明 |
|---|---|---|---|
| 发现待复核 | `GET /api/v1/admin/comments?status=reviewing` | editor/admin 全部 | `reviewing` / `rejected` 的**唯一读取路径** |
| 人工置位 | `PATCH /api/v1/comments/:id/status` | 仅 admin | `reviewing` 的**唯一进出路径**；置为同一状态时幂等；置为 `approved` 时清空 `rejected_reason` |

**评论列表返回哪些状态（P6 · 原本契约沉默）**

| 端点 | 返回的 status | 对谁都一样吗 |
|---|---|---|
| `GET /articles/:idOrSlug/comments`（公开） | **仅 `approved`** | 是。匿名、评论作者本人、文章作者、admin 全都只看到 approved |
| `GET /admin/comments`（管理视图） | 可按 `status` 筛选，不传返回三态 | 否，按角色限定可见范围 |

> 刻意不给"评论作者本人能看到自己被拒的评论"开后门：一旦按调用者身份改变列表内容，公开列表就有了缓存与 CDN 的坑（同一 URL 不同人不同结果），得不偿失。

**被拒评论的"闪现后消失"（P17 · UX 预期）**

`POST /comments` 对违规内容返回 `status=rejected` + `rejectedReason`，但后续 `GET` 列表不返回 rejected——用户会看到"提交后出现一次、刷新就没了"。这是**预期行为**，前端必须配合：收到 `rejected` 时**不要把该条插入列表**，改为就地提示"内容未通过审核，不会公开展示"，并保留原文让用户修改重发。M3-11 讲这个交互，反面教材是"乐观更新无脑插入列表"。

### 2.6 附件存储策略：R2 为主，本地兜底

附件存储走**适配层**，同一套上传接口在两种部署目标下都能工作：

- **主路径 Cloudflare R2**：生产 / 边缘部署时，文件直传或经后端签名直传 R2，`url` 返回 R2 公共访问地址。
- **兜底路径本地磁盘（Linux）**：自管服务器部署时，文件落到本地磁盘（或挂载卷 / 兼容 S3 的 MinIO），`url` 返回本站可访问路径。
- **`storage` 字段**：Attachment 记录本次实际使用的后端（`r2` / `local`），便于排查与迁移。
- **配置驱动**：`STORAGE_DRIVER=r2|local` 决定走哪条实现，业务代码不感知差异。
- **上传返回完整实体**：`POST /api/v1/upload` 返回 `Attachment`（含 `id` / `mimeType` / `size` / `storage`），不再只返回 `{url}`。这样 `storage` 字段"记录实际后端"的承诺才在契约上兑现——否则调用方根本拿不到它（P2）。

> 与 M1-18（文件上传双实现）和 M1-24（一套后端双部署适配层）直接对应，是"同一份代码、两种部署目标"在存储层的具体落地。

## 三、API 设计原则

| 原则 | 规定 |
|---|---|
| 风格 | RESTful，面向资源，名词复数（`/articles`），不用动词 |
| 版本 | 路径版本化 `/api/v1`，破坏式变更才升 v2；契约 `info.x-api-version` 记录当前主版本（=1），供网关 / 文档聚合识别 |
| 废弃策略 | 仅允许**向后兼容**的增量变更落在 v1（加字段、加端点、放宽约束）；任何破坏式变更（删字段、改语义、改错误码含义）必须升 `/api/v2` 并保留 v1 过渡期。废弃端点/字段在契约 `deprecated: true` 标记 + 本文档 §变更记录登记，过渡期内新旧并存，到期移除 |
| 传输 | JSON；`Content-Type: application/json`；时间用 ISO 8601 字符串 |
| 认证 | `Authorization: Bearer <access_token>`（短时效，前端存内存非 localStorage）；刷新令牌 `refreshToken` 双载体：浏览器走 HttpOnly+SameSite Cookie、移动端返回请求体由安全存储保存（详见下「认证与刷新令牌」） |
| 分页 | 偏移分页 `?page=&pageSize=`，列表统一返回 `{ list, pagination }` |
| 过滤 | 列表支持 `?category=`、`?tag=`、`?keyword=`，按前文「机器强制约束清单」口径匹配；`status` 仅用于鉴权后台列表 `GET /admin/articles`，公开 `GET /articles` 忽略 `status`（见「公开内容可见性铁律」） |
| 排序 | 带符号字段名：`publishedAt` 表正序、`-publishedAt` 表倒序；白名单字段：`publishedAt` / `viewCount` / `createdAt`（前缀 `-` 表示倒序） |
| 命名 | 小驼峰字段名（与 JSON 习惯一致），`snake_case` 亦可，前后端约定一致即可 |

### 公开内容可见性铁律（N2 · 安全与正确性的服务端约束）

这是契约层的**硬规则**，不能只靠本文一句标签——已在 OpenAPI 中落地：

- **公开列表只返回 `published`**：`GET /api/v1/articles` 等公开列表端点忽略 `?status=` 参数，强制只返回 `published` 文章；后台管理所需的 `draft`/`pending` 筛选由鉴权端点 `GET /api/v1/admin/articles` 提供（其 `status` 参数仅对 `editor`/`admin` 生效）。
- **未发布详情对匿名返回 404**：`GET /api/v1/articles/{idOrSlug}` 与 `GET /api/v1/articles/{idOrSlug}/comments` 对匿名用户，若文章为 `draft`/`pending` 直接返回 404；仅作者本人与 `admin` 可见未发布详情与评论。
- **后果**：任何照本契约实现的后端都不会把草稿/待审内容暴露给匿名用户，与 B-11（Web 安全基础）自洽，不会因为"照着教程写"反而写出被自己批评的反例。

### 路由、跨域与认证补充约定

#### 认证与刷新令牌（R4 定稿）

- **access token**：短时效（默认 15 分钟），置于 `Authorization: Bearer`，前端存于**内存**（页面刷新即失效，需借 refresh 续期），**绝不存 localStorage**（防 XSS 窃取）。
- **refresh token**：双载体，覆盖所有端型——
  - 浏览器端：登录 / 刷新响应 `Set-Cookie` 写入 `refreshToken=...; HttpOnly; SameSite=None; Secure`（跨站场景必须 `None`），刷新时由浏览器自动携带；
  - 移动端（Flutter / Taro）：响应体返回 `refreshToken` 字段，存于系统安全存储（Keychain / 微信安全存储），刷新时置于请求体 `RefreshRequest.refreshToken`。
- `POST /auth/refresh` 读取优先级：**Cookie 优先，缺失则取请求体**；两者皆无 → 401（code 1003）。`AuthResult` 已含 `refreshToken` 字段，契约自洽。
- 此设计直接决定 M1-12（JWT 还是 Session）、M1-13（注册登录全流程）、M2-07（无感刷新竞态）的实现写法。
- **登录/注册端点须加入前端拦截器白名单（R19 决议，持久化）**：`/auth/login`、`/auth/register`、`/auth/refresh` 返回 401（用户名密码错误 / 令牌失效）时，**不触发**「跳登录页」拦截逻辑——否则用户还没登录就被踢去登录页，形成死循环。该约定在 M2-03（拦截器与错误处理）必须讲透。
- **登出清 Cookie 闭环（N11）**：`POST /auth/logout` 除返回 200 信封外，浏览器端须通过响应头 `Set-Cookie: refreshToken=; HttpOnly; SameSite=None; Secure; Max-Age=0` 清除 refreshToken；移动端清除本地安全存储。登出不完整（漏清 Cookie）会让旧令牌继续可用。
- **`SameSite=None` 的 CSRF 权衡（N12）**：refresh / logout 用 `SameSite=None; Secure` 才能跨站自动携带，但因此会随跨站请求发送，存在 CSRF 面（主调用依赖 Bearer 头而非 Cookie，实际影响有限）。教学项目应点出此权衡，并建议 refresh / logout 端点加双重提交令牌或自定义头防护。
- **第三方登录扩展点（N5）**：`POST /api/v1/auth/{provider}/callback`（provider ∈ wechat/weibo/github）为第三方登录授权回调入口，将第三方身份归并到统一 User 体系（新用户按 `provider+openid` 自动建号、默认 `member`）。第一波 Node 后端可先返回 501 占位，M3-09 统一讲解设计模式与对接——契约预留，保证前后端不漂移。

#### CORS 与跨域凭证（R8）

七端（React SPA / Vue / Next.js / Flutter / Taro）调同一套 API，但部署拓扑不同：

| 端 | 是否受 CORS 限制 | 凭证方案 |
|---|---|---|
| Next.js 前台（同域反代） | 否（服务端代发或同域） | Bearer，无需跨域 |
| React / Vue 管理后台（独立域） | 是 | 需 `Access-Control-Allow-Credentials: true` + 前端 `fetch` 带 `credentials: 'include'`；Cookie 须 `SameSite=None; Secure` |
| Flutter / Taro 原生 | 否 | 无浏览器同源策略，Bearer + 请求体 refreshToken |

> 无感刷新的「并发竞态」（多个请求同时 401 触发多次 refresh）在 M2-07 专门讲。CORS 策略是「本地能跑、上线 401」泥潭的头号原因，本系列不回避。

#### 路由优先级与 `{idOrSlug}` 约定（R5 / R6）

- **读接口**（`GET /articles/{idOrSlug}`、`GET /articles/{idOrSlug}/comments`）同时接受 `id`（整数）与 `slug`（字符串）；
- **写接口**（`PUT` `DELETE` `submit` `view`）一律使用 `{id}`（整数）——`slug` 可选，写操作不依赖 slug；前端从详情响应已持有 `id`，无需再解析。
- **静态路径优先于参数路径**：`/articles/tree` 等静态子路径在路由表注册先于 `/articles/{idOrSlug}`，不被吞噬。
- **slug 黑名单**：用户填 slug 时禁止与预留子路径名冲突（`tree` / `view` / `submit` / `featured` / `recommend` 等），后端校验拒绝。

#### 命名边界：契约 / 代码用真实名，文章可抽象（R20）

- 契约（`openapi.v1.yaml`）与实现代码使用**真实业务命名**（`Article` / `Member` / `Comment`），它们是本系列的**真实素材**；
- 文章正文讲解「通用技术命题」时，将这些命名**脱敏为通用命名**（如「资源」「文章模型」），但代码仓库保持真实命名——读者看到的代码与文章是同一套，只是讲解视角不同，不存在割裂。

### 实体生命周期完整性原则（§3.1 · 契约硬规则，源于 P1/P2 复盘）

第三轮复审抓出两类"地基漏洞"——状态机死胡同（`reviewing` 无进/出端点）与孤儿实体（`Attachment` 定义了却无端点产出）。这两条暴露同一根因：**实体或状态的"存在"必须以"有真实读写路径"为前提**，否则它们只是文档里的装饰，七个端照着写会集体翻车。

由此立为契约硬规则，并写进语义自查脚本强制（`check_contract.py` 的 C/D 项）：

1. **无孤儿 schema**：`openapi.v1.yaml` 里每一个 `components.schemas.*` 都必须被至少一条路径的 `requestBody` / `responses` 实际 `$ref` 引用到；出现未被引用的 schema 立即报错。第三轮整改中它当场抓出 `ErrorDetail`（与 `ValidationError` 重复、无端点引用），已删除。
2. **枚举态必须有写入路径**：实体状态的每个 enum 值，都必须有端点能把实体**置为**该值（评论 `reviewing` 的 P1 即反面教材）。脚本对 `Comment.status` / `Article.status` 逐一核对。
3. **一等实体须有完整生命周期**：能被前端建出来、列出来、删掉的实体（如 `Attachment`），绝不能只活在模型注释里——创建端点返回完整实体，并提供读取与删除端点。

> 这条规则的收益不仅在"现在正确"，更在"以后可防"：任何后续新增 schema 或状态，只要没配套路径，语义自查门会立刻报错，把"人工评审漏看"变成"机器必报错"。

### 机器强制约束清单（§3.2 · 可枚举约束一律下沉到 schema，源于 P5/P7/P12）

凡是"白名单 / 取值 / 匹配口径"类约束，**不允许只写在 `description` 散文里**——散文对代码生成器不可见，等于契约对实现无约束，七个端必然走形。第三轮整改把以下约束全部下沉为 `enum` / `required` / `security` 等机器字段，并在语义自查脚本中核验：

| 约束 | 机器表达 | 落在哪 |
|---|---|---|
| 排序字段 + 方向 | `Sort` = `enum: [publishedAt, -publishedAt, viewCount, -viewCount, createdAt, -createdAt]`，默认 `-publishedAt`；字段名本身为正序、前缀 `-` 为倒序；NULL 排序统一 `COALESCE(.., 0) DESC` 兜底 | `GET /articles` 等列表端点 |
| 分类过滤匹配口径 | `FilterCategory` 共享参数，按 **slug** 匹配（非裸 string） | `GET /articles` |
| 标签过滤匹配口径 | `FilterTag` 共享参数，按 **slug** 匹配 | `GET /articles` |
| 关键词搜索范围 | `FilterKeyword` 匹配 `title + summary`，**不含** `content` 全文 | `GET /articles` |
| 评论公开列表状态 | 仅返回 `approved`（管理视图另走 `GET /admin/comments`） | `GET .../comments` |
| 可选鉴权 | `security: [{}, {bearerAuth: []}]`（空安全需求 = 匿名也允许；见 §3.3） | 文章详情 / view / 评论列表 |
| 授权求值（RBAC） | 每个需登录端点声明结构化 `x-authz: {minRole: member|editor|admin, ownerOverride?: {param, ownerField}}`；`minRole` 为放行的最小角色层级，`ownerOverride` 显式声明归属资源的 path 参数名与归属字段（authorId/userId）；完整求值规则见 OpenAPI `info.description` 第 4 铁律（自包含，不依赖本文档） | 全部需登录端点（46 个，语义门 R1 段强制） |
| 点赞 / 收藏幂等 | `x-idempotent: true` + 重复调用返回 200（不 409、不重复计数，返回当前态） | like/unlike/addFavorite/removeFavorite |
| 限流 | `info.x-rate-limit`（limit/window/code）+ `components.responses.RateLimited`（429 + `Retry-After` + `code 5001`） | 公开端点（21 个挂 429，网关层施加） |
| 上传约束 | requestBody schema 上的 `x-max-size-bytes: 10485760` + `x-accepted-mime-types`（6 类：png/jpeg/gif/webp/svg/pdf） | `POST /upload` |
| 分类树深度 | `Category.x-max-depth: 4`（建树 / 变更 parentId 超出深度后端拒绝） | 分类实体 |
| 删除级联 | `x-cascade: none`（附件/站点约定）/ `children`（评论级联子回复）/ `soft-hide`（文章隔离可见性，不物理删） | deleteComment / deleteArticle / deleteAttachment |
| 字符串约束 | 关键字段下沉 `maxLength` / `format: email` / `pattern`（slug `^[a-z0-9-]{1,64}$`）/ `minLength`（密码 ≥8） | 全实体 |
| 全量 operationId | 49 个操作全部带稳定 `operationId`（生成函数名一致） | 全部路径 |
| slug 成员忽略 | `ArticleCreate.slug` 写明 member 传入被忽略，editor/admin 可直接指定 | 创建/更新文章 |
| submit/approve 非法前态 | 非合法前态 → 409 / code 3003 | `POST .../submit`、`POST .../approve` |
| 分类成环防护 | `PUT /categories/{id}` parentId 指向自身子孙 → 409 / code 3002 | 分类更新 |
| 标签 slug 冲突 | `PUT /tags/{id}` / `POST /tags` slug 冲突 → 409 / code 3002 | 标签 |

> 这条清单是 M1-17（列表三件套）与 M6-09（契约一致性校验）的对照依据：Node 与 Go 后端对这些枚举的解析必须完全一致，否则就是契约没写清楚——而现在是写清楚了。

### 可选鉴权的标准写法（§3.3 · 机器可读的"匿名或登录"，源于 P4）

OpenAPI 没有 `optionalAuth` 关键字，但有一个被广泛支持的标准写法表达"匿名可用、也可带令牌"：

```yaml
security:
  - {}              # 空安全需求 = 允许匿名
  - bearerAuth: []  # 也可携带 Bearer
```

- 含义：满足**任意一个**安全需求即可调用。空需求恒满足 → 匿名可调用；`bearerAuth` 满足 → 登录用户也可调用且能拿到身份。这比单写 `security: []`（仅表示"无需鉴权"，生成器永不附带 Bearer）更精确，是 P4 的机器可读解法。
- 应用端点（契约版本 1.4.0，共 3 个）：`GET /articles/{idOrSlug}`、`POST /articles/{id}/view`、`GET /articles/{idOrSlug}/comments`。
- **生成客户端的现实约束（P4 遗留的诚实声明）**：标准写法保证"契约允许带令牌"，但多数代码生成器仍**默认不发** `Authorization` 头，需调用方在生成代码后手动补。因此 §2.4 的"登录用户阅读量按 `user_id` 去重"只对**手写携带 Bearer 的调用**成立；生成客户端若不补 `Authorization`，则按 `ip+ua` 哈希去重。这条边界在 §2.4 已如实说明，不夸大"契约上自动可达"。

---

## 四、统一响应结构

**成功响应：**

```json
{
  "code": 0,
  "message": "ok",
  "data": { },
  "requestId": "req_8f3a...",
  "timestamp": "2026-08-10T12:00:00Z"
}
```

**分页响应：**

```json
{
  "code": 0,
  "data": {
    "list": [ { } ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 137,
      "totalPages": 7
    }
  }
}
```

**错误响应：**

```json
{
  "code": 1001,
  "message": "用户名或密码错误",
  "data": null,
  "requestId": "req_8f3a...",
  "timestamp": "2026-08-10T12:00:00Z"
}
```

> `code = 0` 表示业务成功；`code > 0` 表示业务错误，前端按 `code` 分支处理，不依赖 HTTP 状态码表达业务逻辑。HTTP 状态码只表达传输层结果（200/400/401/403/404/500）。

---

## 五、端点目录（Endpoint Catalog）

> 完整请求/响应 schema 见 `docs/api/openapi.v1.yaml`。此处只列方法、路径与用途。
> 路径记号说明：本目录用 Express 风格 `:param`，与 OpenAPI 的 `{param}` **完全等价**（如 `:idOrSlug` ≡ `{idOrSlug}`），阅读时无需区分。

> **鉴权列读法（v1.12 机器化）**：`公开`=匿名可访问；`member`=任意登录用户（minRole: member）；`editor/admin`=minRole: editor（admin 含其权）；`admin`=仅 admin（minRole: admin）。若带「作者本人 / 上传者本人 / 本人」字样，表示该端点声明了 `x-authz.ownerOverride`——资源归属者（member）亦可操作，与 `x-authz.minRole` 取「最小角色 **或** 归属」的并集。授权求值规则以 OpenAPI `info.description` 第 4 铁律为唯一权威（自包含，无需跨读本文档）；每个需登录端点的 `x-authz` 都已下沉到契约，语义门 R1 段强制校验。

### 认证 Auth
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/auth/register` | 注册（默认角色 member） | 否 |
| POST | `/api/v1/auth/login` | 登录，返回 access + refresh | 否 |
| POST | `/api/v1/auth/refresh` | 用 refresh 换 access | refresh |
| POST | `/api/v1/auth/logout` | 登出，作废 refresh（清 Cookie） | 是 |
| GET | `/api/v1/auth/me` | 当前登录用户 | 是 |
| POST | `/api/v1/auth/{provider}/callback` | 第三方登录回调（扩展点，M3-09） | 否 |

### 文章 Article
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/articles` | 公开文章列表（仅 published，忽略 status 参数） | 否（公开，仅 published） |
| GET | `/api/v1/articles/:idOrSlug` | 文章详情（id 或 slug 均可解析） | 否 |
| POST | `/api/v1/articles` | 创建文章（会员默认 draft/pending；editor/admin 可 published） | 是（member/editor/admin） |
| PUT | `/api/v1/articles/:id` | 更新文章 | 是（作者本人或 editor/admin；`x-authz.ownerOverride: {param: id, ownerField: authorId}`） |
| DELETE | `/api/v1/articles/:id` | 删除（`x-cascade: soft-hide` 隔离可见性，不物理删） | 是（作者本人或 editor/admin） |
| POST | `/api/v1/articles/:id/submit` | 草稿→待审（会员投稿） | 是（作者本人） |
| GET | `/api/v1/articles/:id/adjacent` | 上一篇/下一篇（同 `-publishedAt` 相邻，仅 published） | 否（公开） |
| GET | `/api/v1/articles/:id/related` | 相关文章（共享标签 + 同分类打分，排除自身） | 否（公开） |
| GET | `/api/v1/articles/:id/toc` | 文章目录（正文 Markdown 标题解析） | 否（公开） |
| POST | `/api/v1/articles/:id/like` | 点赞（幂等，重复点赞返回当前态） | 是（member） |
| DELETE | `/api/v1/articles/:id/like` | 取消点赞（幂等，未点赞返回 liked=false） | 是（member） |
| GET | `/api/v1/articles/:id/like/status` | 点赞状态 + 总赞数（匿名 liked=false） | 否（公开） |

### 分类 Category
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/categories` | 分类列表（树或平铺） | 否 |
| POST | `/api/v1/categories` | 创建分类 | 是（editor/admin） |
| PUT | `/api/v1/categories/:id` | 更新分类 | 是（editor/admin） |
| DELETE | `/api/v1/categories/:id` | 删除分类 | 是（editor/admin） |
| GET | `/api/v1/categories/:id/breadcrumb` | 分类面包屑路径（根→当前） | 否（公开） |
| GET | `/api/v1/categories/stats` | 各分类 published 文章数 | 否（公开） |

### 标签 Tag
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/tags` | 标签列表（含文章数） | 否 |
| POST | `/api/v1/tags` | 创建标签 | 是（editor/admin） |
| PUT | `/api/v1/tags/:id` | 更新标签（name/slug，slug 冲突 409） | 是（editor/admin） |
| DELETE | `/api/v1/tags/:id` | 删除标签 | 是（editor/admin） |

### 评论 Comment
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/articles/:idOrSlug/comments` | 某文章评论（楼中楼，仅 approved） | 否 |
| POST | `/api/v1/articles/:idOrSlug/comments` | 发表评论 | 是（member） |
| PATCH | `/api/v1/comments/:id/status` | 人工置位评论状态（reviewing 进出，editor/admin） | 是（editor/admin） |
| DELETE | `/api/v1/comments/:id` | 删除评论（级联子回复） | 是（作者本人或 editor/admin） |

### 上传 Upload
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/upload` | 图片/资源上传，返回完整 `Attachment` | 是（member） |
| DELETE | `/api/v1/attachments/:id` | 删除附件（上传者本人或 editor/admin；`x-authz.ownerOverride: {param: id, ownerField: userId}`） | 是（上传者本人或 editor/admin） |

### 搜索 Search
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/search` | 全文搜索（type=article/member；跨标题/正文/昵称） | 否（公开） |

### 站点统计 Site
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/stats` | 站点级聚合统计（文章/评论/会员数 + 阅读总量） | 否（公开） |

### 会员中心 Member
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/members/:id` | 会员公开主页（资料 + 其 published 文章；disabled 返回 404） | 否 |
| GET | `/api/v1/me/articles` | 我自己的全部文章（含 draft/pending/published） | 是（member） |
| GET | `/api/v1/me/attachments` | 我的附件素材库（分页） | 是（member） |
| GET | `/api/v1/me/favorites` | 我的收藏列表 | 是（member） |
| POST | `/api/v1/me/favorites` | 添加收藏 | 是（member） |
| DELETE | `/api/v1/me/favorites/:articleId` | 取消收藏 | 是（member） |
| GET | `/api/v1/me/history` | 阅读历史 | 是（member） |
| DELETE | `/api/v1/me/history` | 清空阅读历史（幂等） | 是（member） |
| DELETE | `/api/v1/me/history/:articleId` | 删除单条阅读历史（幂等） | 是（member） |
| GET | `/api/v1/me/profile` | 个人资料 | 是（member） |
| PATCH | `/api/v1/me/profile` | 更新资料 | 是（member） |
| POST | `/api/v1/me/history` | 上报阅读进度（写入 ReadingLog） | 是（member） |
| POST | `/api/v1/me/change-password` | 修改密码（需旧密码） | 是（member） |
| GET | `/api/v1/me/likes` | 我的点赞列表（published 文章，按点赞时间倒序） | 是（member） |
| GET | `/api/v1/me/notifications` | 我的通知（支持 isRead 筛选） | 是（member） |
| GET | `/api/v1/me/notifications/unread-count` | 未读通知数 | 是（member） |
| POST | `/api/v1/me/notifications/read-all` | 全部标记已读 | 是（member） |
| PATCH | `/api/v1/me/notifications/:id` | 标记单条已读（仅本人） | 是（member） |
| GET | `/api/v1/site/settings` | 站点基础配置（公开，无需登录；页头/页脚/SEO 用：名称/标题/描述/关键词/Logo/版权） | 否（公开） |

### 管理 Admin（文章 / 用户）
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/admin/articles` | 后台文章管理列表（支持 draft/pending/published 筛选） | 是（editor/admin） |
| GET | `/api/v1/admin/comments` | 后台评论管理列表（可按 status 筛选，含 reviewing/rejected 读取路径） | 是（editor/admin 全部） |
| GET | `/api/v1/users` | 用户列表（分页） | 是（admin） |
| GET | `/api/v1/users/:id` | 用户详情 | 是（admin） |
| PATCH | `/api/v1/users/:id` | 变更角色/状态/会员等级 | 是（admin） |
| POST | `/api/v1/admin/users/:id/reset-password` | 管理员重置用户密码（遗忘密码兜底，见 §九 P10） | 是（admin） |
| POST | `/api/v1/admin/articles/:id/approve` | 待审→已发布（审核通过） | 是（editor/admin） |
| POST | `/api/v1/admin/articles/:id/status` | 任意状态置位（下架/退回） | 是（admin） |
| GET | `/api/v1/admin/site/settings` | 站点配置全量读取（回填后台设置页） | 是（admin） |
| PATCH | `/api/v1/admin/site/settings` | 更新站点配置（名称/标题/描述/关键词/Logo/版权，字段可选） | 是（admin） |

> **辅助接口设计说明（v1.10 新增）**
> - **标签云计数已覆盖**：`GET /api/v1/tags` 返回的 `Tag` 已含 `articleCount` 字段，标签云（带计数）直接复用，无需新增 `withCount` 参数或独立端点。
> - **热门/最新不新增端点**：`GET /api/v1/articles?sort=-viewCount`（热门）、`?sort=-publishedAt`（最新）等由 `Sort` 枚举直接支持，属「列表别名型」，不新增资源。
> - **RSS / sitemap / robots 不进 JSON 契约**：这三者是 SEO 的格式输出（XML/文本），属 M3（Next.js 前台）实现笔记，在应用层以非 OpenAPI 方式落地，不在七端共享契约内。
> - **辅助端点返回紧凑投影**：上一篇/下一篇、相关文章、面包屑等只返 `{id,title,slug}` 级精简字段，不返回完整 `Article`，降低传输与耦合。

---

## 六、错误码表（权威集，与 OpenAPI `ErrorCode` 枚举逐项一致）

> 本表与 `docs/api/openapi.v1.yaml` 的 `ErrorCode` 枚举**逐项一致**，并由 `check_contract.py` 的 F 段机器校验（每个枚举码必须在某错误响应的**结构化** `example` / `examples` 中落地，**不再以 `description` 兜底**；且禁止出现未定义码）。前端按 `code` 分支处理，不依赖 HTTP 状态码表达业务逻辑。Go 后端（M6）须返回与 Node 后端**完全相同**的 `code`——这是 M6-09 契约一致性校验的硬指标。

| code | 含义 | HTTP |
|---|---|---|
| 0 | 成功 | 200 |
| 1001 | 用户名或密码错误 | 401 |
| 1002 | 令牌无效或过期 | 401 |
| 1003 | 刷新令牌失效，请重新登录 | 401 |
| 1004 | 缺少访问令牌 | 401 |
| 1005 | 账号已被禁用 | 401 |
| 2001 | 无权限执行该操作 | 403 |
| 3001 | 资源不存在 | 404 |
| 3002 | 资源冲突（唯一约束 / 层级成环 / 引用占用） | 409 |
| 3003 | 状态转移非法（前态不允许该操作） | 409 |
| 4001 | 参数校验失败（`data.errors` 含字段级明细） | 400 |
| 5000 | 服务器内部错误（不向外暴露细节） | 500 / 501 |

> 错误码分段：1xxx 认证、2xxx 授权、3xxx 资源、4xxx 参数、5xxx 服务。各端复用同一张表。

---

## 七、与实现的映射

| 子项目 | 角色 | 如何使用本契约 |
|---|---|---|
| Node 后端 | 首个实现方 | 按契约实现全部端点，生成 OpenAPI |
| Go 后端重写 | 同契约二次实现 | 接口、字段、错误码必须与 Node 完全一致 |
| React 管理后台 | 消费方 | 由 OpenAPI 生成 TS 类型与请求函数 |
| Vue3 后台重写 | 消费方 | 同上，验证契约跨框架稳定性 |
| Next.js 网站 | 消费方 | 前台只读 + 会员写，复用同一套类型 |
| Flutter App | 消费方 | 由 OpenAPI 生成 Dart 模型 |
| Taro 小程序 | 消费方 | 同上，微信登录统一回用户体系 |

---

## 八、变更与演进

1. 任何契约改动先改 `docs/api/openapi.v1.yaml`，再改代码。
2. 破坏性变更（删字段、改语义）必须升 `/api/v2`，旧版本留过渡期。
3. 新增字段、新增可选端点属于兼容变更，停留在 v1。
4. 每篇涉及接口变更的文章，对应 git tag 能 checkout 到当时的契约状态。

---

## 九、开放问题与已知边界登记

### 9.1 已确认的产品决策（开放问题收尾）

1. **slug 策略（已定）**：「id 为主、slug 可选」，不做自动转写（见 §1 / OpenAPI）。
2. **分类层级（已定）**：无限级树形结构，自关联 `parent_id` + 提供 `GET /api/v1/categories/tree` 整树返回（见 §2.2）。
3. **阅读量防刷（已定）**：做。去重键（登录 `user_id` / 匿名 `ip+ua` 哈希）+ 冷却窗口 + 计数写分离，`POST /api/v1/articles/:id/view`（见 §2.4）。
4. **评论审核流（已定）**：脏话 / 违禁词过滤，命中转等长 `*`；违规比率 > 阈值（默认 10%）→ `rejected`，否则 → `approved`（转义后）；`reviewing` 为人工兜底态（见 §2.5）。
5. **附件存储（已定）**：R2 为主 + 本地磁盘兜底，配置驱动 `STORAGE_DRIVER`，Attachment 记 `storage` 字段（见 §2.6）。

### 9.2 第三轮复审建议项登记（P10–P18 · 已清零或登记为已知边界）

> 第三轮复审的 🟡 建议项。冻结准则：登记为已知边界或显式 Non-goals 即可冻结，不阻塞 M0-03 与 M1 PRD。以下逐条给出落点，**全部已闭合**。

- **P10 · 邮箱验证 / 找回密码 / 改邮箱缺失 → 登记为 Non-goal（v1）**：v1 不做邮箱验证、不做 forgot/reset password 自助流程、`change-password` 需旧密码。遗忘密码的兜底由管理员经新增端点 `POST /admin/users/{id}/reset-password`（↦ `AuthResult`）重置，普通用户无自助路径——已在 00 §四 Non-goals 显式登记。理由：超出"一个人能维护的产品"复杂度，且非讲清全栈的必需命题。B-11（Web 安全基础）若要讲找回密码，作为独立专题，不进主契约。
- **P11 · refresh 令牌旋转策略 → 已确认边界（契约已文档化）**：`POST /auth/refresh` 返回新 `AuthResult`（含新 `refreshToken`）时，**作废旧 refreshToken（旋转）**；旧令牌或重放 → 1003。双载体（Cookie / 请求体）下均适用，登出与旋转都走同一作废逻辑。这是安全教程应点明的权衡，已在 OpenAPI `refresh` 端点 description 写死。
- **P12 · `Sort` 白名单未进 enum → 已落地**：`Sort` 参数已为 `enum`（6 个带符号字段名组合：`publishedAt`/`-publishedAt`/`viewCount`/`-viewCount`/`createdAt`/`-createdAt`，默认 `-publishedAt`），见 §3.2。
- **P13 · 应急集自洽性 → 登记边界（01 §13 已注明前提）**：应急集（01 §13，35 篇）"读完能真正建成上线全栈项目"的前提是——发文经 **API（curl/Postman）** 或经 **M2-11 文章管理全流程 UI**。应急集未含 M2-11，故以"经 API 发文"为前提写入 01 §13，避免读者误以为能纯 UI 上线；对应新增 `POST /admin/users/{id}/reset-password` 也在同前提供 admin 兜底。注册默认角色 `member` 已在 §2.2 确认，与应急集一致。
- **P14 · submit/approve 错误前态行为 → 已落地**：§2.3 转移合法性矩阵写死——`submit` 仅从 `draft` 合法、`approve` 仅从 `pending` 合法，非法前态 → 409 / code 3003；`status` 端点目标态与当前相同则幂等 200。
- **P15 · disabled 会员主页与文章可见性 → 已确认边界**：`GET /members/:id` 对 `status=disabled` 用户返回 **404**；其已 `published` 文章**仍公开**（列表 / 详情不区分作者 `status`），仅主页入口关闭。
- **P16 · `:id` / `{id}` 记号等价 → 已全文档声明**：本文件 §五 已声明 `:param` ≡ `{param}`；00 §十、01 同步加注等价提示，读者只读 00/01 也能看到。
- **P17 · 被拒评论"闪现后消失" UX → 已落地说明**：§2.5 写明 `POST /comments` 对 `rejected` 返回 `rejectedReason`，但 `GET` 列表不返回 `rejected`——前端收到 `rejected` 时**不插入列表**、改为就地提示，M3-11 讲该交互。
- **P18 · 阅读历史无删除端点 → 已落地**：补 `DELETE /me/history`（清空）与 `DELETE /me/history/{articleId}`（删单条），均幂等；见 §2.2 ReadingLog 与 §五 Member 段。

---

## 十、变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-10 | v1.0 | 初版领域模型与 API 契约，作为七端共同地基 |
| 2026-08-10 | v1.1 | 会员增加 `level` 字段（仅展示）；文章状态机改为 `draft/pending/published`（会员投稿默认 pending、管理员发布即 published）；新增会员公开主页端点；slug 改为可选、id 为主 |
| 2026-08-10 | v1.2 | 新增 §2.4 阅读量防刷、§2.5 评论脏话/违禁词过滤与自动审核、§2.6 附件 R2+本地双存储；Category 改为无限级树形（/categories/tree）；Attachment 增加 `storage` 字段；第九节开放问题全部收尾 |
| 2026-08-10 | v1.3 | 评审整改：OpenAPI 补全全部 200 响应 schema、新增 ArticleSummary/分页类型（R1/R12）；刷新令牌双载体定稿、AuthResult 增 refreshToken（R4）；timestamp 改 ISO 字符串（R7）；§2.3 补 pending→draft 与 member 权限约束（R3/R11/R16）；§2.4 删消息队列与 Non-goals 对齐（R9）；§2.5 comment pending→reviewing（R18）；§2.2 主键类型口径（R13）；§2.3 软删除+slug 部分唯一索引（R10）；§三新增路由/CORS/认证补充约定（R5/R6/R8/R20） |
| 2026-08-10 | v1.4 | 复审整改（严苛标准，契约经 openapi-spec-validator 严格校验通过）：新增「公开内容可见性铁律」(N2)、阅读历史写入路径 POST /me/history(N4)、第三方登录回调扩展端点(N5)、400 校验错误 ValidationErrorList(N6)、users 404/403(N7)、分类/标签删除 409(N8)、view 可选 Bearer(N3)、登出清 Cookie(N11)、角色边界/level/注册默认角色(N13/N14/N20)、评论删除级联(N16)、排序白名单字段(N15)、§五 路径记号等价说明(N19)、R19 白名单决议持久化(N10)；修正 view 端点 404 嵌套(N1) |
| 2026-08-10 | v1.5 | **第三轮复审整改（零逻辑漏洞目标）**：契约升 1.3.0。🔴 P1 评论 reviewing 闭环——新增 `PATCH /comments/{id}/status`（进出）+ `GET /admin/comments`（reviewing/rejected 读取路径）；P2 `Attachment` 转一等实体——`upload` 返回完整 `Attachment` + 新增 `GET /me/attachments`、`DELETE /attachments/{id}`；P3 新增 `GET /me/articles`。🟠 P4 可选鉴权改标准写法 `security:[{},{bearerAuth:[]}]`（3 端点）；P5/P7/P12 排序/过滤口径下沉 `enum`（`Sort` 6 组合 + 默认、`FilterCategory/Tag/Keyword` 共享参数）；P6 评论公开列表仅 `approved`；P8 slug member 忽略规则；P9 全量 49 个 `operationId`。🟡 P10 邮箱找回登记 Non-goal（admin 重置端点兜底）；P11 refresh 旋转策略写死；P13/P15/P16/P17/P18 分别于 01 §13 / 契约 / 本文件声明。文档新增 §3.1（无孤儿实体硬规则）、§3.2（机器强制约束清单）、§3.3（可选鉴权标准写法）；§五 补 9 个新端点；§九 拆 9.1/9.2 登记 P10–P18。新增语义自查脚本 `check_contract.py`，当场抓出并删除孤儿 schema `ErrorDetail` |
| 2026-08-11 | v1.7 | **冻结前整改（清零 F1–F4）**：错误码体系机器化——新增 `ErrorCode` 枚举（12 值：0 成功 + 11 错误码），`ApiResponse.code` 改为 `$ref` 引用，每个 4xx/5xx 响应补 `content` + `example` 钉死 `code`；语义自查脚本新增 F 段强制校验错误码（枚举码须落地、禁止未定义码）；§三 过滤行修正 `?status` 仅用于鉴权后台列表；§六 错误码表补全 `1005`/`3002`/`3003` 并与 `ErrorCode` 枚举逐项对齐；文档版本对齐 00/01（v1.7），契约 1.3.0→1.4.0 |
| 2026-08-11 | v1.8 | **用户复审整改**：删除 `author` 角色，改设 `editor`（内容编辑，管全站文章/评论/分类/标签，但不涉用户/角色/站点配置），三角色 member/editor/admin；新增 `SiteSetting` 实体与 3 端点（GET /site/settings 公开、GET/PATCH /admin/site/settings）；排序 `Sort` 改为带符号字段名约定（`-publishedAt` 表倒序，默认 `-publishedAt`）；文档版本对齐 00/01（v1.8），契约 1.4.0→1.5.0 |
| 2026-08-11 | v1.9 | **站点配置字段扩展**：`SiteSetting` 在 v1.8 的 siteName/siteDescription/logoUrl 基础上新增 `siteTitle`（浏览器标签/SEO 标题）、`siteKeywords`（meta 关键词）、`copyright`（页脚版权）；`SiteSettingUpdate` 同步可填；契约 1.5.0→1.6.0 |
| 2026-08-11 | v1.10 | **补常用辅助接口**：纯计算/聚合类新增 `GET /articles/{id}/adjacent`（上一篇/下一篇）、`GET /articles/{id}/related`（相关文章）、`GET /articles/{id}/toc`（目录）、`GET /categories/{id}/breadcrumb`（面包屑）、`GET /categories/stats`（分类计数）、`GET /stats`（站点统计）、`GET /search`（全文搜索）；互动类新增 `POST/DELETE /articles/{id}/like`、`GET /articles/{id}/like/status`、`GET /me/likes`（Like 实体）与 `GET /me/notifications`、`GET /me/notifications/unread-count`、`POST /me/notifications/read-all`、`PATCH /me/notifications/{id}`（Notification 实体）；`Article`/`ArticleSummary` 加 `likeCount`。标签云计数已由 `GET /tags` 的 `Tag.articleCount` 覆盖，不重复造；RSS/sitemap/robots 列为 M3 实现笔记不进 JSON 契约。契约 1.6.0→1.7.0，双门校验全绿（53 路径 / 67 操作 / 45 schema） |
| 2026-08-11 | v1.11 | **后端架构师评审整改（清零 R1–R11）**：🔴 R1 授权角色机器化——46 个需登录端点全部声明 `x-required-roles`（member/editor/admin，层级 member<editor<admin），6 个归属敏感端点标 `x-owner-resource`，语义门新增 R1 段强制（缺声明/非法角色即 FAIL）；顺带修正本文档自身角色不一致（§端点目录把 categories/tags/评论审核/approve 误标"仅 admin"，与§角色边界段矛盾，现统一为 `editor/admin`——**以角色定义段为权威**）。🔴 R2 幂等机器化——like/unlike/addFavorite/removeFavorite 标 `x-idempotent: true` 并补当前态示例，语义门断言幂等端点不得声明 409。🟠 R3 字符串约束下沉——85 处补 `maxLength`/`format: email`/`pattern`（slug `^[a-z0-9-]{1,64}$`）/`minLength`（密码 ≥8）。🟠 R4 上传约束——`x-max-size-bytes: 10485760` + `x-accepted-mime-types`（6 类）。🟠 R5 限流——`ErrorCode` 加 5001、新增 `RateLimited` 响应组件（429 + `Retry-After`）、`info.x-rate-limit`，21 个公开端点挂 429。🟡 R6/R7/R8 ownership 与级联下沉 `x-owner-resource`/`x-cascade`（none/children/soft-hide），`GET /users/{id}` 明确 admin 专用（查他人公开资料走 `GET /members/{id}`）。🟡 R9 错误码校验收紧——F 段去掉 `description` 兜底、改认结构化 `example`/`examples`，refresh 401 补 1003/1004/1002/1005 四例，login 401 补 1001/1005 两例。🟡 R10 `Category.x-max-depth: 4`。🟡 R11 `info.x-api-version` + §八 版本废弃策略。语义门新增 G 段校验扩展字段取值合法性。契约 1.7.0→1.8.0，双门校验全绿（53 路径 / 67 操作 / 45 schema / 46 角色声明 / 22 条 OK 断言） |
| 2026-08-11 | v1.12 | **二次评审整改（清零 N1–N6）**：🔴 N1 授权求值机器化——46 个 `x-required-roles`（列表编码最小角色）与 6 个 `x-owner-resource`（仅标参数名）合并为结构化 `x-authz: {minRole, ownerOverride:{param, ownerField}}`；`ownerOverride.ownerField` 用真实字段（article→authorId / comment&attachment→userId；Notification 补 `userId` 字段）；第 4 铁律改写为**自包含求值规则**（删除"详见 02"，仅凭 OpenAPI 即可确定性推出每个请求的授权结果）。`submitArticle` 由 [member] 收紧为 minRole:admin + ownerOverride（防任意 member 越权提交他人文章）。🟠 N2 URL 类字段（coverImage/redirectUri/logoUrl/avatar/url/link）统一 `format: uri + maxLength: 512`；反范式展示字段（authorName/categoryName/userName/rejectedReason/body）补 `maxLength`。🟡 N3 `x-required-roles` 列表歧义消除（minRole 单字段）；N4 `x-owner-resource` 只标参数名→`ownerOverride` 显式 `param`+`ownerField`；N5 限流粒度 `x-rate-limit` 加 `scope: per-endpoint` + `key: client`。语义门新增 R1 授权求值 / N2 字段约束 / N5 限流粒度断言（22→28 条 OK）；N6 回应：把 N1 求值与 N2 约束纳入语义门，降低"作者自证"盲区。契约 1.8.0→1.9.0，双门校验全绿（53 路径 / 67 操作 / 45 schema / 46 x-authz / 28 条 OK 断言） |
