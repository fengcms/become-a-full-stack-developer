# 成为全栈·基础补充·Nginx 入门：反向代理与静态托管

> Nginx 常站在用户与应用之间：它可以接收 HTTPS、托管静态文件，也可以把 `/api` 转发给后端。理解请求经过的路径，才能正确配置域名、Cookie、代理头和错误排查。

{{IMG:B-09-封面}}

## 前言：为什么不让应用直接面对所有流量

一个 Web 项目可能有前端静态资源、API 服务、上传文件和多个子服务。Nginx 可以作为反向代理入口，根据域名或路径把请求交给不同服务，也可以直接返回构建后的静态文件。用户看到的是一个公开域名，内部服务则监听本机或私有网络端口。

Nginx 不是应用业务代码的一部分。它负责连接和转发边界，应用仍需做身份验证、权限检查、输入校验和业务逻辑。反向代理也不是默认的安全保证；代理头、TLS、请求体上限和超时都要正确配置。

## 一、反向代理和正向代理

正向代理代表客户端访问外部服务；反向代理代表服务端接收客户端请求，再转发到内部应用。请求路径可以是：

```text
浏览器 --HTTPS--> Nginx --HTTP/私网--> Web/API 服务
```

这样 API 服务可以只绑定 `127.0.0.1:8080`，公网只开放 Nginx 的 HTTPS 端口。Nginx 负责 TLS 证书和静态资源缓存，应用处理业务。若应用本身部署在 Serverless 平台，平台可能承担相似入口职责，但具体路由和运行约束不同。

## 二、一个简化的代理配置

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

这是结构示例，不是可直接上线的完整 TLS 配置。证书路径、TLS 协议、请求体上限、超时、访问日志和安全头都要按目标环境检查。`proxy_pass` 末尾是否有 URI 会影响路径拼接行为，配置前要明确 `/api/` 前缀是保留还是剥离，并用实际请求验证。

应用只有在明确设置可信代理范围后，才应该信任 `X-Forwarded-For` 里的客户端 IP。若任何用户都能直接访问应用端口，他们就可能伪造转发头。代理之后的信任链需要在网络和应用两侧同时约束。

## 三、静态文件托管

前端构建后通常生成 HTML、CSS、JavaScript 和图片等静态文件。Nginx 可从指定目录直接返回它们，避免每次都让应用进程读取文件：

```nginx
server {
    listen 80;
    server_name example.com;
    root /srv/site/current;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        expires 7d;
    }
}
```

单页应用路由可能需要把未知路径回退到 `index.html`；多页站点或 SSR 应用则不能不加判断地这样做，否则 API 404 或真实文件缺失可能被错误返回首页。静态资源 hash 命名后可以长期缓存，HTML 通常要较短缓存或重新验证，缓存策略要与构建产物更新方式一致。

## 四、反向代理还要设置边界

- **请求体大小**：上传服务限制与 Nginx 限制要协调，避免代理提前拒绝或过大请求占满资源。
- **超时**：连接、读取和发送超时影响长请求；不要无限等待，也不要为掩盖应用卡死而设得极长。
- **WebSocket**：需要升级头和相应代理行为，普通 HTTP 配置不一定足够。
- **Cookie 和路径**：代理改写 Host、Path 或 HTTPS 识别时，登录 Cookie 的 Domain、Secure 和 SameSite 可能受影响。
- **缓存**：动态带身份的响应不能因通用缓存规则被共享给其他用户。
- **错误日志**：区分 Nginx 连接失败、TLS 错误与应用返回 4xx/5xx。

## 五、排查顺序

1. DNS 是否解析到预期入口，HTTPS 证书是否覆盖当前域名？
2. Nginx 监听端口和虚拟主机是否匹配 Host？
3. 静态目录或 `proxy_pass` 上游是否存在、是否可连接？
4. 代理路径是否保留，应用路由是否收到预期 URL？
5. 转发协议、Cookie、请求体和超时是否符合应用要求？
6. 查看 Nginx access/error log 和应用日志里的请求 ID，分清故障发生在哪一层。

改配置后先运行语法检查，再 reload；reload 之前保留有效配置和回退方式。生产配置变更应在低风险窗口验证健康状态，不要靠反复重启来试参数。

## 六、Nginx 不是唯一部署方式

Nginx 适合自管 Linux、静态站点和传统服务入口；Cloudflare、其他 CDN、Ingress Controller 和托管平台也能承担部分 TLS、代理和静态托管职责。具体选择影响日志、缓存、证书、请求大小和内部网络。把 Nginx 语法学会并不意味着所有平台都按同一配置工作，但反向代理的职责模型仍然通用。

## 小结：代理只转发它理解的请求

Nginx 可以托管静态资源、终止 TLS 并把请求转发给服务。要确认路径改写、可信代理、Cookie、上传限制、超时和缓存规则；把代理层日志与应用日志关联起来。它是服务边界的一部分，不替代应用鉴权，也不自动保证配置正确。

## 延伸阅读

- [Linux 服务器入门]({{LINK:B-04}})
- [域名、DNS 与 HTTPS 证书]({{LINK:B-10}})
- [HTTP 协议：前端天天用却说不清的那些事]({{LINK:B-01}})

---
如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[成为全栈](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->
## 发布辅助信息

### 文章 Tag（6 个）

Nginx、反向代理、静态资源、Linux、HTTPS、网站部署

### 文章简介（250 字以内）

Nginx 可以托管前端静态文件，也可以作为反向代理把 HTTPS 请求转给内部 API。本文从请求路径讲起，解释反向代理、静态目录、代理头、路径拼接、可信 IP、Cookie、上传体积、超时和缓存边界，并提供配置结构示例和逐层排查顺序。配置片段需要结合实际证书、路由和运行平台验证，不能直接复制为生产方案。

### 建议发布分类

Linux / 网站部署

### 封面短标题

请求怎样经过反向代理

### 配图 AI 提示词

1. B-09-封面：HTTPS 请求到达 Nginx，由路径规则分别返回静态资源或转发到内部 API 服务。
2. B-09-代理链路：展示 Host、客户端 IP、原始协议和请求路径在代理转发中的关系。

### 发布前核对

- [ ] 核查 Nginx `proxy_pass` 尾部 URI 与路径保留行为。
- [ ] 配置示例明确非完整生产 TLS 配置，避免直接复制上线。
- [ ] 替换图片和链接，发布时删除辅助信息。
<!-- PUBLISH_ASSIST_END -->
