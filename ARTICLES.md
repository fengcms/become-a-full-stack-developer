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
| 成为全栈·Node 后端篇·结构化日志与请求链路追踪 | — | `articles/M1-11-结构化日志与请求链路追踪.md` | https://blog.csdn.net/fungleo/article/details/164363025 | 🟢 已发布 |
| 成为全栈·Node 后端篇·认证方案-JWT还是Session | — | `articles/M1-12-认证方案-JWT还是Session.md` | https://blog.csdn.net/fungleo/article/details/164363240 | 🟢 已发布 |
| 成为全栈·Node 后端篇·注册登录全流程实现 | — | `articles/M1-13-注册登录全流程实现.md` | https://blog.csdn.net/fungleo/article/details/164396193 | 🟢 已发布 |
| 成为全栈·Node 后端篇·权限模型-从认证到RBAC | — | `articles/M1-14-权限模型-从认证到RBAC.md` | https://blog.csdn.net/fungleo/article/details/164396910 | 🟢 已发布 |
| 成为全栈·Node 后端篇·文章CRUD与投稿状态机 | — | `articles/M1-15-文章CRUD与投稿状态机.md` | https://blog.csdn.net/fungleo/article/details/164453121 | 🟢 已发布 |
| 成为全栈·Node 后端篇·分类与标签-多对多关系的建模与查询 | — | `articles/M1-16-分类与标签-多对多关系的建模与查询.md` | https://blog.csdn.net/fungleo/article/details/164425616 | 🟢 已发布 |
| 成为全栈·Node 后端篇·列表接口三件套-分页-筛选-排序 | — | `articles/M1-17-列表接口三件套-分页-筛选-排序.md` | https://blog.csdn.net/fungleo/article/details/164425686 | 🟢 已发布 |
| 成为全栈·Node 后端篇·文件上传-R2与本地磁盘双实现与签名直传 | — | `articles/M1-18-文件上传-R2与本地磁盘双实现与签名直传.md` | https://blog.csdn.net/fungleo/article/details/164453365 | 🟢 已发布 |
| 成为全栈·Node 后端篇·全文搜索-从LIKE到全文索引 | — | `articles/M1-19-全文搜索-从LIKE到全文索引.md` | https://blog.csdn.net/fungleo/article/details/164582848 | 🟢 已发布 |
| 成为全栈·Node 后端篇·接口文档自动化-让OpenAPI与代码不脱节 | — | `articles/M1-20-接口文档自动化-让OpenAPI与代码不脱节.md` | https://blog.csdn.net/fungleo/article/details/164584149 | 🟢 已发布 |
| 成为全栈·Node 后端篇·后端测试策略-单元-集成与测试数据库 | — | `articles/M1-21-后端测试策略-单元-集成与测试数据库.md` | https://blog.csdn.net/fungleo/article/details/164720486 | 🟢 已发布 |
| 成为全栈·Node 后端篇·容器化-给Node应用写一个像样的Dockerfile | — | `articles/M1-22-容器化-给Node应用写一个像样的Dockerfile.md` | https://blog.csdn.net/fungleo/article/details/164721321 | 🟢 已发布 |
| 成为全栈·Node 后端篇·部署上线-从本地起服到真正对外服务 | — | `articles/M1-23-部署上线-从本地起服到真正对外服务.md` | https://blog.csdn.net/fungleo/article/details/164815866 | 🟢 已发布 |
| 成为全栈·Node 后端篇·一套后端双部署-适配层如何让一份代码跑在两套运行时 | — | `articles/M1-24-一套后端双部署-适配层如何让一份代码跑在两套运行时.md` | https://blog.csdn.net/fungleo/article/details/164816647 | 🟢 已发布 |
| 成为全栈·Node 后端篇·分类树-无限级分类的存储-查询与环检测 | — | `articles/M1-25-分类树-无限级分类的存储-查询与环检测.md` | https://blog.csdn.net/fungleo/article/details/164973360 | 🟢 已发布 |
| 成为全栈·Node 后端篇·阅读量防刷-去重冷却与计数写分离 | — | `articles/M1-26-阅读量防刷-去重冷却与计数写分离.md` | https://blog.csdn.net/fungleo/article/details/164973883 | 🟢 已发布 |
| 成为全栈·Node 后端篇·评论内容安全-敏感词过滤-三态审核与级联删除 | — | `articles/M1-27-评论内容安全-敏感词过滤-三态审核与级联删除.md` | https://blog.csdn.net/fungleo/article/details/165110811 | 🟢 已发布 |
| 成为全栈·Node 后端篇·辅助接口-相邻-相关-目录-统计与搜索的薄路由实现 | — | `articles/M1-28-辅助接口-相邻-相关-目录-统计与搜索的薄路由实现.md` | https://blog.csdn.net/fungleo/article/details/165111053 | 🟢 已发布 |
| 成为全栈·Node 后端篇·点赞系统-幂等点赞与计数原子增减 | — | `articles/M1-29-点赞系统-幂等点赞与计数原子增减.md` | https://blog.csdn.net/fungleo/article/details/165292499 | 🟢 已发布 |
| 成为全栈·Node 后端篇·通知系统-事件消费与已读态管理 | — | `articles/M1-30-通知系统-事件消费与已读态管理.md` | https://blog.csdn.net/fungleo/article/details/165293002 | 🟢 已发布 |
| 成为全栈·Node 后端篇·数据建模手艺-状态机-冗余计数与适配层的心法清单 | — | `articles/M1-31-数据建模手艺-状态机-冗余计数与适配层的心法清单.md` | https://blog.csdn.net/fungleo/article/details/165445806 | 🟢 已发布 |
| 成为全栈·Node 后端篇·冻结契约如何兼容增补：为微信登录补齐最小能力 | `node-backend-v1.0.4` | `articles/M1-32-冻结契约如何兼容增补-为微信登录补齐最小能力.md` | — | 🟡 草稿中（已确认，待发布） |
| 成为全栈·Node 后端篇·微信登录与首次账号设置：把平台身份接到自己的用户体系 | `node-backend-v1.0.4` | `articles/M1-33-微信登录与首次账号设置-把平台身份接到自己的用户体系.md` | — | 🟡 草稿中（已确认，待发布） |
| 成为全栈·Node 后端篇·Node 测试通过，Workers 登录为什么仍然 500 | `node-backend-v1.0.4` | `articles/M1-34-Node测试通过-Workers登录为什么仍然500.md` | — | 🟡 草稿中（已确认，待发布） |

> M1-32～34 已获作者确认，等待发布；对应后端里程碑 `node-backend-v1.0.4` 已创建并推送。该 tag 保留微信兼容增补与 Workers 修复，不使用原 node-backend-v1.0 快照。

## M2 · React 管理后台（实现中）

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·React 管理后台篇·Vite + React + TypeScript：搭起一个有门禁的后台工程 | — | `articles/M2-01-Vite-React-TypeScript-搭起一个有门禁的后台工程.md` | https://blog.csdn.net/fungleo/article/details/165447601 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·后台骨架：布局、数据路由与分层守卫 | — | `articles/M2-02-后台骨架-布局数据路由与分层守卫.md` | https://blog.csdn.net/fungleo/article/details/165589276 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·请求层封装：统一信封、业务错误与并发 401 | — | `articles/M2-03-请求层封装-统一信封业务错误与并发401.md` | https://blog.csdn.net/fungleo/article/details/165590548 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·OpenAPI 生成类型，为什么请求函数仍然手写 | — | `articles/M2-04-OpenAPI生成类型为什么请求函数仍然手写.md` | https://blog.csdn.net/fungleo/article/details/165721265 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·服务端状态、会话状态、界面状态：不要都塞进 Zustand | — | `articles/M2-05-三类状态不要都塞进Zustand.md` | https://blog.csdn.net/fungleo/article/details/165722061 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·TanStack Query 不只是缓存：失效、派生与失败恢复 | — | `articles/M2-06-TanStack-Query不只是缓存.md` | https://blog.csdn.net/fungleo/article/details/165847415 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·前端鉴权闭环：内存令牌、刷新旋转与路由守卫 | — | `articles/M2-07-前端鉴权闭环-内存令牌刷新旋转与路由守卫.md` | https://blog.csdn.net/fungleo/article/details/165848076 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·列表页范式：让分页、筛选和返回位置进入 URL | — | `articles/M2-08-列表页范式-让分页筛选和返回位置进入URL.md` | https://blog.csdn.net/fungleo/article/details/165984930 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·表单页范式：校验、数据回填与未保存保护 | — | `articles/M2-09-表单页范式-校验数据回填与未保存保护.md` | https://blog.csdn.net/fungleo/article/details/165986069 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·Markdown 编辑器：预览、暗色主题与连续图片粘贴 | — | `articles/M2-10-Markdown编辑器-预览暗色主题与连续图片粘贴.md` | https://blog.csdn.net/fungleo/article/details/166107729 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·文章管理工作流：保存修改、投稿、发布与下架 | — | `articles/M2-11-文章管理工作流-保存修改投稿发布与下架.md` | https://blog.csdn.net/fungleo/article/details/166110378 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·按钮级权限：能力映射、菜单过滤与自锁保护 | — | `articles/M2-12-按钮级权限-能力映射菜单过滤与自锁保护.md` | https://blog.csdn.net/fungleo/article/details/166233264 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·评论审核工作流：把状态下拉改成可理解的动作 | — | `articles/M2-13-评论审核工作流-把状态下拉改成可理解的动作.md` | https://blog.csdn.net/fungleo/article/details/166234769 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·分类树与标签管理：层级数据在后台怎么编辑 | — | `articles/M2-14-分类树与标签管理-层级数据在后台怎么编辑.md` | https://blog.csdn.net/fungleo/article/details/166353905 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·异步交互的一致性：上传、批量操作与部分失败 | — | `articles/M2-15-异步交互的一致性-上传批量操作与部分失败.md` | https://blog.csdn.net/fungleo/article/details/166354291 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·管理功能与账号中心：不同能力如何共享同一应用 | — | `articles/M2-16-管理功能与账号中心-不同能力如何共享同一应用.md` | https://blog.csdn.net/fungleo/article/details/166471141 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·站点配置页：如何组织低频但高风险的全局设置 | — | `articles/M2-17-站点配置页-如何组织低频但高风险的全局设置.md` | https://blog.csdn.net/fungleo/article/details/166471607 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·统计看板：从数字堆砌到可执行的工作入口 | — | `articles/M2-18-统计看板-从数字堆砌到可执行的工作入口.md` | https://blog.csdn.net/fungleo/article/details/166582519 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·Vite 构建优化：先测体积，再决定怎么拆 | — | `articles/M2-19-Vite构建优化-先测体积再决定怎么拆.md` | https://blog.csdn.net/fungleo/article/details/166582771 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·前端质量门禁：契约守卫、纯函数测试与浏览器验收 | — | `articles/M2-20-前端质量门禁-契约守卫纯函数测试与浏览器验收.md` | https://blog.csdn.net/fungleo/article/details/166643861 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·React SPA 部署：静态托管、路由回退与 API 反代 | — | `articles/M2-21-React-SPA部署-静态托管路由回退与API反代.md` | https://blog.csdn.net/fungleo/article/details/166643883 | 🟢 已发布 |
| 成为全栈·React 管理后台篇·总复盘：从“接口能调通”到“后台值得使用” | — | `articles/M2-22-总复盘-从接口能调通到后台值得使用.md` | https://blog.csdn.net/fungleo/article/details/166690803 | 🟢 已发布 |

---

## M3 · Next.js 网站前台（含会员中心）

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·Next.js 网站前台篇·App Router 与 CSR 时代的思维差异 | — | `articles/M3-01-App-Router与CSR时代的思维差异.md` | https://blog.csdn.net/fungleo/article/details/166690841 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·服务端组件与客户端组件：边界画错，整棵树都会变重 | — | `articles/M3-02-服务端组件与客户端组件-边界画错整棵树都会变重.md` | https://blog.csdn.net/fungleo/article/details/166737733 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·SSR、SSG、ISR 与动态渲染：不要给整站贴一个标签 | — | `articles/M3-03-SSR-SSG-ISR与动态渲染-不要给整站贴一个标签.md` | https://blog.csdn.net/fungleo/article/details/166737776 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·数据获取与缓存：60 秒再验证背后到底发生了什么 | — | `articles/M3-04-数据获取与缓存-60秒再验证背后到底发生了什么.md` | https://blog.csdn.net/fungleo/article/details/166784128 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·内容门户首页：焦点、最新、文章流与侧栏如何组织 | — | `articles/M3-05-内容门户首页-焦点最新文章流与侧栏如何组织.md` | https://blog.csdn.net/fungleo/article/details/166784376 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·多级分类、标签与 URL：让内容导航既可读又可索引 | — | `articles/M3-06-多级分类标签与URL-让内容导航既可读又可索引.md` | https://blog.csdn.net/fungleo/article/details/166835906 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·文章列表：服务端首屏与客户端持续加载怎样协作 | — | `articles/M3-07-文章列表-服务端首屏与客户端持续加载怎样协作.md` | https://blog.csdn.net/fungleo/article/details/166836287 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·文章详情：Markdown、代码高亮与目录必须共享解析结果 | — | `articles/M3-08-文章详情-Markdown代码高亮与目录必须共享解析结果.md` | https://blog.csdn.net/fungleo/article/details/166885283 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·文章阅读辅助：上下篇、面包屑、相关文章与阅读记录 | — | `articles/M3-09-文章阅读辅助-上下篇面包屑相关文章与阅读记录.md` | https://blog.csdn.net/fungleo/article/details/166885558 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·Next.js SEO：metadata、结构化数据、sitemap 与 robots | — | `articles/M3-10-Nextjs-SEO-metadata结构化数据sitemap与robots.md` | https://blog.csdn.net/fungleo/article/details/166945924 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·C 端认证：内存令牌、HttpOnly Cookie 与会话代次 | — | `articles/M3-11-C端认证-内存令牌HttpOnly-Cookie与会话代次.md` | https://blog.csdn.net/fungleo/article/details/166945972 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·同源 BFF 代理：API、附件、Cookie 与跨站写入保护 | — | `articles/M3-12-同源BFF代理-API附件Cookie与跨站写入保护.md` | https://blog.csdn.net/fungleo/article/details/166991347 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·会员中心：资料、密码与个人数据为什么不能进公共缓存 | — | `articles/M3-13-会员中心-资料密码与个人数据为什么不能进公共缓存.md` | https://blog.csdn.net/fungleo/article/details/166991388 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·点赞、收藏与阅读历史：三种互动状态的所有权不同 | — | `articles/M3-14-点赞收藏与阅读历史-三种互动状态的所有权不同.md` | https://blog.csdn.net/fungleo/article/details/167033186 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·评论系统：叠楼、回复、删除与内容审核如何落到前台 | — | `articles/M3-15-评论系统-叠楼回复删除与内容审核如何落到前台.md` | https://blog.csdn.net/fungleo/article/details/167033673 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·会员投稿工作流：草稿、预览、投稿、撤回与重新送审 | — | `articles/M3-16-会员投稿工作流-草稿预览投稿撤回与重新送审.md` | https://blog.csdn.net/fungleo/article/details/167079523 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·搜索页：实时查询、URL 状态与“没有结果”不是“请求失败” | — | `articles/M3-17-搜索页-实时查询URL状态与没有结果不是请求失败.md` | https://blog.csdn.net/fungleo/article/details/167080343 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·会员公开主页与通知中心：公开身份和私有消息如何分界 | — | `articles/M3-18-会员公开主页与通知中心-公开身份和私有消息如何分界.md` | https://blog.csdn.net/fungleo/article/details/167121410 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·站点设置如何驱动页头、页脚与 SEO | — | `articles/M3-19-站点设置如何驱动页头页脚与SEO.md` | https://blog.csdn.net/fungleo/article/details/167121971 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·响应式、可访问性与错误状态：内容站不能只验桌面首页 | — | `articles/M3-20-响应式可访问性与错误状态-内容站不能只验桌面首页.md` | https://blog.csdn.net/fungleo/article/details/167172856 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·Core Web Vitals 与前台性能：先保护正文，再优化装饰模块 | — | `articles/M3-21-Core-Web-Vitals与前台性能-先保护正文再优化装饰模块.md` | https://blog.csdn.net/fungleo/article/details/167172892 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·质量门禁：契约测试、会话竞态、双运行时与浏览器验收 | — | `articles/M3-22-质量门禁-契约测试会话竞态双运行时与浏览器验收.md` | https://blog.csdn.net/fungleo/article/details/167218692 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·OpenNext 部署 Cloudflare：构建成功不等于缓存正确 | — | `articles/M3-23-OpenNext部署Cloudflare-构建成功不等于缓存正确.md` | https://blog.csdn.net/fungleo/article/details/167218828 | 🟢 已发布 |
| 成为全栈·Next.js 网站前台篇·总复盘：做一个公开内容站的真实成本 | — | `articles/M3-24-总复盘-做一个公开内容站的真实成本.md` | https://blog.csdn.net/fungleo/article/details/167218879 | 🟢 已发布 |

---

## M4 · Flutter App（28 篇，发布进行中）

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·Flutter App 篇·从 React 到 Flutter：声明式 UI 相似，状态与布局模型哪里不同 | — | `articles/M4-01-从React到Flutter-声明式UI相似状态与布局模型哪里不同.md` | https://blog.csdn.net/fungleo/article/details/167266219 | 🟢 已发布 |
| 成为全栈·Flutter App 篇·给 TypeScript 开发者的 Dart：空安全、Future 与异步错误 | — | `articles/M4-02-给TypeScript开发者的Dart-空安全Future与异步错误.md` | https://blog.csdn.net/fungleo/article/details/167266845 | 🟢 已发布 |
| 成为全栈·Flutter App 篇·Flutter 工程骨架与 OpenAPI 代码生成 | — | `articles/M4-03-Flutter工程骨架与OpenAPI代码生成.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·把高保真原型落成 Design Token 与 Flutter 组件 | — | `articles/M4-04-把高保真原型落成DesignToken与Flutter组件.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·go_router 与四 Tab App Shell：保留导航状态、深链和登录回跳 | — | `articles/M4-05-go_router与四TabAppShell-保留导航状态深链和登录回跳.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Riverpod 状态边界：会话、服务端数据和表单草稿 | — | `articles/M4-06-Riverpod状态边界-会话服务端数据和表单草稿.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Dio + Repository：统一响应信封与模型适配 | — | `articles/M4-07-Dio-Repository统一响应信封与模型适配.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·移动端错误与限流：429、重试和写请求边界 | — | `articles/M4-08-移动端错误与限流-429重试和写请求边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Refresh Token 旋转与并发 401：安全存储与会话代次 | — | `articles/M4-09-Refresh-Token旋转与并发401-安全存储与会话代次.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·用真实 API 构建首页：焦点、最新与热门内容 | — | `articles/M4-10-用真实API构建首页-焦点最新与热门内容.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·分类、标签与搜索：移动端内容发现 | — | `articles/M4-11-分类标签与搜索-移动端内容发现.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·列表分页与下拉刷新：去重、失败保留和返回位置 | — | `articles/M4-12-列表分页与下拉刷新-去重失败保留和返回位置.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Flutter Markdown 阅读器：支持范围与渲染边界 | — | `articles/M4-13-Flutter-Markdown阅读器-支持范围与渲染边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·服务端目录与文章辅助阅读：锚点、上下篇、浏览量和阅读历史 | — | `articles/M4-14-服务端目录与文章辅助阅读-锚点上下篇浏览量和阅读历史.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·内置 WebView：网页历史、App 返回与外链安全 | — | `articles/M4-15-内置WebView-网页历史App返回与外链安全.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·点赞、收藏与阅读历史：乐观更新和失败回退 | — | `articles/M4-16-点赞收藏与阅读历史-乐观更新和失败回退.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·叠楼评论：跨页重组与直接回复上下文 | — | `articles/M4-17-叠楼评论-跨页重组与直接回复上下文.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·会员中心：资料、密码、通知与私有数据缓存 | — | `articles/M4-18-会员中心-资料密码通知与私有数据缓存.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·投稿状态机：草稿、待审核与已发布 | — | `articles/M4-19-投稿状态机-草稿待审核与已发布.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Markdown 编辑器：编辑、预览与离开保护 | — | `articles/M4-20-Markdown编辑器-编辑预览与离开保护.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·图片上传：原生文件、校验、进度与失败恢复 | — | `articles/M4-21-图片上传-原生文件校验进度与失败恢复.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·本机稿件恢复：账号隔离、冲突判断与恢复决策 | — | `articles/M4-22-本机稿件恢复-账号隔离冲突判断与恢复决策.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Flutter 缓存：fresh、stale、expired 与账号边界 | — | `articles/M4-23-Flutter缓存-fresh-stale-expired与账号边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·写后缓存失效与图片缓存治理 | — | `articles/M4-24-写后缓存失效与图片缓存治理.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·主题与可访问性：深浅色、大字号和触控体验 | — | `articles/M4-25-主题与可访问性-深浅色大字号和触控体验.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·测试分层：单元、Widget、集成与线上只读验证 | — | `articles/M4-26-测试分层-单元Widget集成与线上只读验证.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·Flutter 构建与发布准备：Android、iOS 和签名边界 | — | `articles/M4-27-Flutter构建与发布准备-Android-iOS和签名边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Flutter App 篇·第四批复盘：复用了什么，移动端又新增了什么 | — | `articles/M4-28-第四批复盘-复用了什么移动端又新增了什么.md` | — | 🟡 草稿中（正文完成，待发布） |

---

## M5 · Taro 小程序（24 篇正文完成，待发布）

> 编号按路线图保留，建议阅读顺序：01 → 02 → 09 → 06 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 04 → 03 → 19 → 17 → 18 → 20 → 21 → 23 → 22 → 24 → 05 → 07 → 08。后端以 `node-backend-v1.0.4` 为参照；小程序实现以写作开始时 `7effc02` 为参照，尚未单独创建小程序里程碑 tag。写作检查见 [M5 创作与自检记录](docs/M5-文章创作与自检记录.md)。

| 文章标题 | tag | 代码 / 草稿位置 | CSDN 链接 | 状态 |
|---|---|---|---|---|
| 成为全栈·Taro 小程序篇·Taro 一套代码多端：这次究竟复用了什么 | — | `articles/M5-01-Taro一套代码多端-这次究竟复用了什么.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·小程序限制清单：哪些前端习惯要改掉 | — | `articles/M5-02-小程序限制清单-哪些前端习惯要改掉.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·微信快捷登录与首次凭据设置：接入已有账号体系 | — | `articles/M5-03-微信快捷登录与首次凭据设置-接入已有账号体系.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·原生分享与文章入口：小程序的平台能力边界 | — | `articles/M5-04-原生分享与文章入口-小程序的平台能力边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·开发工具跑通之后：演示验收与正式发布还有哪些差距 | — | `articles/M5-05-开发工具跑通之后-演示验收与正式发布还有哪些差距.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·多端代码如何组织：哪些属于业务，哪些属于微信 | — | `articles/M5-06-多端代码如何组织-哪些属于业务哪些属于微信.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·小程序与 App 的能力取舍：相同需求为什么需要不同实现 | — | `articles/M5-07-小程序与App的能力取舍-相同需求为什么需要不同实现.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·第五批复盘：从复用接口到交付一个小程序 | — | `articles/M5-08-第五批复盘-从复用接口到交付一个小程序.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·Taro 工程落地：锁定依赖、AppID 与可复现构建 | — | `articles/M5-09-Taro工程落地-锁定依赖AppID与可复现构建.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·把 APP 原型落到小程序：图标、Design Token 与深色模式 | — | `articles/M5-10-把APP原型落到小程序-图标DesignToken与深色模式.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·四 Tab 与页面栈：小程序生命周期如何影响页面状态 | — | `articles/M5-11-四Tab与页面栈-小程序生命周期如何影响页面状态.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·小程序请求与会话层：统一信封、并发 401 与账号切换 | — | `articles/M5-12-小程序请求与会话层-统一信封并发401与账号切换.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·有界缓存：页面返回怎样快起来，又不串账号 | — | `articles/M5-13-有界缓存-页面返回怎样快起来又不串账号.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·首页、分类与搜索：把内容发现做成可恢复的数据流 | — | `articles/M5-14-首页分类与搜索-把内容发现做成可恢复的数据流.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·小程序 Markdown 阅读器：从 AST 到受控原生组件 | — | `articles/M5-15-小程序Markdown阅读器-从AST到受控原生组件.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·文章阅读辅助：目录、上下篇与外链路由 | — | `articles/M5-16-文章阅读辅助-目录上下篇与外链路由.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·点赞与收藏：乐观更新如何跨页面保持一致 | — | `articles/M5-17-点赞与收藏-乐观更新如何跨页面保持一致.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·叠楼评论：如何从扁平分页恢复回复关系 | — | `articles/M5-18-叠楼评论-如何从扁平分页恢复回复关系.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·会员中心：资料、通知与私人列表的边界 | — | `articles/M5-19-会员中心-资料通知与私人列表的边界.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·会员投稿状态机：保存、提交、撤回与防重复创建 | — | `articles/M5-20-会员投稿状态机-保存提交撤回与防重复创建.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·Markdown 投稿编辑器：原生输入、工具条与预览 | — | `articles/M5-21-Markdown投稿编辑器-原生输入工具条与预览.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·本机草稿恢复：账号、稿件与云端冲突怎么区分 | — | `articles/M5-22-本机草稿恢复-账号稿件与云端冲突怎么区分.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·图片上传：选择、取消、会话切换与提交协调 | — | `articles/M5-23-图片上传-选择取消会话切换与提交协调.md` | — | 🟡 草稿中（正文完成，待发布） |
| 成为全栈·Taro 小程序篇·小程序质量验证：逻辑测试、真实后端与开发工具各证明什么 | — | `articles/M5-24-小程序质量验证-逻辑测试真实后端与开发工具各证明什么.md` | — | 🟡 草稿中（正文完成，待发布） |

---

*说明：`articles/` 为写作期临时草稿目录；文章发布到 CSDN 后，将链接回填本表「CSDN 链接」列并置 🟢，代码状态由对应 tag 锁定。本表随每篇文章发布持续追加。链接获取与回填流程见《docs/链接与发布协作约定.md》。*
