# 成为全栈·React 管理后台篇·React SPA 部署：静态托管、路由回退与 API 反代

> `dist/` 上传成功，只证明静态文件存在。深链刷新、API、附件、Cookie 和缓存全部跑通，SPA 才真正上线。

## 前言

本地开发一切正常，部署后首页也能打开，可刷新 `/articles/42/edit` 就返回 404；登录接口修好后，文章图片又全部裂开；最后发现刷新页面仍会掉登录。三个问题分别来自 SPA 回退、漏掉 `/files` 反代和 Secure Cookie。

Vite 开发服务器替我们处理了很多事情，静态托管不会自动继承这些能力。本篇把部署请求链逐一接上。

## 构建产物只是静态文件

```bash
pnpm install
pnpm typecheck
pnpm build
```

产物位于 `dist/`，包含 index.html 和带哈希的 assets。`pnpm analyze` 会额外生成 stats.html，只用于分析，不应作为普通发布必需文件。

根路径部署保持 Vite 默认 `base: '/'`。若挂在 `/admin/`，必须同步修改 base、重新构建并调整托管路由；只在 Nginx 改前缀会让资源地址错误。

## 深链必须回退到 index.html

React Router 的 `/articles/new` 并不是服务器上的目录。浏览器直接请求该地址时，托管层必须返回 index.html，再由前端路由解释。

Nginx 核心配置是：

```nginx
location / {
    root /var/www/manage-frontend/dist;
    try_files $uri $uri/ /index.html;
}
```

同时要排除真实 assets、API 和附件，不能把 `/api/v1/users` 的 404 也回退成 HTML。否则请求层会报告“响应格式异常”，排查非常绕。

{{IMG:M2-21-部署请求链}}

## `/api/v1` 与 `/files` 两条反代缺一不可

业务 API 使用 `/api/v1`，附件 URL 却按契约挂在后端根路径 `/files/{key}`。只代理 API 会让登录和列表正常，所有头像、封面与正文图片仍然 404。

```nginx
location /api/v1/ {
    proxy_pass https://api-befull.kao9.com/api/v1/;
    proxy_pass_header Set-Cookie;
}

location /files/ {
    proxy_pass https://api-befull.kao9.com/files/;
}
```

同源反代能避免浏览器 CORS，并让前端继续使用相对路径。另一方案是浏览器直连后端域名，此时后端必须准确配置 CORS origins 和 credentials，Cookie 属性也要匹配跨站场景。

## Cookie 恢复必须在生产 HTTPS 验证

accessToken 只存内存，页面刷新依赖 HttpOnly refresh Cookie 静默恢复。后端 Cookie 带 Secure，本地 HTTP 环境不会回传，这是已知限制；生产必须通过 HTTPS 真实验证。

检查不能只看登录成功。刷新深链后仍保持会话，才证明 Set-Cookie、Domain、Path、SameSite、Secure 和反代透传共同生效。

若 Pages Functions 或 Nginx 改写 Host，还要检查 Cookie 是否落在浏览器实际访问域名。前端 JavaScript读不到 HttpOnly Cookie，只能通过网络面板和刷新行为判断。

## Cloudflare Pages 与 Nginx 的共同原则

Pages 可以用 `_routes.json` 配置 SPA 范围，并通过 Pages Functions、Transform Rules 等代理 API 与附件。Nginx 则由 `try_files` 与两个 location 完成相同职责。

平台语法不同，请求边界一致：静态资源直接返回，页面路径回退 index.html，API 和附件转发后端。不要照抄配置而不画清请求会落到哪里。

## 缓存策略要区分入口和哈希资源

`assets/*` 文件名包含内容哈希，可以缓存一年并 immutable；index.html 必须 no-cache，让浏览器及时获取指向新哈希资源的入口。

如果把 index.html 也长缓存，发布后用户仍请求旧 chunk；服务器已经删除旧文件时会出现动态 import 失败。保留一段时间的旧哈希资产还能降低发布瞬间的版本切换风险。

## 上线验证从深链开始

至少验证：未登录进入首页、登录后看板、刷新文章编辑深链、API 无 CORS、`/files` 图片 200、刷新后保持登录、编辑器 chunk 只在编辑页下载。

部署检查应在真实域名和 HTTPS 下完成。本地 preview 能检查构建产物，却证明不了 CDN 规则、反代、Cookie 和证书。

## 小结

SPA 部署包含静态资源、路由回退、两条后端反代、HTTPS Cookie 和分层缓存。任何一层遗漏，都可能出现“首页能开但系统不能用”。

## 延伸阅读

- [部署上线：从本地起服到真正对外服务](https://blog.csdn.net/fungleo/article/details/164815866)
- [前端鉴权闭环]({{LINK:M2-07}})
- [Vite 构建优化]({{LINK:M2-19}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`React`、`Vite`、`SPA部署`、`Nginx`、`Cloudflare Pages`、`反向代理`

### 文章简介（250 字以内）

Vite 的 dist 上传成功，不代表 React SPA 已经可靠上线。本文从深链刷新 404、附件裂图和页面刷新掉登录三个问题出发，讲清 index.html 路由回退、`/api/v1` 与 `/files` 双反代、生产 HTTPS Cookie 验证，以及入口文件与哈希资源的差异化缓存，并给出 Cloudflare Pages 与 Nginx 的共同部署模型。

### 建议发布分类

前端开发 / React / 部署运维

### 封面短标题

SPA 上线不只是上传 dist

### 配图 AI 提示词

#### 1. `M2-21-封面`
- 用途：封面；比例：16:9。
- 提示词：技术博客横版封面，React SPA 从 dist 经过静态托管、路由回退、API 反代、files 反代和 HTTPS Cookie 五个节点上线，标题“SPA 上线不只是上传 dist”，深蓝背景，中文清晰。

#### 2. `M2-21-部署请求链`
- 插入位置：“深链必须回退”之后；比例：16:9。
- 提示词：部署请求路由图，assets 到静态文件，页面深链到 index.html，api/v1 到后端 API，files 到附件服务，Set-Cookie 经 HTTPS 返回浏览器。深色信息图，中文准确。

### 发布前核对
- [ ] 6 个 Tag，简介不超过 250 字
- [ ] 两张配图已替换，M2 内链已回填
- [ ] 在真实生产域名验证 Cookie 与深链
- [ ] 宣传图片存在，辅助区已删除

<!-- PUBLISH_ASSIST_END -->
