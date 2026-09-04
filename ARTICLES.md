# ARTICLES.md · 文章 ↔ 代码 ↔ tag ↔ 链接 对照表

> 本表是工程公约（M0-06）的核心交付：把「文章标题 ↔ 对应 git tag ↔ 代码位置 / CSDN 链接」钉在一起，支持双向跳转。
> 约定：本系列采用**里程碑式 tag**——仅在契约冻结 / 各端代码定稿时打（如 `contract-v1.11.0`、`node-backend-v1.0`），命名直接表达「哪个端、什么状态」；**M0 产品侧不打 tag**。读者 `git checkout <里程碑>` 即拿到该阶段完整代码状态。详见《docs/链接与发布协作约定.md》第八节。
> 状态图例：🟡 草稿中（未发布）｜🟢 已发布（链接回填）。
> CSDN 链接列：发布并 sync 后，由统筹 AI 从 blog AI 维护的 `materials/csdn-已发布链接.md` 镜像回填（流程见《docs/链接与发布协作约定.md》）。

## M0 · 开篇与规划

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·产品篇·为什么前端工程师要走向全栈：边界、价值与代价 | — | `articles/M0-01-为什么前端工程师要走向全栈.md` | https://blog.csdn.net/fungleo/article/details/164119914 | 🟢 已发布 |
| 成为全栈·产品篇·用一个真实系统串起全栈：项目全貌与七个子项目 | — | `articles/M0-02-用一个真实系统串起全栈-项目全貌与七个子项目.md` | https://blog.csdn.net/fungleo/article/details/164120426 | 🟢 已发布 |
| 成为全栈·产品篇·技术选型不是投票：七个子项目技术栈的定法 | — | `articles/M0-03-技术选型不是投票-七个子项目技术栈的定法.md` | https://blog.csdn.net/fungleo/article/details/164121738 | 🟢 已发布 |
| 成为全栈·产品篇·领域建模：一个文章系统有哪些实体、什么关系 | — | `articles/M0-04-领域建模-一个文章系统有哪些实体什么关系.md` | https://blog.csdn.net/fungleo/article/details/164139553 | 🟢 已发布 |
| 成为全栈·产品篇·契约先行：设计一套被七个端复用的 API | — | `articles/M0-05-契约先行-设计一套被七个端复用的API.md` | https://blog.csdn.net/fungleo/article/details/164140515 | 🟢 已发布 |
| 成为全栈·产品篇·工程公约：git tag、仓库组织与 CSDN 发布流程 | — | `articles/M0-06-工程公约-git-tag仓库组织与CSDN发布流程.md` | https://blog.csdn.net/fungleo/article/details/164166250 | 🟢 已发布 |
| 成为全栈·产品篇·本系列怎么读：主线、支线与学习路径 | — | `articles/M0-07-本系列怎么读-主线支线与学习路径.md` | https://blog.csdn.net/fungleo/article/details/164167103 | 🟢 已发布 |
| 成为全栈·产品篇·全栈能力地图：你读完这套会拥有什么 | — | `articles/M0-08-全栈能力地图-你读完这套会拥有什么.md` | https://blog.csdn.net/fungleo/article/details/164167281 | 🟢 已发布 |

## M1 · Node 后端（实现中）

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·Node 后端篇·后端工程从零搭建-TypeScript目录与热更新 | — | `articles/M1-01-后端工程从零搭建-TypeScript目录与热更新.md` | https://blog.csdn.net/fungleo/article/details/164186950 | 🟢 已发布 |
| 成为全栈·Node 后端篇·框架选型-Express-Koa-Fastify-NestJS的差异与为何选Hono | — | `articles/M1-02-框架选型-Express-Koa-Fastify-NestJS的差异与为何选Hono.md` | https://blog.csdn.net/fungleo/article/details/164187017 | 🟢 已发布 |
| 成为全栈·Node 后端篇·分层架构-Controller-Service-Repository的边界 | — | `articles/M1-03-分层架构-Controller-Service-Repository的边界.md` | https://blog.csdn.net/fungleo/article/details/164209137 | 🟢 已发布 |
| 成为全栈·Node 后端篇·数据库选型-关系型还是文档型 | — | `articles/M1-04-数据库选型-关系型还是文档型.md` | https://blog.csdn.net/fungleo/article/details/164209279 | 🟢 已发布 |
| 成为全栈·Node 后端篇·ORM为什么选Drizzle-类型安全与D1适配 | — | `articles/M1-05-ORM为什么选Drizzle-类型安全与D1适配.md` | https://blog.csdn.net/fungleo/article/details/164254717 | 🟢 已发布 |
| 成为全栈·Node 后端篇·数据迁移-schema变更如何不弄脏线上数据 | — | `articles/M1-06-数据迁移-schema变更如何不弄脏线上数据.md` | https://blog.csdn.net/fungleo/article/details/164254868 | 🟢 已发布 |
| 成为全栈·Node 后端篇·配置管理-环境变量-多环境与密钥安全 | — | `articles/M1-07-配置管理-环境变量-多环境与密钥安全.md` | https://blog.csdn.net/fungleo/article/details/164288947 | 🟢 已发布 |
| 成为全栈·Node 后端篇·统一响应结构-HTTP状态码与业务码如何分工 | — | `articles/M1-08-统一响应结构-HTTP状态码与业务码如何分工.md` | https://blog.csdn.net/fungleo/article/details/164289071 | 🟢 已发布 |
| 成为全栈·Node 后端篇·错误处理-异常分层与全局捕获 | — | `articles/M1-09-错误处理-异常分层与全局捕获.md` | https://blog.csdn.net/fungleo/article/details/164327333 | 🟢 已发布 |
| 成为全栈·Node 后端篇·参数校验-为什么必须在最外层做 | — | `articles/M1-10-参数校验-为什么必须在最外层做.md` | https://blog.csdn.net/fungleo/article/details/164327423 | 🟢 已发布 |
| 成为全栈·Node 后端篇·结构化日志与请求链路追踪 | — | `articles/M1-11-结构化日志与请求链路追踪.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·认证方案-JWT还是Session | — | `articles/M1-12-认证方案-JWT还是Session.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·注册登录全流程实现 | — | `articles/M1-13-注册登录全流程实现.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·权限模型-从认证到RBAC | — | `articles/M1-14-权限模型-从认证到RBAC.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·文章CRUD与投稿状态机 | — | `articles/M1-15-文章CRUD与投稿状态机.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·分类与标签-多对多关系的建模与查询 | — | `articles/M1-16-分类与标签-多对多关系的建模与查询.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·列表接口三件套-分页-筛选-排序 | — | `articles/M1-17-列表接口三件套-分页-筛选-排序.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·文件上传-R2与本地磁盘双实现与签名直传 | — | `articles/M1-18-文件上传-R2与本地磁盘双实现与签名直传.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·全文搜索-从LIKE到全文索引 | — | `articles/M1-19-全文搜索-从LIKE到全文索引.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·接口文档自动化-让OpenAPI与代码不脱节 | — | `articles/M1-20-接口文档自动化-让OpenAPI与代码不脱节.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·后端测试策略-单元-集成与测试数据库 | — | `articles/M1-21-后端测试策略-单元-集成与测试数据库.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·容器化-给Node应用写一个像样的Dockerfile | — | `articles/M1-22-容器化-给Node应用写一个像样的Dockerfile.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·部署上线-从本地起服到真正对外服务 | — | `articles/M1-23-部署上线-从本地起服到真正对外服务.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·一套后端双部署-适配层如何让一份代码跑在两套运行时 | — | `articles/M1-24-一套后端双部署-适配层如何让一份代码跑在两套运行时.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·分类树-无限级分类的存储-查询与环检测 | — | `articles/M1-25-分类树-无限级分类的存储-查询与环检测.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·阅读量防刷-去重冷却与计数写分离 | — | `articles/M1-26-阅读量防刷-去重冷却与计数写分离.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·评论内容安全-敏感词过滤-三态审核与级联删除 | — | `articles/M1-27-评论内容安全-敏感词过滤-三态审核与级联删除.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·辅助接口-相邻-相关-目录-统计与搜索的薄路由实现 | — | `articles/M1-28-辅助接口-相邻-相关-目录-统计与搜索的薄路由实现.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·点赞系统-幂等点赞与计数原子增减 | — | `articles/M1-29-点赞系统-幂等点赞与计数原子增减.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·通知系统-事件消费与已读态管理 | — | `articles/M1-30-通知系统-事件消费与已读态管理.md` | — | 🟡 草稿中 |
| 成为全栈·Node 后端篇·数据建模手艺-状态机-冗余计数与适配层的心法清单 | — | `articles/M1-31-数据建模手艺-状态机-冗余计数与适配层的心法清单.md` | — | 🟡 草稿中 |

---

*说明：`articles/` 为写作期临时草稿目录；文章发布到 CSDN 后，将链接回填本表「CSDN 链接」列并置 🟢，代码状态由对应 tag 锁定。本表随每篇文章发布持续追加。链接获取与回填流程见《docs/链接与发布协作约定.md》。*
