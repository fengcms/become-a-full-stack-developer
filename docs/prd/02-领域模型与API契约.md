# 领域模型与 API 契约 v1 · 文章系统

| 项 | 内容 |
|---|---|
| 文档版本 | v1.4 |
| 状态 | 已确认（v1.4：复审整改——公开内容可见性铁律、阅读历史写入路径、第三方登录扩展点、400 校验明细、users 404/403、分类/标签删除 409、登出清 Cookie、角色边界/level/注册默认角色、评论删除级联，契约经 openapi-spec-validator 严格校验通过） |
| 最后更新 | 2026-08-10 |
| 上游文档 | [00-项目章程](./00-项目章程.md) |
| 机器可读契约 | [../api/openapi.v1.yaml](../api/openapi.v1.yaml) |

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
| role | enum | `admin` / `author` / `member` |
| status | enum | `active` / `disabled` |
| level | int | 会员等级，**仅展示用、无业务功能**；默认 1；在会员公开主页呈现 |
| created_at | datetime | |
| updated_at | datetime | |

> 设计取舍：不做多租户，单站点单管理员起步。会员中心与后台共用同一套用户表，靠 `role` 区分权限，而不是拆成两张表——这能最大化"同一套 API 服务多端"的复用率。

> **主键类型口径（R13 澄清）**：所有实体主键统一为**整数自增**。在 Cloudflare D1 / SQLite 下为 `INTEGER`，在 PostgreSQL 下为 `BIGINT`；本期不引入 uuid。OpenAPI 契约中统一以 `integer` 表达，实现层按所用数据库适配，避免 D1 与 PG 之间摇摆。

> **角色边界、会员等级与注册默认角色（N13/N14/N20）**：注册默认角色 `member`。`admin` 经 `PATCH /users/{id}`（可改 `role` / `status` / `level`）将 `member` 晋升为 `author`；`author` 比 `member` 多「管理标签」权限（`POST /tags` 允许 `admin`/`author`）。会员 `level` **仅展示用、无业务功能**，默认 1，本期仅由 `admin` 经上述端点手动上调，普通流程不会自动变化——读者不应误以为有自动升级逻辑。

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
| author_id | bigint | 外键 → User.id |
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

> **删除语义（N8）**：`DELETE /api/v1/categories/{id}` 删除前须无子分类且无文章归属该分类，否则返回 `409`（避免悬空 `parent_id` 或孤儿归属）。不允许级联删除，需调用方先迁移子节点与文章。

#### Tag（标签）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| name | string | 名称 |
| slug | string | 别名，唯一 |
| created_at | datetime | |

> **删除语义（N8）**：`DELETE /api/v1/tags/{id}` 删除前须先清除 `ArticleTag` 关联（无文章引用该标签），否则返回 `409`（避免孤儿中间表行）。

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
| status | enum | `reviewing` / `approved` / `rejected` |
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

#### Attachment（附件 / 上传资源）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 外键，上传者 |
| article_id | bigint? | 外键，可后关联 |
| url | string | 存储地址 |
| storage | enum | 实际存储后端：`r2` / `local`（见 §2.6） |
| mime_type | string | 如 image/png |
| size | int | 字节 |
| created_at | datetime | |

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
```

> **权限约束（与 OpenAPI `ArticleCreate.status` 一致）**：`member` / `author` 创建文章时若传入 `published`，后端**忽略并降级为 `pending`**（会员无法直接发布）；仅 `admin` 可将文章直接置为 `published`。该约束写入契约，前端无需自行拦截，生成代码即知。

> 设计取舍：刻意**去掉 `archived`**。v1 只需"草稿 / 待审 / 已发布"三态即可讲清投稿审核的全部后端要点；归档是内容运营动作，与"讲清全栈"无关，留作后续扩展或专题。这个状态机是系列"后端状态机设计"专题（M1-15）的天然素材。

---

### 2.4 阅读量防刷机制（view_count 去重）

阅读量是内容运营的关键指标，但也最容易被刷。设计要点：

- **计数与写分离**：`view_count` 仍是 Article 上的展示字段，但它的递增**不经过主表 UPDATE**，而是写入独立的计数记录（以「去重键 + 冷却时间戳」建立唯一约束）。插入成功 → 展示计数 +1；唯一约束冲突（窗口内重复访问）→ 忽略。这既避免热点行行锁竞争，又不引入消息队列/异步聚合——与 Non-goals「不追求高并发架构、不做消息队列」严格一致。
- **去重键**：登录用户按 `user_id` 去重；匿名用户按 `ip + user_agent` 的哈希去重。契约层面 `POST /api/v1/articles/{id}/view` 声明为「可选携带 Bearer」——携带则按 `user_id` 去重，否则退化为 `ip+ua` 哈希（匿名亦可调用）。这保证 §2.4 承诺的登录用户去重在契约上**可达**，而非永远走匿名分支。
- **冷却窗口**：同一去重键在窗口内（默认 24 小时）重复访问不重复计数。
- **触发端点**：`POST /api/v1/articles/:id/view` 带防刷地计数；详情接口不再隐式自增，便于前端精确控制（如阅读满 N 秒后才上报）。
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

### 2.6 附件存储策略：R2 为主，本地兜底

附件存储走**适配层**，同一套上传接口在两种部署目标下都能工作：

- **主路径 Cloudflare R2**：生产 / 边缘部署时，文件直传或经后端签名直传 R2，`url` 返回 R2 公共访问地址。
- **兜底路径本地磁盘（Linux）**：自管服务器部署时，文件落到本地磁盘（或挂载卷 / 兼容 S3 的 MinIO），`url` 返回本站可访问路径。
- **`storage` 字段**：Attachment 记录本次实际使用的后端（`r2` / `local`），便于排查与迁移。
- **配置驱动**：`STORAGE_DRIVER=r2|local` 决定走哪条实现，业务代码不感知差异。

> 与 M1-18（文件上传双实现）和 M1-24（一套后端双部署适配层）直接对应，是"同一份代码、两种部署目标"在存储层的具体落地。

## 三、API 设计原则

| 原则 | 规定 |
|---|---|
| 风格 | RESTful，面向资源，名词复数（`/articles`），不用动词 |
| 版本 | 路径版本化 `/api/v1`，破坏式变更才升 v2 |
| 传输 | JSON；`Content-Type: application/json`；时间用 ISO 8601 字符串 |
| 认证 | `Authorization: Bearer <access_token>`（短时效，前端存内存非 localStorage）；刷新令牌 `refreshToken` 双载体：浏览器走 HttpOnly+SameSite Cookie、移动端返回请求体由安全存储保存（详见下「认证与刷新令牌」） |
| 分页 | 偏移分页 `?page=&pageSize=`，列表统一返回 `{ list, pagination }` |
| 过滤 | 列表支持 `?category=`、`?tag=`、`?status=`、`?keyword=` |
| 排序 | `?sort=publishedAt,desc` 形式，白名单字段：`publishedAt` / `viewCount` / `createdAt` |
| 命名 | 小驼峰字段名（与 JSON 习惯一致），`snake_case` 亦可，前后端约定一致即可 |

### 公开内容可见性铁律（N2 · 安全与正确性的服务端约束）

这是契约层的**硬规则**，不能只靠本文一句标签——已在 OpenAPI 中落地：

- **公开列表只返回 `published`**：`GET /api/v1/articles` 等公开列表端点忽略 `?status=` 参数，强制只返回 `published` 文章；后台管理所需的 `draft`/`pending` 筛选由鉴权端点 `GET /api/v1/admin/articles` 提供（其 `status` 参数仅对 `author`/`admin` 生效）。
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
| POST | `/api/v1/articles` | 创建文章（会员默认 draft/pending；admin 可 published） | 是（member/author/admin） |
| PUT | `/api/v1/articles/:id` | 更新文章 | 是（作者或 admin） |
| DELETE | `/api/v1/articles/:id` | 删除（软删除） | 是（作者或 admin） |
| POST | `/api/v1/articles/:id/submit` | 草稿→待审（会员投稿） | 是（作者本人） |

### 分类 Category
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/categories` | 分类列表（树或平铺） | 否 |
| POST | `/api/v1/categories` | 创建分类 | 是（admin） |
| PUT | `/api/v1/categories/:id` | 更新分类 | 是（admin） |
| DELETE | `/api/v1/categories/:id` | 删除分类 | 是（admin） |

### 标签 Tag
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/tags` | 标签列表（含文章数） | 否 |
| POST | `/api/v1/tags` | 创建标签 | 是（admin/author） |
| DELETE | `/api/v1/tags/:id` | 删除标签 | 是（admin） |

### 评论 Comment
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/articles/:idOrSlug/comments` | 某文章评论（楼中楼） | 否 |
| POST | `/api/v1/articles/:idOrSlug/comments` | 发表评论 | 是（member） |
| DELETE | `/api/v1/comments/:id` | 删除评论 | 是（作者或 admin） |

### 上传 Upload
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/upload` | 图片/资源上传，返回 URL | 是（登录用户） |

### 会员中心 Member
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/members/:id` | 会员公开主页（资料 + 其 published 文章） | 否 |
| GET | `/api/v1/me/favorites` | 我的收藏列表 | 是（member） |
| POST | `/api/v1/me/favorites` | 添加收藏 | 是（member） |
| DELETE | `/api/v1/me/favorites/:articleId` | 取消收藏 | 是（member） |
| GET | `/api/v1/me/history` | 阅读历史 | 是（member） |
| GET | `/api/v1/me/profile` | 个人资料 | 是（member） |
| PATCH | `/api/v1/me/profile` | 更新资料 | 是（member） |
| POST | `/api/v1/me/history` | 上报阅读进度（写入 ReadingLog） | 是（member） |
| POST | `/api/v1/me/change-password` | 修改密码 | 是（member） |

### 管理 Admin（文章 / 用户）
| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/admin/articles` | 后台文章管理列表（支持 draft/pending/published 筛选） | 是（author/admin） |
| GET | `/api/v1/users` | 用户列表（分页） | 是（admin） |
| GET | `/api/v1/users/:id` | 用户详情 | 是（admin） |
| PATCH | `/api/v1/users/:id` | 变更角色/状态/会员等级 | 是（admin） |
| POST | `/api/v1/admin/articles/:id/approve` | 待审→已发布（审核通过） | 是（admin） |
| POST | `/api/v1/admin/articles/:id/status` | 任意状态置位（下架/退回） | 是（admin） |

---

## 六、错误码表（节选 v1）

| code | 含义 | HTTP |
|---|---|---|
| 0 | 成功 | 200 |
| 1001 | 用户名或密码错误 | 401 |
| 1002 | 令牌无效或过期 | 401 |
| 1003 | 刷新令牌失效，请重新登录 | 401 |
| 1004 | 缺少访问令牌 | 401 |
| 2001 | 无权限执行该操作 | 403 |
| 3001 | 资源不存在 | 404 |
| 4001 | 参数校验失败（附 errors 明细） | 400 |
| 5000 | 服务器内部错误（不向外暴露细节） | 500 |

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

## 九、开放问题（已全部确认）

1. **slug 策略（已定）**：「id 为主、slug 可选」，不做自动转写（见 §1 / OpenAPI）。
2. **分类层级（已定）**：无限级树形结构，自关联 `parent_id` + 提供 `GET /api/v1/categories/tree` 整树返回（见 §2.2）。
3. **阅读量防刷（已定）**：做。去重键（登录 `user_id` / 匿名 `ip+ua` 哈希）+ 冷却窗口 + 计数写分离，`POST /api/v1/articles/:id/view`（见 §2.4）。
4. **评论审核流（已定）**：脏话 / 违禁词过滤，命中转等长 `*`；违规比率 > 阈值（默认 10%）→ `rejected`，否则 → `approved`（转义后）；`reviewing` 为人工兜底态（见 §2.5）。
5. **附件存储（已定）**：R2 为主 + 本地磁盘兜底，配置驱动 `STORAGE_DRIVER`，Attachment 记 `storage` 字段（见 §2.6）。

---

## 十、变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-10 | v1.0 | 初版领域模型与 API 契约，作为七端共同地基 |
| 2026-08-10 | v1.1 | 会员增加 `level` 字段（仅展示）；文章状态机改为 `draft/pending/published`（会员投稿默认 pending、管理员发布即 published）；新增会员公开主页端点；slug 改为可选、id 为主 |
| 2026-08-10 | v1.2 | 新增 §2.4 阅读量防刷、§2.5 评论脏话/违禁词过滤与自动审核、§2.6 附件 R2+本地双存储；Category 改为无限级树形（/categories/tree）；Attachment 增加 `storage` 字段；第九节开放问题全部收尾 |
| 2026-08-10 | v1.3 | 评审整改：OpenAPI 补全全部 200 响应 schema、新增 ArticleSummary/分页类型（R1/R12）；刷新令牌双载体定稿、AuthResult 增 refreshToken（R4）；timestamp 改 ISO 字符串（R7）；§2.3 补 pending→draft 与 member 权限约束（R3/R11/R16）；§2.4 删消息队列与 Non-goals 对齐（R9）；§2.5 comment pending→reviewing（R18）；§2.2 主键类型口径（R13）；§2.3 软删除+slug 部分唯一索引（R10）；§三新增路由/CORS/认证补充约定（R5/R6/R8/R20） |
| 2026-08-10 | v1.4 | 复审整改（严苛标准，契约经 openapi-spec-validator 严格校验通过）：新增「公开内容可见性铁律」(N2)、阅读历史写入路径 POST /me/history(N4)、第三方登录回调扩展端点(N5)、400 校验错误 ValidationErrorList(N6)、users 404/403(N7)、分类/标签删除 409(N8)、view 可选 Bearer(N3)、登出清 Cookie(N11)、角色边界/level/注册默认角色(N13/N14/N20)、评论删除级联(N16)、排序白名单字段(N15)、§五 路径记号等价说明(N19)、R19 白名单决议持久化(N10)；修正 view 端点 404 嵌套(N1) |
