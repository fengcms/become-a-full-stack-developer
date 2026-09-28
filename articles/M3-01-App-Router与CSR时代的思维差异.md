# 成为全栈·Next.js 网站前台篇·App Router 与 CSR 时代的思维差异

> 从 React SPA 走到 Next.js App Router，最难的不是记住 `page.tsx`、`layout.tsx` 和 `loading.tsx`，而是接受一件事：前端代码开始参与服务端请求生命周期了。

![成为全栈·Next.js 网站前台篇·App Router 与 CSR 时代的思维差异](https://i-blog.csdnimg.cn/direct/78bbd3517a764efeb2d470f424f788a9.png)

## 前言

各位看官，在上一个 React 管理后台里，我们已经把路由、请求、鉴权和状态分得很清楚。浏览器先拿到一个 HTML 外壳，JavaScript 启动后再请求数据、匹配路由、组装页面。对管理后台而言，这套方式很合理。

到了公开网站，我一开始也下意识地想沿用它：在页面里加 `useEffect`，等接口回来后渲染文章。页面当然能打开，可首屏先是骨架，文章标题和摘要要等 JavaScript；搜索引擎和分享卡片能拿到多少内容，又要另外补功课。

这时我才意识到，App Router 不是“另一种 React Router”。它把路由、布局、服务端数据、元数据与错误恢复放在同一棵组件树里。开发者需要先问代码在哪里执行，然后才是它怎么显示。

## 目录不只是文件夹，而是请求结构

当前项目的主要路由很直接：

```text
app/
├── layout.tsx
├── loading.tsx
├── error.tsx
├── not-found.tsx
├── page.tsx
├── articles/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── member/
│   ├── layout.tsx
│   └── articles/page.tsx
└── api/v1/[...path]/route.ts
```

`page.tsx` 使一段目录成为可访问页面；`layout.tsx` 保留跨子路由的页头、导航和页脚；`loading.tsx` 承接路由切换时的等待；`error.tsx` 作为当前路由段的错误边界；`route.ts` 则直接响应 HTTP 请求。

在 CSR 工程中，路由往往是一份 JavaScript 配置；在 App Router 中，路径本身是服务端渲染树的切分方式。因此页面组织的问题也变了：

| CSR 里常问的问题 | App Router 里还要多问一层 |
| --- | --- |
| 这个 URL 显示哪个组件 | 这个路由段在哪里获取数据 |
| 全局布局怎么复用 | 哪些布局在导航时保留 |
| 页面报错如何跳转 | 错误应该由哪一层路由边界承接 |
| 首屏何时发请求 | 数据在构建、服务端请求还是浏览器阶段获取 |

![请求结构](https://i-blog.csdnimg.cn/direct/7412c06c80354427ade4e4064e78dd4f.png)

## 服务端优先，不等于所有逻辑都塞进服务端

App Router 中的组件默认是 Server Component。于是首页可以直接写成异步函数：

```tsx
export const revalidate = 60

const Home = async () => {
  const [page, tree] = await Promise.all([
    listArticles({ pageSize: 10, sort: '-publishedAt' }),
    categories(),
  ])

  return <Feed initial={page} categories={tree} />
}
```

这段代码在服务端取到首页文章和分类，再把初始数据交给浏览器中的 `Feed`。访客不必先下载列表请求代码，再额外等一轮 API 往返。API 的真实地址和 `API_ORIGIN` 也留在服务端。

但 `Feed` 需要切换分类、继续加载和保留已加载内容，它仍然是 Client Component。点赞、收藏、评论和登录也一样。所以“服务端优先”真正的意思是：

> 先把不需要浏览器的代码留在服务端，再给交互划出尽可能小的客户端边界。

它不是把 SPA 反过来变成一个大模板，更不是“看到 `use client` 就失败”。

## 数据请求从浏览器移进了渲染过程

SPA 的数据流很好理解：HTML 到达，JavaScript 启动，浏览器请求 API，再更新 DOM。App Router 则可能在构建阶段、请求到达服务端时、缓存重新验证时，或者客户端交互时获取数据。

当前项目因此有两条明确的通道：

```text
公开阅读：Page / Layout → serverFetch → 后端 API
会员交互：Client Component → 同源 /api/v1 → 后端 API
```

公开文章要可搜索、可分享、首屏有内容，所以由 Server Component 获取。会员交互依赖浏览器中的 access token 与即时反馈，因此走客户端请求和同源代理。

这条分界比“都用 fetch”更重要。前端开发者开始要对缓存、Cookie、请求头、服务端超时和错误边界负责。Next.js 并没有取消后端；它只是让前端工程师更早面对后端问题。

## 客户端导航不等于回到 SPA 整页重渲染

App Router 首次加载会生成 HTML，同时交付用于协调 Server Component 树的 RSC Payload。当用户通过 `Link` 进入另一篇文章时，Next.js 不需要把整个页头、导航和页脚都销毁后再建。它会获取新路由的服务端组件结果，与已有客户端树合并，保留共享 layout 与它们的状态。

这也解释了为什么 HTML 和 RSC 响应必须使用一致的缓存和失效策略。如果 CDN 将两者分别缓存，用户首次打开页面时可能看到版本 A，站内导航却拿到版本 B 的组件数据。这已经不是单个 React 组件的问题，而是托管平台对 Next.js 渲染协议的支持问题。

因此我们使用 OpenNext 适配 Cloudflare，不是为了把 Next.js 生成的所有响应都当普通静态文件上传。平台还需要理解 Worker 执行、流式响应、增量缓存和重新验证。这是 App Router 把全栈责任带进前端工程后，必须一起承担的部署代价。

## 我们没有把原有 API 搬进 Next.js

App Router 可以写 Route Handler 和 Server Action，但这个项目已经有一套被管理后台、未来 App 和小程序共用的 M1 API。如果再在 Next.js 里重写文章、评论和会员业务，就会出现第二套权限规则与状态机。

因此这里的 Route Handler 主要承担 BFF 边界：隐藏后端地址、转发 Cookie、统一同源路径、校验跨站写入。领域规则仍然由 M1 后端作最终裁决。

这是我认为从 SPA 迁移时很容易走过头的一步：框架能做后端，不代表应该复制已有后端。边界由系统契约决定，不由框架功能列表决定。

## 验证不能只看“页面出来了”

### 把同一个需求分别写一遍，差异会更直观

如果沿用 CSR 思维，文章列表通常要在组件挂载后再取数据：

```tsx
'use client'

export function ArticleList() {
  const [articles, setArticles] = useState<Article[]>([])

  useEffect(() => {
    fetch('/api/v1/articles?page=1&pageSize=10')
      .then((response) => response.json())
      .then((result) => setArticles(result.data.list))
  }, [])

  return articles.map((article) => <ArticleCard key={article.id} article={article} />)
}
```

代码没有错，但 HTML 首次生成时没有文章。加载态、请求失败、SEO 与分享元数据，都要等浏览器接手以后再处理。App Router 中，公开首屏可以先在服务端完成：

```tsx
export default async function ArticlesPage() {
  const page = await listArticles({ page: 1, pageSize: 10 })

  return (
    <section>
      <h1>最新文章</h1>
      {page.list.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </section>
  )
}
```

这不是语法替换，而是请求顺序发生了变化：文章数据参与服务端渲染，浏览器收到的首屏已经有标题、链接和摘要。

### 元数据也属于路由的数据依赖

文章标题既出现在正文里，也出现在浏览器标题、搜索结果和分享卡片里。当前详情页用同一个加载函数生成页面与元数据：

```tsx
const load = cache((slug: string) => getArticle(slug))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await load((await params).slug)

  return {
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.summary,
  }
}
```

`cache()` 在一次服务端渲染过程中复用结果，避免元数据和页面正文各请求一次同一篇文章。这正是 App Router 的思维：元数据不是页面之外的一张静态表，它与路由使用同一份内容事实。

### 四类特殊文件各管一种状态

```tsx
// app/error.tsx
'use client'

export default function ErrorPage({ error }: { error: Error }) {
  return (
    <section role="alert">
      <h1>页面暂时无法加载</h1>
      <p>{error.message}</p>
      <button onClick={() => location.reload()}>重新加载</button>
    </section>
  )
}
```

| 文件 | 触发条件 | 应承担的职责 |
| --- | --- | --- |
| `layout.tsx` | 进入当前路由段及其子路由 | 共享外壳、导航与 Provider |
| `loading.tsx` | 路由内容仍在流式加载 | 提供与最终结构接近的骨架 |
| `error.tsx` | 当前路由段抛出运行错误 | 告知失败并提供恢复动作 |
| `not-found.tsx` | 明确调用 `notFound()` | 表达资源不存在，而不是系统故障 |

不要把请求超时也转成 404。找不到文章与后端暂时不可用是两类事实，混写会误导读者，也会让监控失去信号。

{{IMG:M3-01-CSR与AppRouter对照}}

### 一套可以复现的验证顺序

```bash
pnpm typecheck
pnpm build
pnpm start
```

生产服务启动后，应至少检查：首页 HTML 中能找到文章标题；详情页 `<title>` 与正文一致；不存在的 slug 返回 404；人为让内容接口失败时进入错误页而不是 404；关闭 JavaScript 后，公开文章仍可阅读。只有这几项一起通过，才能说明路由、数据与错误语义确实连起来了。

当前项目的验证证明了不同层次的事：

- `next build` 证明路由树、服务端代码和客户端代码能生成生产产物。
- Node.js 本地运行时的页面冒烟，证明公开路由与会员路由能按预期访问。
- OpenNext 构建与本地 Worker 运行，证明代码不只依赖 Next.js 的 Node 开发服务器。
- 真实上线域名、Cookie 属性和远端 R2 行为本期没有验证，不能由本地通过倒推。

我特别想保留最后一条。全栈项目里，“哪些证明了”和“哪些还没证明”同样重要。

## 适用边界

如果项目是登录后才能使用的内部工具，SEO 不重要，团队对 SPA 非常熟悉，CSR 仍然是成本更低的选择。上一个管理后台没有因为 Next.js 更强就必须重写。

如果项目有公开内容、详情页 SEO、可分享元数据，又有登录后交互，App Router 才开始显示出价值。但这份价值伴随新的基础设施与缓存成本，后面几篇会逐步拆开。

## 小结

App Router 改变的不只是路由写法。它让页面直接参与数据获取、缓存、元数据、错误边界和 HTTP 响应。从这里开始，前端工程师不能只问“组件怎么渲染”，还要问“这次渲染何时发生、在哪里发生、使用了谁的数据”。

下一篇，我们就沿着这个问题继续拆 Server Component 和 Client Component 的边界。

## 延伸阅读

- [React 后台骨架：布局、数据路由与分层守卫](https://blog.csdn.net/fungleo/article/details/165589276)
- [契约先行：设计一套被七个端复用的 API](https://blog.csdn.net/fungleo/article/details/164140515)
- [服务端组件与客户端组件]({{LINK:M3-02}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

