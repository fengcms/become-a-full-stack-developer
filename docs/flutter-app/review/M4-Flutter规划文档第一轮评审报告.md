# M4 Flutter APP 规划文档 · 第一轮评审报告

> 评审角色：手机 App 开发专家（xtgxiso）／ 架构评审视角
> 日期：2026-10-02
> 评审对象：`docs/flutter-app/` 下 6 份规划文档（README + 01~05）
> 方法：不采信自陈——所有接口/字段/错误码/约束结论均对照冻结契约 `docs/api/openapi.v1.yaml`（v1.11.0）grep 取证；本环境无 Flutter 工程代码，故仅评「规划基线」质量，不评实现。
> 性质：编码前准备包评审（非代码评审），评分维度为「完整性 / 契约对齐 / 风险诚实度 / 阶段可出口 / 验收可测性」。

---

## 0. 总评

| 维度 | 评分 | 星 | 评价 |
|---|---|---|---|
| 工程边界与架构（01） | 48/50 | ⭐⭐⭐⭐⭐ | 分层清晰、安全边界到位；minor：安全存储包名、Riverpod 锁定、CORS 对原生无意义 |
| 页面与交互（02） | 47/50 | ⭐⭐⭐⭐⭐ | App Shell/路由/空错误态/可访问性成熟；minor：ownerOverride→控件可见性、深链 scheme |
| 接口映射（03） | 44/50 | ⭐⭐⭐⭐ | 端点族基本准确；缺旋转策略 P0 关联、错误码映射表、429/5001、ownerOverride 客户端处理、`/submit` 路径精度 |
| 开发计划（04） | 46/50 | ⭐⭐⭐⭐⭐ | 六阶段 + 出口条件 + P0/P1/P2 优先级优秀；minor：Flutter CI 门禁未具体化 |
| 验收与风险（05） | 45/50 | ⭐⭐⭐⭐⭐ | 验收矩阵 + 最低证据严格；「最高风险」措辞需重写为「契约已确认、Phase 0 验证部署」 |
| 契约一致性专项 | 48/50 | ⭐⭐⭐⭐⭐ | 逐端点 grep 取证，绝大多数真实存在；内容约束（65535/200/500）与契约逐字一致 |
| **综合** | **91/100** | **⭐⭐⭐⭐⭐** | 作为「编码前准备包」属高质量基线，可进入 Phase 0；无阻塞项，4 处 refinement 强化正确性 |

**结论：无阻塞项，可进入 Phase 0。** 这组文档是七端里我看过最扎实的规划基线之一——工程边界、公开可见性铁律、状态机、缓存与账号隔离、暗色覆盖、可访问性都写到了。本轮评审价值集中在三处：① 把文档自标的「最高风险」用契约证据**降级为已确认项**（减焦虑）；② 把契约的**强制旋转策略**与客户端「单飞刷新」建立 P0 级因果（防爆登出）；③ 补齐 3 处契约对齐缺口（错误码表 / 429 限流 / ownerOverride 客户端处理）。

---

## 1. 契约一致性专项（七端一致最高价值维度，grep 取证）

逐端点确认 03 §2 映射族在冻结契约中真实存在（grep `^  /api/v1/<path>:`）：

| 03 映射族 | 契约真实路径 | 状态 |
|---|---|---|
| 登录/注册/刷新/退出 | `/auth/login` `/auth/register` `/auth/refresh` `/auth/logout` | ✅ |
| 文章列表/详情 | `/articles` `GET /articles/{idOrSlug}` | ✅ |
| 分类/标签/搜索 | `/categories/tree` `/tags` `/search` | ✅ |
| 作者主页 | `/members/{id}` | ✅ |
| 点赞 | `/articles/{id}/like`（写）、`/articles/{id}/like/status`、`GET /me/likes`（列表） | ✅ 主写入端正确；列表/状态端 03 未列（补） |
| 收藏 | `GET/POST /me/favorites`、`DELETE /me/favorites/{articleId}` | ✅ |
| 阅读历史 | `POST /me/history`、`DELETE /me/history/{articleId}` | ✅ |
| 评论 | `POST /articles/{idOrSlug}/comments`、`DELETE /comments/{id}`、`PATCH /comments/{id}/status` | ✅ |
| 投稿 | `POST /me/articles`、`PATCH /me/articles/{id}`、**`POST /articles/{id}/submit`**（非 `/me/articles/{id}/submit`）、`DELETE /me/articles/{id}` | ⚠️ 03 写 `/submit` 简写，精确路径为 `/articles/{id}/submit` |
| 上传/文件 | `POST /upload`、`GET /files/{key}`（**根路径，不带 /api/v1**，与 M2 前端 `fileUrl` 一致） | ✅ 文档写法正确 |
| 通知 | `GET /me/notifications`、`PATCH /me/notifications/read-all`、`PATCH /me/notifications/{id}` | ✅ |
| 站点信息 | `GET /site/settings`（公开只读） | ✅ |

**内容约束逐字对齐契约**：投稿正文 `content maxLength: 65535`、标题 `200`、摘要 `500`（契约 line 281/288/289 与 519/520/521）——03 §4 数字完全准确。公开可见性铁律（只返 published、会员不能伪造 published、parentId 同文章）与契约一致。

---

## 2. 🔴→✅ 关键纠偏 1：移动端 refresh token「最高风险」契约已确认解决

文档 03 §3、05 §2 将「移动端 refresh token 不兼容（网站依赖 HttpOnly Cookie，原生无浏览器上下文）」列为**最高优先级风险**，要求 Phase 0 真实请求验证。

**契约证据（无需改后端即可确认）：**
- `AuthResult.refreshToken` 描述（line 492/501-503）：「refreshToken 用于**浏览器 HttpOnly Cookie 与移动端安全存储两种载体**」。
- `POST /auth/refresh`（line 857-864）：「浏览器端通过 HttpOnly Cookie 携带 refreshToken；**移动端将 refreshToken 置于请求体**。读取优先级：Cookie 优先，缺失取请求体，两者皆无 → 401 / code 1004」。

**结论**：后端刷新接口**从设计上即支持原生 body 载体**，这不是架构未知项。建议文档将此项由「最高优先级风险（未知）」重写为「**契约已确认支持原生 body 刷新；Phase 0 用原生请求验证部署后端与契约一致即可**」。Phase 0 验证仍需做（防部署态与契约漂移），但不再构成阻塞性未知。

附带澄清（供文档补充，呼应 M2 CORS 决策）：原生 Flutter 用 `dart:http`/`dio` 直连 API origin，**不存在浏览器同源/CORS 问题**——它发 `Authorization: Bearer <accessToken>`，刷新把 refreshToken 放请求体。M2 的「方案 B 代理绕 CORS」是 Web 开发期 workaround，对原生不适用。建议在 03 §3.4 明确：「原生客户端免 CORS，直接连 API origin + Bearer + body 刷新」。

---

## 3. 🔴 P0 强化：契约强制旋转策略 → 单飞刷新是硬性正确要求（非并发优化）

文档 01 §4 提到「并发 401 只允许一次刷新，其余请求等待同一个结果」——方向对，但**未关联其灾难性后果**，优先级偏低。

**契约证据（line 867-868 / 891 / 901）：**
- 「**旋转策略（强制）**：每次刷新成功即作废旧 refreshToken 并签发新值。」
- 「旧令牌再次使用视为重放攻击 → 401 / **code 1003**，并**连带作废该用户的整个令牌家族（须重新登录）**」。

**因果链（必须写进文档 P0）：** 若客户端因两个并发 401 触发**两次刷新**，第二次用的是已被第一次作废的旧 refreshToken → 命中 1003 → 整族令牌作废 → **强制重新登录**。这是会静默发生的登出灾难，且难以复现。

**要求文档在 01 §4 / 04 Phase 0 出口明确：**
1. 单飞刷新（single-flight）是 **P0 硬性正确要求**，不是可选项；
2. 每次刷新成功后**必须持久化新 refreshToken**（旧值已作废）；
3. 刷新失败（1003/1004/1005）必须清空全部令牌并跳登录，且**丢弃在途迟到响应**（防旧账号恢复，文档已提，保留）。

---

## 4. 🟡 P1 缺口

### P1-1 · ownerOverride 客户端处理未定义
契约在文章编辑/投稿（`x-authz.ownerOverride` line 1164/1256/1309）、评论删除（2265）、收藏（2598）、历史（2704）、通知（3724）多处使用 `ownerOverride`：资源本人可操作，即使 minRole 更高。
**客户端含义**：编辑/删除/送审等控件的**可见性**取决于「是否我的资源」（authorId == 当前用户 id，或评论作者）。M2 前端有 `canOperateOwned` 映射。建议在 02/03 增加「ownerOverride→控件可见性」一节：客户端据资源归属字段算 `isMine` 决定显隐，后端仍是最终裁决。

### P1-2 · 错误码→用户消息映射表缺失
03 §3 提到「token 轮换失败时旧 token 的处理方式」，但未枚举契约错误码。建议新增 `lib/core/errors/error_codes.dart`（对齐 M2 `errorCodes.ts`），映射契约数字分段：
- 1001 凭据错误 / 1002 token 无效过期 / **1003 刷新重放→清令牌跳登录** / 1004 未带令牌（匿名访问受保护）/ 1005 账号禁用
- 3002 唯一冲突(409) / 4001 参数校验（data 含字段级 errors）/ **5001 限流(429)** 
其中 1003/1004/1005/5001 须触发特定 UX（重登 / 跳登录 / 限流提示）。

### P1-3 · 429 / code 5001 限流未进错误分类
契约明确限流施加于**公开端点**（line 31/62/73，带 Retry-After，code 5001）。首页/列表/搜索均属公开且受限流。
文档 01 §4 错误分类列「服务器错误、离线、超时、401、403、404、业务校验失败」——**漏 429/5001**。建议补：「429/5001 限流：公开端点受网关限流，须带 Retry-After 退避，UI 提示『稍后重试』，不当普通错误。」

---

## 5. 🟡 P2 建议（不阻首期）

- **P2-1 安全存储包名**：01 §2「安全存储用于 refresh token」建议点名 `flutter_secure_storage`（而非笼统「安全存储」）。
- **P2-2 Riverpod 锁定**：01 §2 状态层写「Riverpod（或团队已确定的等价方案）」。Riverpod 是 Flutter 事实标准（类比 Web 端 Zustand+RQ），建议直接锁定 Riverpod，去掉「或等价」歧义。
- **P2-3 Flutter CI 门禁具体化**：04 Phase 1 出口提「建立 widget test 基础和 CI 门禁」，但未给具体 workflow。建议对齐 M2 纪律，新增 `.github/workflows/flutter-ci.yml`：`flutter analyze` + `flutter test`（等价 `biome check`+`vitest`），且**只读**不自动修。
- **P2-4 深链 scheme**：03 §2 通知「深链到具体资源」、02 有路由，但未定义 scheme（如 `app://article/{slug}`）与 go_router 重定向处理。建议补。
- **P2-5 x-authz 生成器盲区**：01 §2「OpenAPI 生成模型」——`x-authz` 是自定义扩展，代码生成器会忽略；ownerOverride 逻辑须手写（呼应 P1-1）。建议在 01 注明，避免生成后以为权限已自动化。
- **P2-6 `/submit` 路径精度**：03 §2 投稿族写 `/submit`，精确为 `POST /api/v1/articles/{id}/submit`；并补 `/articles/{id}/like/status`、`GET /me/likes` 两个点赞相关端，使映射完整。

---

## 6. 已确认的良好实践（保留，不改动）

- 公开可见性铁律、状态机（draft/pending/published、评论三态）、内容上限、parentId 同文章——与契约逐字一致。
- 缓存/账号隔离（点赞收藏以账号为 key、退出/切号清私有态）、不缓存私有响应——正确。
- 主题三态 + 双主题令牌覆盖（含代码块/表格/评论背景）——呼应 M2 令牌纪律。
- 分层（app/core/features/shared + presentation/application/data/domain）、请求模型≠UI 模型边界——与 M2 干净分层一致。
- 阶段顺序「先平台/接口→公开阅读→会话/会员→投稿/评论深度」+ 每阶段出口条件——可防止回头重做网络/会话。
- 验收最低证据（真机 + 弱网 + 过期会话 + 双主题截图 + 错误恢复）严格，超越「analyze+test+build 即完成」误区。

---

## 7. 修订建议汇总（供开发 AI 回填）

| 级别 | 项 | 落点 | 动作 |
|---|---|---|---|
| ✅ 纠偏 | 移动端 refresh 载体 | 03 §3 / 05 §2 | 由「最高风险（未知）」改为「契约已确认，Phase 0 验部署」；补「原生免 CORS，直连 + Bearer + body 刷新」 |
| 🔴 P0 | 旋转策略→单飞 | 01 §4 / 04 Phase0 出口 | 单飞刷新升 P0 硬性正确项；每次刷新增持久化新 refreshToken；1003/1004/1005 清令牌跳登录 |
| 🟡 P1 | ownerOverride 客户端 | 02/03 | 增「isMine→控件可见性」节，手写（生成器忽略 x-authz） |
| 🟡 P1 | 错误码映射表 | 01 §4 / 03 | 增 error_codes.dart 映射 1001-5001，1003/1004/1005/5001 特判 |
| 🟡 P1 | 429/5001 限流 | 01 §4 | 错误分类补限流退避 |
| 🟡 P2 | 安全存储包名 / Riverpod 锁定 / Flutter CI / 深链 / x-authz 盲区 / `/submit` 精度 | 01/03/04 | 见 §5 |

---

## 8. 修订记录

- 2026-10-02 第一轮评审（xtgxiso）：基于冻结契约 grep 取证，确认 6 份规划文档整体高质量、可进 Phase 0；核心纠偏 2 项（refresh 载体契约已确认、旋转策略升 P0）+ 缺口 3 项（ownerOverride/错误码表/429）+ 建议 6 项。

---

*免责声明：本报告评「规划基线」质量，非实现代码；所有契约结论以 `docs/api/openapi.v1.yaml` v1.11.0 为准。实际编码后须按 M2 同样纪律（不采信自陈、独立跑 `flutter analyze`+`flutter test`+ 真机证据）做实现复批。*
