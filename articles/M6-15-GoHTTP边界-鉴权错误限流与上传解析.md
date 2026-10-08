# 成为全栈·Go 后端篇·HTTP 边界怎么守：鉴权、业务错误、限流与上传解析

> HTTP handler 是不可信输入进入业务系统的门槛。先把身份、请求体和失败形状收住，再交给领域服务处理，才能让 68 个操作遵循同一套协议。

{{IMG:M6-15-封面}}

> 本文代码快照：提交 ceac4e0。部分代码为结构示意，发布前按实际路由和契约复核。

## 前言：请求链的顺序是可观察行为

同一个 endpoint，如果认证失败时返回 401 或 403，如果 JSON 格式错误时返回裸文本或统一信封，如果大请求先被完整读入内存才被拒绝，客户端与服务运维看到的都不是同一个系统。HTTP 边界的顺序不是纯粹代码风格，而是 API 行为和资源保护策略。

M6 使用标准库 ServeMux 注册路径，但路由命中只是开始。httpapi.Register 按 operationId 从冻结契约取出方法、路径、角色、owner 元数据和请求 schema，再执行公共处理链。领域 handler 获得已解析身份与校验后的字段，返回领域结果或错误，由统一层映射成信封。

本文从一条普通 JSON 请求讲起，再看可选登录、所有者权限、公开限流、业务错误和文件上传。重点是让边界代码明确且集中；具体文章状态、附件补偿和账号规则仍属于领域服务。

## 一、Register 把契约操作连接到公共处理链

业务包通过 Bind 方法把 handler 注册到 HTTP 应用。Register 首先查找契约 Catalog 中的 operation；未知 operation 直接暴露为装配错误。之后根据契约 method/path 建路由，记录 operation 已绑定，并为每个请求执行公共处理流程。

简化流程如下：

~~~text
HTTP method/path 匹配
   ↓
读取 Authorization 并尝试解析 JWT
   ↓
按 operation 决定必需身份、角色或可选身份
   ↓
公开 operation 执行按端点/访问者限流
   ↓
有界读取 JSON 并校验对应 schema
   ↓
调用业务 handler（Request 含 Actor、Fields、HTTP Context）
   ↓
成功时写统一信封；失败时归一为契约错误
~~~

这条链上每一步失败都会产生不同的可观察结果。把它们列出来，边界是否完整就一目了然：

| 阶段 | 失败时的结果 | 由谁决定 |
|---|---|---|
| 路由匹配 | 404，业务码 NotFound | ServeMux 与兜底 handler |
| 令牌解析 | 401，业务码 Missing 或 Token | Identity.Parse |
| 角色判定 | 403，业务码 Forbidden | 契约 x-authz 元数据 |
| 公开限流 | 429，带 Retry-After，业务码 5001 | 进程内 Limiter |
| 请求体读取 | 400，字段错误 | MaxBytesReader 与 decode |
| schema 校验 | 400，契约 errors 数组 | 冻结契约 schema |
| 业务处理 | 按领域错误映射 | 领域服务 |
| panic 恢复 | 500，业务码 Internal | defer 中的 recover |

操作元数据的来源是冻结契约，权限判断要读 x-authz，而不是从路径字符串猜。路径里出现 /admin，授权规则仍由契约决定；/me 路径也不能不经校验就信任客户端提供的 userId。bootstrap 在启动时还会对照契约 operation 检查注册覆盖，避免漏掉某个 operation 直到线上首个请求才暴露。

## 二、必需认证、可选认证和 owner override

传输层读取 Authorization Bearer token，并交给 Identity.Parse。必需认证操作在没有 token、token 无效、角色不满足时分别走契约定义的错误码和 HTTP 状态。可选认证操作则保持公开访问；按照冻结 Node 行为，非法凭据会退化为匿名身份，而不让一个游客因携带过期 token 就无法访问公开内容。

owner override 不能仅凭 URL 中的数字确认。契约记录资源参数以及 owner 字段语义；领域 handler 或对应查询需要检查目标资源归属。角色等级和本人所有权是两种不同授权条件：editor/admin 可以按全局职责访问，member 只能在特定资源满足归属规则时访问。

业务服务也应检查重要不变量，尤其当 service 会被多个入口调用时。传输层负责依据 operation 作通用身份边界，领域层负责资源真实归属和状态转移。两层互补，不能为了少写一次判断而把授权全部放到前端。

## 三、公开限流与客户端身份

契约规定公开端点每个 operation 独立每分钟 60 次，超过返回 429、Retry-After 和业务码 5001；鉴权端点不套用这项公开限流。M6 在 httpapi 中用进程内 Limiter 按 operation 加访问者 key 记录固定窗口，并限制 key map 的规模；匿名 key 取客户端 IP，已登录访问者可用 user ID。

~~~go
// internal/transport/httpapi/limiter.go（节选）
// Allow 判断当前窗口是否允许请求，拒绝时返回剩余等待秒数。
func (l *Limiter) Allow(key string, now time.Time) (int, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.windows) >= 10000 {
		for k, v := range l.windows {
			if now.Sub(v.Start) >= time.Minute {
				delete(l.windows, k)
			}
		}
		if len(l.windows) >= 10000 {
			if _, ok := l.windows[key]; !ok {
				return 60, false
			}
		}
	}
	w := l.windows[key]
	if now.Sub(w.Start) >= time.Minute {
		w = window{Start: now}
	}
	if w.Count >= 60 {
		return int(time.Minute.Seconds()-now.Sub(w.Start).Seconds()) + 1, false
	}
	w.Count++
	l.windows[key] = w
	return 0, true
}
func (a *App) clientKey(r *http.Request, actor values.Actor) string {
	if actor.ID > 0 {
		return "u:" + strconv.FormatInt(actor.ID, 10)
	}
	return a.clientIP(r)
}
~~~

这段代码里有三处保护。`l.mu` 让并发请求串行更新窗口；`len(l.windows) >= 10000` 的清理分支防止 key 无限增长，清理后仍然超限时直接拒绝新 key；返回值是 `60 - 已过秒数 + 1`，让 `Retry-After` 有具体数值。`clientKey` 则说明限流键的选择：已登录用 `u:ID`，匿名才回落到 IP，这样同一出口 IP 后的多个会员不会因为一个匿名刷子而互相牵连。

当服务部署在代理之后，远端 TCP 地址通常是代理地址。若配置了可信代理，工程会从 X-Forwarded-For 链右侧向左解析，跳过可信跳点，取第一个不可信 IP；如果远端地址本身不在可信列表里，就忽略该头，客户端也就难以伪造左侧地址绕过限流。

这套限流有重要边界：它属于单进程内存状态，服务重启后窗口清空，多实例之间不共享计数。因此它适合本地实现和单实例保护；Cloudflare 或共享 Redis 网关的全局限流属于另一层责任。契约写明责任在网关层时，实际部署仍要验证外层限流配置。只凭 Go 里有一个 Limiter，就把集群全局达标算作已完成，并不成立。

## 四、请求体要先设上限，再解析 JSON

普通 JSON body 通过 http.MaxBytesReader 限制为 2 MiB，再由 Decoder 解析到 Fields。请求体要求是一个 JSON 对象，额外拼接第二个 JSON 文档会被拒绝。可选 body 仅在契约允许时接受空 body；请求过大、格式错误或多余数据统一转成字段错误。

~~~go
// internal/transport/httpapi/app.go（节选）
func decode(w http.ResponseWriter, r *http.Request, out *values.Fields, optional bool) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2*1024*1024))
	if err := d.Decode(out); err != nil {
		if optional && err == io.EOF {
			return nil
		}
		return fault.Field("_", "请求体须为JSON对象")
	}
	if *out == nil {
		return fault.Field("_", "请求体须为JSON对象")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return fault.Field("_", "请求体包含多余数据")
	}
	return nil
}
~~~

第二个 `Decode` 是这段代码最容易忽略的一处：它把结果读进一个被丢弃的 `extra`，只为确认读完之后恰好碰到 `io.EOF`。如果调用者发来两个拼接的 JSON 对象，第一次解码会成功，第二次却还能读到内容，于是被判定为“多余数据”。整数路径参数用同一套思路处理：

~~~go
// internal/transport/httpapi/params.go
func pathID(r Request, key string) (int64, error) {
	id, err := strconv.ParseInt(r.HTTP.PathValue(key), 10, 64)
	if err != nil || id < 1 {
		return 0, fault.New(fault.NotFound)
	}
	return id, nil
}
~~~

非法或不存在的 ID 统一返回资源不存在，而不是暴露解析细节。这几个步骤挡住了几类常见边界问题：无界读取使内存占用受客户端控制；Decoder 只读第一个 JSON 而忽略尾随数据，会让调用者以为第二段也参与处理；直接 unmarshal 到业务 model 会混合字段存在性与持久化边界。

上传 multipart 有自己的限制路径。当前 transport 将请求体上限设为略高于文件大小上限，以容纳 multipart 边界和字段开销；要求恰好一个 file 字段，检查 MIME 白名单、文件大小和 articleId 格式，再将字节与元数据交给附件 service。文件大小先由 multipart header 检查，再通过有界读取复核，避免只信客户端声明的 Content-Length。

上传内容的真实类型识别、对象 key、摘要去重、元数据原子性和存储失败补偿由 attachment 领域能力负责。transport 只管 HTTP body 形状和传输上限；附件生命周期属于领域，塞进 handler 只会让协议代码承担它无法可靠保证的责任。

## 五、统一错误信封不是把错误都变成 500

领域服务可能返回 not found、forbidden、validation、conflict 或内部错误。fault.Resolve 将已知错误转换为稳定业务码，再由 fault.Status 选择 HTTP 状态，写入包含 code、message、data、requestId、timestamp 的统一 JSON 信封。

对于内部错误，客户端得到通用错误信息，日志记录错误类型而非完整敏感数据。请求 panic 会被恢复并转换为内部错误，操作耗时记录在请求日志。需要注意，恢复 panic 是最后防线，不代表可以忽略错误处理或继续使用部分写入状态；数据库事务仍负责失败回滚。

字段校验错误应保留字段路径，契约验证会展开 Required、类型和格式错误。业务规则错误则使用明确领域错误。二者都是客户端可理解的失败，但成因不同：一个是输入结构违反 schema，一个是输入类型合法、业务状态不允许。

## 六、CORS 与安全响应头仍需环境配置

HTTP App 对允许的 Origin 做匹配后返回 Access-Control-Allow-Origin、Allow-Credentials 与 Vary。OPTIONS 预检响应允许指定的方法和 Authorization、Content-Type 请求头。生产配置不能把任意 Origin 与凭据访问组合当作安全默认；应明确 origin 列表与代理拓扑。

内容响应设置 nosniff；刷新 Cookie 由公共 helper 写固定 Path、Secure、HttpOnly、SameSite 属性。浏览器跨站 Cookie 的行为仍受域名、HTTPS 和客户端策略影响，必须在真实环境验证。CORS 不是身份认证，也不是 CSRF 的完整替代品；它主要决定浏览器脚本能否读取跨域响应。

## 七、哪些逻辑该留给领域层

Handler 收到的是传输请求。它可以读取 PathValue、提取已校验输入、调用领域服务并返回结果。文章是否可以从 pending 变 published、附件最后引用删除时对象何时清理、阅读量冷却是否到期，这些需要领域规则、事务或存储协作，应该归对应 service。

一个实用界限是：把具体业务对象替换成另一种资源，HTTP 公共流程还成立吗？若答案是成立，通常属于公共边界；若逻辑依赖文章状态、评论父子关系或附件引用数，通常属于领域。公共处理链越集中，越要通过 operation metadata 保持端点差异可见，而不是用一个全局默认覆盖契约例外。

## 八、验证顺序与故障场景

传输层测试应覆盖路由注册、无 token / 无效 token / 权限不足、公开端点匿名访问、请求体上限、错误 schema、尾随 JSON、限流边界、CORS 预检、统一信封和 panic 恢复。上传测试还需覆盖多个文件、MIME 错误、10 MiB 边界、重复 articleId 和读取失败。

领域和数据库测试接着验证 owner 查询、事务回滚、文件补偿与幂等。网关层则在实际部署中验证共享限流、可信代理和 TLS。每一层的通过只证明它负责的行为，不能互相替代。

如果只记一句话：边界测试的价值，在于把“系统拒绝了我”拆解成“在哪一层、以什么形状、依据哪条契约拒绝”。同样返回 400，请求体超限、schema 不匹配和尾随 JSON 是三种不同的原因，客户端需要的修正动作也不同。

## 小结：公共边界集中，业务不变量仍有归属

M6 的 Register 以 OpenAPI operation 为入口，统一执行身份、角色、限流、body 限制、JSON schema 校验和信封错误；业务 handler 接收 Actor 与 Fields，然后委托领域包。文件传输额外执行 multipart 限制，CORS 与 Cookie 属性由传输层统一管理。

检查自己的 API 时，按一次请求从入口走到数据库，再反向走一次失败路径。你应该能指出每一步在哪发生、依据哪条契约、失败后留下什么状态。这样的边界才便于跨语言复刻和持续验证。

## 延伸阅读

- [冻结 OpenAPI 3.1 怎么接入 Go：生成器之外的选择]({{LINK:M6-13}})
- [跨语言认证兼容：Node 与 Go 如何互认 JWT 和密码]({{LINK:M6-05}})
- [文件与数据库没有共同事务：共享附件怎样补偿]({{LINK:M6-27}})
- [Go Web 框架怎么选：本项目为什么使用标准库]({{LINK:M6-02}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、HTTP、JWT、API安全、文件上传

### 文章简介（250 字以内）

M6 的 68 个 API 操作如何共享一条可审阅的 HTTP 边界？本文跟踪 Register 的路由、身份、角色与归属、公开限流、body 限制、JSON Schema 校验和统一错误信封，并解释 multipart 上传为何由 transport 做大小与形状检查、附件 service 负责生命周期。文章同时说明进程内限流、可信代理、CORS 和真实部署验证的范围。

### 建议发布分类

后端 / Go

### 封面短标题

守住 HTTP 请求边界

### 配图 AI 提示词

1. M6-15-封面：技术流程图风格，浅蓝白底，表现 HTTP 请求经过认证授权、公开限流、body 限制、schema 校验、领域 service 和统一错误信封；强调权限取自 operation 元数据。
2. M6-15-上传：multipart 请求先经大小/MIME/单文件检查，再交附件领域服务；区分 transport 边界和对象存储生命周期。

### 发布前核对

- [ ] 确认公开限流的契约层责任与本地进程限制表述。
- [ ] 按部署配置复核 trusted proxy、CORS、Cookie 属性。
- [ ] 用实际 source 复核 body 限制和上传上限。
- [ ] 替换图片与站内链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
