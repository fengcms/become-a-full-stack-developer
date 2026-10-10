# 成为全栈·Go 后端篇·跨语言认证兼容：Node 与 Go 如何互认 JWT 和密码

> “同样是 HS256”和“同样使用 bcrypt”不等于两个后端天然兼容。身份声明、过期边界、Cookie 优先级和密码字节处理都可能让旧客户端突然无法登录。

{{IMG:M6-05-封面}}

> Node 基线：node-backend 当前源码；Go 快照：提交 ceac4e0。协议以冻结契约和固定测试向量为准。

## 前言：认证兼容是字节级的行为约定

M6 并没有换掉用户的登录协议。Node 使用 Hono JWT 与 bcryptjs，Go 使用 golang-jwt 和 x/crypto/bcrypt。二者需要互相接受对方签发的 token，并识别历史密码哈希。接口响应里的 accessToken、refreshToken、user 字段，以及 Cookie 行为也必须让既有网站、管理后台、Flutter 和小程序继续工作。

“库都支持标准算法”只是起点。JWT 是否指定 HS256、sub 是 JSON number 还是 string、exp 刚好等于当前秒时算不算过期，都会改变结果。bcrypt 则按字节处理输入，中文和 emoji 在 UTF-8 下占用多个字节；超过 72 字节时不同实现可能拒绝或截断。

本文不泛讲登录原理，而是列出本项目必须保持的互通细节、测试向量与边界。

## 一、JWT 的算法、声明与过期边界

Node token 声明包含字符串 sub、role 和 exp。用户 ID 被编码为字符串，是契约形状的一部分；Go Parse 必须从 string 读取并转成内部 int64，不能先假定 token 里是数字。role 也要映射到有限集合 member、editor、admin，未知角色拒绝。

这两条约束在 `internal/auth/service.go` 的 `Parse` 里各有一处显式检查。算法白名单、过期要求、时钟注入、字符串 sub、角色等级，全部写在同一个函数里：

~~~go
// internal/auth/service.go（节选）：限定 HS256、要求 exp，并从字符串 sub 取 ID。
func (s *Service) Parse(raw string) (values.Actor, error) {
	token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		return []byte(s.Secret), nil
	}, jwt.WithValidMethods([]string{
		"HS256",
	}), jwt.WithExpirationRequired(), jwt.WithTimeFunc(s.Now))
	if err != nil || !token.Valid {
		return values.Actor{}, fault.New(fault.Token)
	}
	c, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return values.Actor{}, fault.New(fault.Token)
	}
	sub, ok := c["sub"].(string)
	if !ok {
		return values.Actor{}, fault.New(fault.Token)
	}
	id, err := strconv.ParseInt(sub, 10, 64)
	role, _ := c["role"].(string)
	a := values.Actor{ID: id, Role: role}
	if err != nil || id < 1 || a.Rank() == 0 {
		return values.Actor{}, fault.New(fault.Token)
	}
	return a, nil
}
~~~

读这段代码要抓四个点。第一，`jwt.WithValidMethods` 给出的是**允许列表**，不是提示：token header 里声明的算法不参与决定，签名校验只会用 HS256。第二，`jwt.WithExpirationRequired` 让缺少 exp 的 token 直接失败，避免“无过期等于永久有效”。第三，`jwt.WithTimeFunc(s.Now)` 把时钟作为依赖注入，测试才能构造“刚好过期”的样本。第四，`sub` 被断言为 `string` 后才解析成整数，与 Node 把用户 ID 编码成字符串的契约形状严格对齐。

两端都签名 HS256。Go 使用固定允许算法列表并要求 exp 存在，通过注入的时钟检查有效期。不能根据 token header 让解析器接受任意算法；也不应只检查签名后就把未验证的 role 当授权依据——最后的 `a.Rank() == 0` 正是把未知角色挡在授权之外的兜底。

一个常被忽略的差异是时间边界。JWT exp 表示不再有效的时间点；当时钟刚好达到 exp，token 应视为过期。Go 测试用固定 Now 对照 Node 生成的 fixture，验证签名、claims、字符串 sub 和 expiration boundary。测试数据比“双方都用 HS256”更有说服力，因为它覆盖了确切字节和库行为。

secret 需要相同且安全注入。测试 fixture 可以使用固定非生产密钥；真实密钥不能写到源码、日志、文章或 Git。密钥轮换影响所有 Access Token 的验证，因此应作为独立的部署协议考虑，不能在重写时临时换掉。

## 二、bcrypt 的 72 字节边界

Node 使用 bcryptjs，成本参数 12；Go 使用 x/crypto/bcrypt，成本同为 12。bcrypt 算法只处理输入的前 72 字节。Go 包装层显式把 UTF-8 字节切到 72 字节再生成或验证哈希，以兼容 Node 的既有行为：

~~~go
// internal/auth/service.go：bcrypt cost 12，先按 UTF-8 字节截断到 72。
func Hash(s string) (string, error) {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	v, err := bcrypt.GenerateFromPassword(b, 12)
	return string(v), err
}

// Verify 按相同的 72 字节规则验证密码，不把密码内容写入日志。
func Verify(s, hash string) bool {
	b := []byte(s)
	if len(b) > 72 {
		b = b[:72]
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), b) == nil
}
~~~

注意 `[]byte(s)` 这一步：它把字符串按 UTF-8 编码成字节切片，`len(b)` 数的是字节而不是字符。`b[:72]` 是**字节截断**，所以一个 30 字的纯中文密码（约 90 字节）会被切到 72 字节处，而不是保留全部 30 个汉字。这与 Node bcryptjs 的行为一致，也正是能互相验证哈希的原因。

这里说的是字节，不是 72 个字符。ASCII 字符通常一字符一个字节，汉字在 UTF-8 中常占三个字节，emoji 可能占四个。把 Go 字符串按 rune 数量截断，会与 Node bcrypt 的输入截断不同。更糟的是按 byte 直接截断可能切开一个多字节字符；而 bcrypt 接收的是原始 bytes，兼容性向量必须精确复现这一点。

测试样例包括普通 ASCII 密码、超过 72 字节的 ASCII、中文和 emoji 组合。Go 读取 Node 生成的哈希做 compare；反向也应使用同样的固定输入验证跨实现结果。新系统若设计密码方案可以考虑其他限制，但已有哈希与契约决定了本次重写必须兼容。

切勿为了让长密码输入“更安全”而在重写时改变其哈希语义。那属于账号协议变更，需要独立迁移与用户通知。本文快照只证明测试向量覆盖，不宣称密码强度策略已经重新评估。

准备多字节测试样本时，最实用的做法是先把候选项的字节长度算出来再放进用例：一个纯 ASCII 的 60 字符密码是 60 字节，一个 20 字的纯中文密码约 60 字节，20 个 emoji 可能就超过 72 字节。先知道输入落在边界的哪一侧，测试结论才有意义。

## 三、刷新令牌和访问令牌职责不同

Access Token 是一小时有效的 HS256 JWT；Refresh Token 是随机生成的高熵值，使用 SHA-256 摘要存入 refresh_tokens 表，过期时间为七天。数据库不保存刷新令牌明文。刷新成功会撤销旧令牌并发放新的一枚，属于旋转协议。

`Result` 把这两种凭据一次发完，也能看出它们的存储方式完全不同——随机值只以摘要入库，访问令牌则用字符串 sub 签发：

~~~go
// internal/auth/service.go（节选）：刷新令牌只存 SHA-256 摘要。
refresh := hex.EncodeToString(raw)
digest := sha256.Sum256([]byte(refresh))
row := model.RefreshToken{
	TokenHash: hex.EncodeToString(digest[:]),
	UserID:    u.ID,
	CreatedAt: now.UnixMilli(),
	ExpiresAt: now.Add(7 * 24 * time.Hour).UnixMilli(),
}

token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
	"sub":  strconv.FormatInt(u.ID, 10),
	"role": u.Role,
	"exp":  now.Unix() + 3600,
}).SignedString([]byte(s.Secret))
~~~

签发侧和验证侧是对称的：`jwt.NewWithClaims` 里 `sub` 用 `strconv.FormatInt` 写成字符串，解析侧才用 `strconv.ParseInt` 读回来；`exp` 写的是 `now.Unix() + 3600`，正好一小时。这种对称如果只在一边改动，就会出现“能签发但不能验证”或反之的隐蔽故障。

两种凭据因此具有不同风险和生命周期。Access Token 可在有效期内离线验证，登出或重置密码通常无法立刻让已签发 JWT 失效；Refresh Token 有数据库状态，可以逐个或按用户撤销。不要把“刷新令牌已撤销”误写成“所有访问 JWT 即刻无效”。

刷新 endpoint 同时支持 Cookie 与请求体 token。Node 路由约定 Cookie 优先，缺少 Cookie 时再读 body；Go httpapi.auth 也遵循相同优先级。网站 BFF 通常依赖 HttpOnly Cookie，Flutter 等客户端可能使用 body token。若优先级不一致，浏览器携带旧 Cookie 时会忽略客户端刚提交的新 body token，产生很难理解的错误。

## 四、Cookie 属性也是协议的一部分

刷新 Cookie 名称为 refreshToken，路径为 /，设置 Secure、HttpOnly 和 SameSite=None，存活七天；清除时发送过期属性。每个属性对应不同边界：HttpOnly 阻止浏览器脚本直接读取，Secure 要求 HTTPS，SameSite=None 允许跨站传递但浏览器通常要求同时 Secure。

属性值可以列成一张表，看每一项在拦什么：

| 属性 | 取值 | 对应边界 |
|---|---|---|
| Name | refreshToken | 与读取端保持一致 |
| Path | `/` | 决定哪些请求会携带它 |
| HttpOnly | 是 | 浏览器脚本无法直接读取 |
| Secure | 是 | 只在 HTTPS 下发送 |
| SameSite | None | 允许跨站，但通常要求同时 Secure |
| Max-Age | 7 天 | 与刷新令牌过期时间对齐 |
| 清除 | 发送过期属性 | 用过期覆盖而不是删除 |

本地 HTTP 调试可能与生产域名的行为不同。代理、BFF、跨域请求和浏览器策略会决定 Cookie 是否带上；后端只正确写 Set-Cookie 并不代表客户端已经正确携带。验收应检查请求头和浏览器存储，而不是只看 JSON 中存在 refreshToken 字段。

读 Cookie 优先级时还要注意“同时存在”的用例：浏览器可能因为域或路径匹配而带上一个旧 Cookie，而客户端又在 body 里提交了新 token。此时以 Cookie 为准会用到旧的、以 body 为准会用到新的，两种结果指向不同的会话。正因为很难从现象上区分，才需要用固定用例明确约定谁优先。

Cookie 的安全属性、access token 存储策略和客户端请求配置要整体看。网站与移动端的凭据载体不同，但使用的 API 语义相同。

## 五、互通验证应该使用固定向量

跨语言认证适合准备两组 fixture：

| 向量 | 检查内容 |
|---|---|
| Node JWT → Go 验证 | HS256、字符串 sub、role、exp、固定过期边界 |
| Go JWT → Node 验证 | JSON claims 和签名可被旧实现接受 |
| Node bcrypt hash → Go compare | 旧账号哈希兼容 |
| Go bcrypt hash → Node compare | 新密码可在两个后端验证 |
| 普通 ASCII 与长密码 | 字节截断边界 |
| 中文与 emoji | UTF-8 多字节行为 |
| 缺失或未知 role | 不接受不完整或越权 claims |
| Cookie 与 body 同时存在 | Cookie 优先级一致 |

fixture 使用受控时间和测试 secret，不包含真实用户数据。登录端到端测试再检查账号状态、凭据标记、刷新记录和响应用户投影。单测证明算法兼容，不代表用户表迁移、数据库唯一约束和会话撤销都正确。

准备向量的顺序可以固定下来：先写 Node 生成的样本，再用 Go 读；反向再写 Go 生成的样本，用 Node 读。两个方向都要覆盖普通字符串、超长输入和多字节字符，才算真正验证了“互认”而不是“各自能跑”。如果某个方向暂时没有覆盖，应在报告里写明，而不是用另一端的结果代替。

## 六、故障语义要留在契约中

未知用户名与错误密码应避免泄露账号是否存在，映射为相同认证失败语义；账号 disabled 则按契约返回明确状态。token 无效、缺失刷新令牌、令牌已撤销或重放则按不同的既有错误码处理。跨语言实现不能为了“代码统一”把这些错误全改为 401 + 同一 code。

这条规则在 Go 代码里也有对应：`Parse` 对签名失败、缺少 exp、非字符串 sub、越界 ID 都返回同一个 `fault.Token`，而 `Login` 对未找到用户与密码不符返回同一个 `fault.Credentials`，对 disabled 账号则返回 `fault.Disabled`。也就是说，“不泄露账号是否存在”是通过**把多种失败收敛成同一个错误**实现的，而不是靠文案遮掩。

日志里不要输出 Authorization、Cookie、密码、refresh token 明文或微信 secret。排错可以记录 operation、错误类型、请求 ID 和非敏感状态，但 token hash 也通常没有必要写进普通日志。安全审计应按敏感数据边界设计，而不是等泄露后再增加过滤器。

值得一提的是，把多种失败收敛成同一个对外错误，并不妨碍在内部区分原因。服务端日志与审计仍可以记录更细的分类，只要对外响应保持一致；要避免的是把内部原因直接暴露给客户端，或者反过来，为了让外部文案“更具体”而顺带说出账号是否存在。跨语言重写时，两端错误码的对应关系最好和维护契约的人一起过一遍，因为有些差异看起来只是文案，实际影响了客户端的分支逻辑：客户端可能正是因为某个 code 才决定提示“请检查密码”还是“请重新登录”。

## 小结：算法相同还不够，输入字节和行为都要相同

Node 与 Go 都使用 HS256 和 bcrypt cost 12，但兼容还要求相同的 claim 类型、过期边界、UTF-8 72 字节处理、refresh rotation 和 Cookie 优先级。M6 通过 Node fixture、受控时钟、反向验证和客户端行为测试，把这些细节从“应该一样”变成可复核证据。

做跨语言身份重写时，不要先替换 JWT 库再看能否登录。先列出 token claims、密钥、时间、密码输入字节和会话载体，再写向量，最后在隔离数据上验证全流程。

## 延伸阅读

- [重写之前先锁基线：契约、Node 版本与行为清单]({{LINK:M6-11}})
- [刷新令牌旋转：为什么返回错误反而要提交事务]({{LINK:M6-18}})
- [微信身份在 Go 中复刻：建号、首次设密与并发冲突]({{LINK:M6-19}})
- [注册登录全流程实现](https://blog.csdn.net/fungleo/article/details/164396193)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、JWT、bcrypt、身份认证、跨语言兼容

### 文章简介（250 字以内）

Node 与 Go 都使用 HS256、bcrypt，为什么还要专门做认证兼容？本文结合 M6 的固定 Node JWT/bcrypt 向量，解释字符串 sub、角色白名单、exp 边界、bcrypt 的 UTF-8 72 字节截断、刷新令牌旋转，以及 Cookie 优先于 body 的读取规则。文章区分算法一致与行为兼容，并给出双向 fixture 和端到端会话验证清单。

### 建议发布分类

后端 / Go

### 封面短标题

认证要按字节兼容

### 配图 AI 提示词

1. M6-05-封面：浅蓝白技术图，Node 与 Go 两列共享同一个 JWT/bcrypt 协议，标注 HS256、字符串 sub、exp、72 bytes、refresh rotation 和 Cookie precedence；中文清晰。
2. M6-05-bcrypt：用 UTF-8 字节格展示 ASCII、汉字与 emoji 在 bcrypt 72 字节边界的区别，不显示真实凭据。

### 发布前核对

- [ ] 双向读取 fixture 的实际测试结论复核；说明当前覆盖的方向。
- [ ] 核对 Node/go 版本、cookie helper 和刷新路由优先级。
- [ ] 不在图、正文或命令中放真实密钥或 token。
- [ ] 替换图片与站内链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
