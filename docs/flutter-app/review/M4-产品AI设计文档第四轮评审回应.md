# M4 Flutter 产品 AI 设计文档第四轮评审回应

评审报告：[`M4-产品AI设计文档第四轮评审报告.md`](./M4-产品AI设计文档第四轮评审报告.md)

## 总体结论

本轮意见全部采纳并已同步到页面规格、接口映射、阶段计划和验收矩阵。重点是把已有契约端点真正纳入设计，避免 APP 自行重复实现；明确私有投稿预览的数据来源；并把所有声明 429 的 operation 纳入限流处理和验收。

本轮不修改 OpenAPI 或后端实现。需要澄清但不改变既有语义的文章状态副作用，继续作为 Phase 4 的强制前置条件；未澄清前不把 pending 保存行为视为已由契约保证。

逐份回读时还发现 `01-技术方案与工程边界.md` 原有一句“目录从同一 AST/解析结果派生”，容易被理解为 Flutter 本地生成目录，与 `/toc` 唯一来源冲突。因此同步修正为服务端 `/toc` 提供目录数据，Flutter 只负责将目录项连接到渲染标题锚点。

## 逐项处理结果

| 项目 | 结论 | 处理 |
|---|---|---|
| N-16 文章目录、上下篇、阅读量、分类树端点漏登 | 采纳，Phase 0 文档收敛 | `03` 登记 `/articles/{id}/toc`、`/adjacent`、`POST /view`、`/categories/tree`；分类平铺 `/categories` 与整树端点明确区分。目录改用服务端结果作为唯一事实源。 |
| 子资源路径需要整数文章 id | 采纳 | 文章详情先用 id 或 slug 读取，再从响应取整数 `Article.id` 调用 toc、adjacent、view；写入了 `02`、`03` 和 Phase 2 出口条件。 |
| 可选鉴权端点自动附加 Bearer | 采纳 | `03` 明确有 access token 时自动附加 Bearer、无 token 时仍允许请求，并说明 `/view` 的 user_id 与匿名 ip+ua 去重差异。 |
| 阅读量与阅读历史职责分离 | 采纳 | `/articles/{id}/view` 只递增阅读量；`/me/history` 独立记录登录用户历史；两者分别调用并分别验收。 |
| N-14 投稿预览数据源 | 采纳 | 投稿预览使用带 Bearer 的 `GET /articles/{idOrSlug}` 读取作者本人的未发布文章；明确契约不存在 `/me/articles/{id}`，未发布稿件对匿名/非作者仍不可见。 |
| N-12 Phase 3 错误码清单 | 采纳 | Phase 3 出口补充 1001/1002/3002/4001，并保留 1003/1004/1005/5001；列出对应的登录、会话、冲突、校验和限流反馈。 |
| N-13 限流验收无矩阵落点 | 采纳 | Phase 2 前置检查和 `05` 验收矩阵加入对公开读取、可选鉴权 view、认证接口的 429/5001 注入验证，检查 Retry-After、有界退避与恢复。 |
| N-17 “鉴权端点不设此限”措辞有歧义 | 采纳 | `03` 改为逐 operation 看 OpenAPI 明确声明的 429 response；点名 login/register/refresh/callback 也需处理 5001，不从 `/auth`、`/me` 路径名称推断。 |
| N-15 新建状态行与 Phase 4 双向出口 | 采纳 | `02` 矩阵增加“新建（尚未创建）”，明确 POST 显式发送 draft/pending；Phase 4 出口同时验收 draft 保持 draft 与 pending 保持 pending。 |

## 已确定的端点使用规则

- 分类页使用 `GET /categories/tree` 获取完整多级树；`GET /categories` 是平铺列表。
- 文章目录使用 `GET /articles/{id}/toc` 返回的 `level/text/anchor`，Flutter 用服务端 anchor 定位标题；上下篇使用 `GET /articles/{id}/adjacent`。客户端不得用 slug 代替这两个端点要求的整数 id。
- 已发布文章的详情页加载后调用 `POST /articles/{id}/view`；登录用户必须附带 Bearer，以便按用户身份去重。登录阅读历史另走 `POST /me/history`。
- 私人投稿预览使用 `GET /articles/{idOrSlug}` 并附带作者 Bearer；未登录、非作者或文章不存在均不泄露未发布内容。
- 任一 operation 是否处理 429，以该 operation 在 OpenAPI 中声明的 response 为准。对已声明的 429 读取 `Retry-After` 并做有界退避。

## 仍需在 Phase 4 前完成的契约描述澄清

OpenAPI 已明确 member 编辑 published 后转 pending，但没有明确 member 更新 draft/pending 时的状态结果。客户端请求会遵守创建显式发送 status、更新不发送 status 的规则；Phase 4 开工前必须确认 draft/pending 更新保持原状态，并用独立测试数据验证。确认前不将 pending 保存视为契约既定行为，不进入投稿功能验收。

## 验证

已用 `git diff --check` 检查本轮文档变更。未运行应用测试；本轮工作限于 Flutter 规划文档和接口映射，没有改动 APP、后端或 OpenAPI。

## 更新范围

- `docs/flutter-app/02-页面地图与交互规格.md`
- `docs/flutter-app/01-技术方案与工程边界.md`
- `docs/flutter-app/03-接口映射与数据约束.md`
- `docs/flutter-app/04-开发计划与任务清单.md`
- `docs/flutter-app/05-验收标准与风险清单.md`
- `docs/flutter-app/README.md`
- `docs/flutter-app/review/M4-产品AI设计文档第四轮评审回应.md`
