# 成为全栈·Flutter App 篇·Refresh Token 旋转与并发 401：安全存储与会话代次

> 同一时刻多个请求收到 401，如果每个请求都各自刷新一次，旋转令牌系统可能把整个令牌族作废。正确实现还必须防止退出后的旧请求重新写回前一账号的数据。

{{IMG:M4-09-封面}}

## 本文目标

结合 Flutter 原生客户端的认证契约，拆解 access/refresh token 存储、并发 401 单飞刷新、refresh token 轮换持久化和会话代次校验。

## 前置知识

了解 JWT/Bearer、Dio interceptor 和 Future。项目认证位于 `core/network/api_client.dart` 与 `app/session.dart`，测试覆盖刷新与迟到响应。

## Flutter 原生客户端不依赖浏览器 Cookie

APP 直接请求 API origin：access token 放 `Authorization: Bearer`，刷新请求将 refreshToken 放请求体。access token 只存在内存，refresh token 通过安全存储保存；密码不能写进普通偏好或日志。

```text
access token：内存，短生命周期
refresh token：OS 安全存储，服务端轮换
密码：不保存
```

不能把 Web 前台 HttpOnly Cookie 方案照搬到原生 App；两端共享后端契约中的身份语义，但传输凭据方式不同。

{{IMG:M4-09-认证时序}}

## 并发 401 必须共享一个刷新 Future

假设首页、通知和收藏同时返回 401。如果三条请求同时用旧 refresh token 刷新，后端会旋转令牌：第一条成功换出新 token，后续仍使用旧 token 的请求可能触发重放检测并撤销 token family。

因此 ApiClient 维护共享 refresh task：第一个 401 建立刷新 Future，其它请求等待同一 Future；成功后再按允许策略重试原请求，失败后清会话并要求重新登录。锁必须在成功和异常路径都释放，避免下一次刷新永久等待。

```text
401 A ─┐
401 B ─┼→ 同一个 refresh Future → 写入新 refresh token → 等待请求继续
401 C ─┘
```

这是一项正确性约束，不只是减少网络请求。

## 轮换凭据写入需要串行和完成确认

刷新成功后，服务端发出的新 refresh token 必须安全持久化，再允许依赖新会话的请求继续。并发写存储可能让旧值覆盖新值；退出可能与尚未完成的刷新交错。因此登录、刷新和清理要纳入 Session 的串行控制，并以会话代次检测过期操作。

## Epoch 阻止迟到响应跨账号污染

流程示例：账号 A 请求资料，用户退出并登录账号 B，A 的 HTTP 响应随后才抵达。仅清内存列表不够，A 的结果仍可能写入 Provider 或 Repository。

```text
请求开始时记录 epoch=7
退出/切换账号 → epoch=8
响应返回发现 7 != 当前 8 → 丢弃
```

公开内容并非私有身份，不必随退出删除；私有缓存 key 包含 API 环境、账号 ID 和会话代次，并且只在内存中短时复用。这样账号切换既清理必要数据，也不毁掉公开阅读体验。

## 失败边界要可见

refresh token 缺失、过期、重放或被撤销时，清除安全存储和私有会话状态，回登录页。不要把“请求重试失败”悄悄展示成旧账号仍在线。日志记录错误类别即可，不能记录 token、密码或完整认证响应。

测试至少涵盖多个 401 只触发一次 refresh、刷新失败、旧 token 重放、退出时有在途请求和切换账号后的迟到响应。本机验收覆盖上述竞态；它仍不能替代平台安全存储实现与真实设备安全审计。

## 原请求重放也需要限制

刷新成功后并非所有请求都能安全重放。一般读取可用新 access token 重试一次；写请求只有在服务端契约保证幂等，或客户端已有可复用资源标识时，才能按照明确策略恢复。拦截器必须记录该原请求已刷新过，防止新请求仍返回 401 后形成 refresh 循环。

刷新失败清理凭据时，存储删除若异步执行，应先让内存会话失效并递增 epoch，再等待持久化清理；这样 UI 和迟到响应立即进入匿名边界。日志只保留错误类别和安全 request id。

## 这段实现有三道竞态栅栏

ApiClient 在刷新开始记录 `epoch`；清会话会先递增 epoch 再清 access/user；安全存储写入经 `_storageQueue` 串行化。请求发送前保存原 access token，收到 401 仅当 token 未被其他请求更新时才进入刷新；之后检查 epoch，再以新 token 重试一次。

```text
captured epoch ─────┐
refresh / install ──┼→ epoch unchanged? → continue
logout increments ─┘              no → SessionChanged
```

这避免退出后刷新 Future 又把旧凭据安装回来。重试的原请求仍受 refreshAllowed=false 限制，不会形成无限 401 循环。测试使用可控 Completer 暂停刷新，让 8 条请求并发到达，断言 refresh 调用数为 1，并测试退出时迟到响应被丢弃。

## 小结

令牌轮换要求刷新单飞和新值持久化有序；会话 epoch 则让退出、账号切换成为明确的响应隔离边界。access token 不落盘，refresh token 放安全存储，私有数据按身份隔离。认证正确性需要竞态测试，不能只看登录成功截图。

## 延伸阅读

- [Riverpod 状态边界]({{LINK:M4-06}})
- [移动端错误与限流：429、重试和写请求边界]({{LINK:M4-08}})
- [C 端认证：内存令牌、HttpOnly Cookie 与会话代次]({{LINK:M3-11}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Flutter`、`JWT`、`Token刷新`、`身份认证`、`移动安全`、`全栈开发`

### 文章简介（250 字以内）

移动端认证不能止于“登录成功”。Refresh Token 轮换要求并发 401 共享一次刷新、串行保存新凭据，并防止退出或切换账号后的迟到响应污染新会话。本文结合 Flutter ApiClient、Session 与测试说明 token 存储、安全边界和会话代次设计。

### 建议发布分类

全栈开发 / Flutter

### 封面短标题

并发 401 只刷新一次

### 配图 AI 提示词

1. `M4-09-封面`：16:9 中文安全架构封面，多条 API 401 请求汇聚到一个 refresh token 轮换任务，access 内存、refresh 安全存储，账号 epoch 阻挡旧响应，深蓝紫色与青色。
2. `M4-09-认证时序`：16:9 时序图，三请求共用单飞刷新、写入旋转凭据、用户退出递增 epoch、迟到响应被丢弃，中文标签清楚。

### 发布前核对

- [ ] 替换 2 处配图占位符
- [ ] M4-06、M4-08、M3-11 发布后回填站内链接
- [ ] 与 Session 实际 refresh 并发实现和错误码核对
- [ ] 已删除本辅助区
