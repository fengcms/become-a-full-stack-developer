# 成为全栈·Go 后端篇·local 与 R2 存储抽象：接口应该小到什么程度

> 存储接口越宽，调用方越需要理解它；接口越窄，业务就越容易保持稳定。M6 的 Provider 只表达对象字节的写、读、删，附件归属仍由领域层管理。

{{IMG:M6-26-封面}}

> 本文代码快照：提交 ceac4e0。R2 通过 AWS SDK 的 S3 兼容 API 访问；线上凭据和实际部署状态以交付报告为准。

## 前言：先分清“文件对象”和“附件记录”

上传一张图片会产生两类状态。对象存储里保存字节、key 和 content type；数据库里保存谁上传、文章引用、URL、存储驱动、MIME 和文件大小。对象可以被多个附件记录引用，附件元数据也可能指向 local 或 R2。把两者塞进一个 FileRepository 接口，会让它同时承担字节 IO、权限、引用计数和数据库事务。

M6 将对象能力抽象为 platform/storage.Provider，只定义 Put、Get、Delete。attachment.Service 管理元数据、用户权限、内容摘要 key 和共享对象生命周期。bootstrap 按配置选择 Provider，并把 provider map 注入附件领域服务。

本文解释这条边界的价值、local 与 R2 各自的行为，以及为什么存储接口不该承诺它做不到的事务。

## 一、接口只描述对象提供者能力

Provider 接口以 context、key、字节和 MIME 为核心。Put 写入一个对象；Get 读取对象，缺失时返回 nil 而非错误；Delete 删除对象。接口不认识 user_id、article_id、attachment 表或“最后一个引用”——这些是附件业务的责任。

接口的全部内容只有三个方法：

~~~go
// internal/platform/storage/storage.go（节选）
// Provider 定义对象的写、读、删能力，不感知用户和文章关系。
type Provider interface {
	// Put 将字节内容写入对象键，最后一个参数为内容类型；不处理业务归属。
	Put(context.Context, string, []byte, string) error
	// Get 读取对象内容；对象不存在时返回 nil、nil，存储故障返回错误。
	Get(context.Context, string) ([]byte, error)
	// Delete 删除对象；共享引用检查和失败补偿由附件服务负责。
	Delete(context.Context, string) error
}
~~~

每个方法都以 `context.Context` 开头，这是把请求取消和调用方截止时间传进 IO 层的前提。`Put` 的四个参数分别是上下文、对象键、字节内容和 MIME 类型；`Get` 返回字节切片和错误；`Delete` 只返回错误。

三个注释写明了接口不做的事。`Put` 的注释说“不处理业务归属”——它不知道这些字节属于哪个用户、会被哪篇文章引用。`Get` 的注释定义了缺失语义“返回 nil、nil”：对象不存在不是错误，调用方拿到 `nil` 就当作 404，与真正的存储故障区分开。`Delete` 的注释把“共享引用检查和失败补偿”推给附件服务——删除一个对象前是否还有别的附件记录引用同一个 key，Provider 不参与判断。

没有列出目录、没有签名 URL、没有元数据查询。多出来的每一项都会让两个实现各自增加承诺，而真正需要这些能力的调用方很少。

这让 storage 包可以被简化测试替身实现。测试无需搭建真实 R2，就可以控制写入失败、对象缺失和读取结果；attachment.Service 测试则观察它何时调用 Put/Delete。与此同时，接口足够小，local 和 R2 都能实现，而无需伪造多余的目录、标签或事务功能。

context 贯穿 IO 操作，使 HTTP 请求取消或调用方设置的截止时间能够传给 provider。实际 provider 还应有自身 timeout。不能因为接口接收 context 就假定每个 SDK 都一定尊重取消，需要针对 SDK 和 HTTP client 配置验证。

## 二、本地存储使用安全 key 和原子替换

Local provider 将对象保存在配置根目录下。SafeKey 只允许字母、数字、点、下划线和连字符，并拒绝点目录，避免把客户端文件名当成路径写入。附件服务根据内容 SHA-256 与扩展名生成对象 key，避免原始上传文件名进入路径。

路径校验和写入流程如下：

~~~go
// internal/platform/storage/storage.go（节选）
// SafeKey 只允许安全对象键，阻止目录穿越和任意文件路径。
var SafeKey = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// Local 使用受限 key 和原子重命名保存本地对象。
type Local struct{ Root string }

func (l Local) path(key string) (string, error) {
	if !SafeKey.MatchString(key) || key == "." || key == ".." {
		return "", fmt.Errorf("invalid storage key")
	}
	return filepath.Join(l.Root, key), nil
}

// Put 写入指定 key 的对象，尊重请求取消和提供者超时。
func (l Local) Put(ctx context.Context, key string, data []byte, mime string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(l.Root, 0750); err != nil {
		return err
	}
	f, err := os.CreateTemp(l.Root, ".upload-")
	if err != nil {
		return err
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(temp, p)
}
~~~

`SafeKey` 是一条白名单正则，只接受 ASCII 大小写字母、数字、点、下划线和连字符。斜杠、反斜杠、冒号都不在集合内，所以 `../../etc/passwd` 这类输入在 `path` 里第一步就被拒绝。`path` 额外单独挡掉 `.` 和 `..`——这两个字符串在正则里是合法的（只由点组成），但作为对象键没有意义且容易被用来指向父目录。所有读写方法都先经过 `path`，校验因此无法被绕过。

`Put` 的顺序值得逐步看。第一步 `ctx.Err()` 检查请求是否已取消，避免为一个没人等的请求做完整写入。然后解析路径、用 `os.MkdirAll(l.Root, 0750)` 确保根目录存在。接着 `os.CreateTemp(l.Root, ".upload-")` 在**根目录内**建临时文件，`defer os.Remove(temp)` 保证任何提前返回都会清理它。数据写完、`f.Close()` 成功之后，才 `os.Rename(temp, p)` 把它改名为正式 key。

关键在于 `Rename` 这一步的原子性：同一文件系统内改名是原子的，所以读取方要么看到目标文件不存在，要么看到内容完整的文件，不会读到只写了一半的中间态。如果直接在目标路径上创建文件再写，就存在一个内容不全的窗口。

Local.Put 在目标目录创建临时文件，写完并关闭后再 Rename 到正式 key。这样读取方不会看到只写了一半的目标文件。临时文件在失败时清理；请求取消会在写入前检查 context。目录权限由应用路径和部署文件系统共同决定，生产环境还需要保护根目录权限、持久卷和备份。

Get 读取文件内容；不存在时转成 nil, nil；Delete 对不存在文件按幂等成功处理。这个约定让上层能够把对象不存在映射为附件 404，并让删除重试不会因目标已清理而失败。

~~~go
// internal/platform/storage/storage.go（节选）
// Get 读取指定 key 的对象，读完后关闭响应流。
func (l Local) Get(ctx context.Context, key string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p, err := l.path(key)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return b, err
}

// Delete 删除指定 key 的对象；共享引用判断由附件服务负责。
func (l Local) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := l.path(key)
	if err != nil {
		return err
	}
	err = os.Remove(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
~~~

两个方法的共同点是都用 `errors.Is` 单独识别“文件不存在”，并把它翻译成成功语义：`Get` 返回 `nil, nil`，`Delete` 返回 `nil`。`errors.Is` 而不是 `==` 很重要，因为调用链上的错误可能被包装过，直接的相等比较会漏判。

这两种翻译各自解决一个具体问题。读取时返回错误会让上层无法区分“对象确实没有”和“磁盘出问题了”，前者应当映射成 404，后者应当映射成服务端错误。删除时若把“文件不存在”当失败，一次因网络中断而重试的删除请求就会永远报错，哪怕目标早已清理干净。

local provider 的几个关键行为可以汇总成表：

| 行为 | 实现要点 |
|---|---|
| 路径安全 | `SafeKey` 白名单 + 拒绝 `.` 与 `..` |
| 写入可见性 | 先写根目录内临时文件，再 `Rename` 到目标 key |
| 对象缺失 | `Get` 返回 `nil, nil`，`Delete` 视为成功 |

本地存储的原子 rename 只解决文件系统内的可见性，不等于数据库 transaction。对象和附件行之间仍有跨资源失败窗口，下一篇会讨论补偿。

{{IMG:M6-26-provider}}

## 三、R2 用 S3 兼容 API 但保留明确配置

R2 provider 使用 AWS SDK 的 S3 client，按 Cloudflare R2 endpoint、bucket、access key、secret 创建客户端。配置不完整时拒绝构造。SDK 区域配置为 auto，启用 path-style endpoint，HTTP client 设定 15 秒超时，并在必要时进行 checksum 处理。

客户端的构造过程集中在一个函数里：

~~~go
// internal/platform/storage/r2.go（节选）
// R2 以 S3 兼容协议访问 R2，凭据仅保存在客户端配置中。
type R2 struct {
	Client *s3.Client
	Bucket string
}

// NewR2 创建具有固定超时和签名策略的 R2 客户端。
func NewR2(endpoint, bucket, key, secret string) (*R2, error) {
	if endpoint == "" || bucket == "" || key == "" || secret == "" {
		return nil, fmt.Errorf("R2 configuration incomplete")
	}
	cfg := aws.Config{
		Region:                     "auto",
		Credentials:                aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(key, secret, "")),
		HTTPClient:                 &http.Client{Timeout: 15 * time.Second},
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) { o.BaseEndpoint = &endpoint; o.UsePathStyle = true })
	return &R2{Client: client, Bucket: bucket}, nil
}
~~~

函数开头四项任一为空就返回错误，这就是“配置不完整时拒绝构造”的实现——与其让一个缺 key 的客户端在第一次上传时才失败，不如在装配阶段就报出来。

`Region` 写死为 `"auto"` 是 R2 的要求，它不使用 AWS 的区域概念。`Credentials` 用 `NewStaticCredentialsProvider` 包一层缓存，让 SDK 复用它。`HTTPClient` 的 15 秒超时是这一层的兜底：接口接收的 context 由调用方控制，但如果调用方没有设置截止时间，这个超时保证请求不会无限挂起。

两个 checksum 配置项都设为 `WhenRequired`，意思是只在协议要求时才计算与校验校验和。这不是默认值，而是针对 R2 的显式选择——批量开启校验和有额外的 CPU 与请求开销。

`s3.NewFromConfig` 的第二个参数是选项回调：`BaseEndpoint` 指向传入的 endpoint，`UsePathStyle = true` 让请求走 `endpoint/bucket/key` 形式而不是把 bucket 放进域名。R2 的 S3 兼容层需要 path-style 寻址。

两种实现的差异可以对照：

| 维度 | `Local` | `R2` |
|---|---|---|
| 构造参数 | 根目录 `Root` | endpoint、bucket、access key、secret |
| 超时来源 | 调用方 context | HTTP client 15 秒 + 调用方 context |
| 缺失映射 | `os.ErrNotExist` → `nil, nil` | `NoSuchKey` / `NotFound` → `nil, nil` |
| 删除 | `os.Remove`，不存在视为成功 | S3 `DeleteObject` |

Put 上传字节及 MIME；Get 读响应体并关闭流，限制读取量；遇到 NoSuchKey/NotFound 映射为对象不存在；Delete 调用 S3 DeleteObject。凭据只保存在服务配置，不序列化到附件响应。

读取方法把“对象不存在”从 SDK 的错误类型里分辨出来：

~~~go
// internal/platform/storage/r2.go（Get，节选）
// Get 读取指定 key 的对象，读完后关闭响应流。
func (r *R2) Get(ctx context.Context, key string) ([]byte, error) {
	res, err := r.Client.GetObject(ctx, &s3.GetObjectInput{Bucket: &r.Bucket, Key: &key})
	if err != nil {
		var missing *types.NoSuchKey
		var api smithy.APIError
		if errors.As(err, &missing) || (errors.As(err, &api) && api.ErrorCode() == "NotFound") {
			return nil, nil
		}
		return nil, err
	}
	defer res.Body.Close()
	return io.ReadAll(io.LimitReader(res.Body, 10485761))
}
~~~

这里用了两种错误识别方式，因为 S3 兼容实现报告“不存在”的形态并不统一。`types.NoSuchKey` 是强类型错误，用 `errors.As` 匹配；`smithy.APIError` 是泛化的 API 错误，需要再查 `api.ErrorCode()` 是否等于 `"NotFound"`。两种命中都返回 `nil, nil`，与 local provider 的缺失语义对齐——上层拿到的行为一致，不需要知道背后是文件系统还是对象存储。

`defer res.Body.Close()` 紧跟成功分支，保证响应体一定会被关闭。读取用 `io.LimitReader(res.Body, 10485761)` 把上限压在 1 MB 多一点，防止一个异常大的对象把内存吃满。注意这个限制是 10485761 而不是 10485760，多出来的一个字节让截断可以暴露而不是被静默吞掉。

S3 兼容不代表所有对象存储功能相同。签名格式、endpoint、错误码、生命周期规则、访问策略和计费均需实际平台配置验证。代码实现和替身测试证明调用边界；只有有凭据的线上请求才能证明真实 bucket 联通。若没有真实 R2 验证证据，文章应明确标记待实测。

## 四、Provider 不负责在故障时偷偷切换

如果当前选中的 R2 暂时不可用，服务返回错误并保留业务可观测状态；它不会自动把对象写入 local。隐式 fallback 会带来同一个存储 key 在不同介质上重复存在，后续读取究竟去哪里、删除哪个副本、数据何时同步都会变得不确定。

Read 可以根据附件元数据里的 storage 选择对应 provider，支持迁移阶段同时存在多种来源。新上传仍使用当前 configured driver。这个设计允许有计划地逐步迁移对象，但要求 Providers map 同时具备对应实现，且元数据准确标注存储位置。

迁移双读不是自动双写；双写意味着必须定义部分成功、补偿、版本一致和读取优先级。接口不应该因“本地兜底比较安全”的想象而暗中复制对象。

## 五、请求和响应通过 storage key 与 URL 解耦

附件记录向客户端暴露 URL，例如 /files/{key}，不暴露 R2 bucket、endpoint 或访问密钥。文件直出 handler 校验安全 key，根据扩展名设置 MIME 和 Content-Disposition；SVG 以 attachment 下载并设置 nosniff，降低浏览器把主动内容当页面执行的风险。

Provider key 是内部对象寻址，URL 是客户端 HTTP 路由，Attachment 元数据是业务引用。它们可以关联，但职责不一样。若未来改为签名 URL 或 CDN 域名，需要评估客户端契约和缓存策略，不能把 provider 私有地址直接放进 API 响应。

对象归属也不由 URL 决定。删除附件时，服务验证当前用户或管理角色，再处理数据库记录和共享对象引用。知道 key 不代表获得删除权限。

{{IMG:M6-26-对象与引用}}

## 六、测试抽象的边界

storage.Provider 单测可覆盖：危险 key 拒绝、本地原子写入、取消上下文、对象不存在、文件权限或 IO 错误、R2 缺失码映射、R2 HTTP timeout 与读取上限。attachment 层另覆盖引用共享、权限、内容摘要 key 和元数据故障补偿。

真实 R2 smoke 要单独运行，检查正确 bucket/key、MIME、读回字节与删除权限，并使用专用测试前缀以避免触碰正式对象。没有凭据时就标为环境未验收，不拿 mock 结果替代。

## 小结：抽象 IO，不抽象掉业务所有权

M6 的 Provider 仅承担对象 Put/Get/Delete；本地 provider 防路径穿越并原子替换，R2 provider 使用带超时的 S3 兼容客户端。附件领域拥有关系记录、用户权限、key 生成、共享引用和清理策略。读取通过元数据选择正确来源，故障不会触发隐式切换。

定义存储抽象时，先把对象与业务引用拆开，再只暴露调用方真正需要的操作。最后明确该接口不能保证跨数据库原子、不能自动迁移、也不能证明真实云端连通。小接口的价值是责任清楚，不是代码行数少。

## 延伸阅读

- [文件上传：R2 与本地磁盘双实现与签名直传](https://blog.csdn.net/fungleo/article/details/164453365)
- [配置管理：环境变量、多环境与密钥安全](https://blog.csdn.net/fungleo/article/details/164288947)
- [Node 后端分层架构：Controller、Service、Repository 的边界](https://blog.csdn.net/fungleo/article/details/164209137)
- [异步交互的一致性：上传、批量操作与部分失败](https://blog.csdn.net/fungleo/article/details/166354291)

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Go、Golang、R2、S3、对象存储、文件上传

### 文章简介（250 字以内）

M6 如何让同一附件服务读写本地磁盘或 Cloudflare R2？本文介绍只含 Put/Get/Delete 的 storage.Provider、local 安全 key 和原子 rename、R2 S3 client 的 timeout 与缺失对象处理，以及 attachment 元数据如何选择读取来源。文章明确 Provider 不负责用户权限、共享引用、跨资源事务或自动 fallback，并区分替身测试与真实 R2 验收。

### 建议发布分类

后端 / Go

### 封面短标题

接口只负责对象 IO

### 配图 AI 提示词

1. M6-26-封面：attachment service 连接数据库元数据和小型 Provider 接口，Provider 分别有 Local 与 R2 两个实现；责任边界用浅蓝白技术图表达。
2. M6-26-对象与引用：对象字节独立存储，多个 attachment 行可引用同一 key；API URL 不暴露 bucket 或密钥。
3. `M6-26-provider`：放在正文同名占位处，local 与 R2 两个存储 provider：接口只声明对象能力，不负责在故障时偷偷切换，切换是部署期的显式配置。


### 发布前核对

- [ ] 核对 Local/R2 客户端 timeout、key 限制及对象缺失映射。
- [ ] 依据实际环境报告说明 R2 真实连通状态。
- [ ] 不暗示失败自动 fallback 或文件与 SQL 原子提交。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
