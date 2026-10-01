# 成为全栈·Next.js 网站前台篇·Next.js SEO：metadata、结构化数据、sitemap 与 robots

> SEO 不是给页面塞一组关键词。搜索引擎需要稳定的公开 URL、与正文一致的元数据、可安全解析的结构化数据，以及一张不包含私有页面的站点地图。

![成为全栈·Next.js 网站前台篇·Next.js SEO：metadata、结构化数据、sitemap 与 robots](https://i-blog.csdnimg.cn/direct/bc6857dd0e8f45ed9571ba6ce3151371.png)

## 前言

内容站使用 Next.js，大家很容易说出一个理由：对 SEO 友好。但“服务端能生成 HTML”只是起点。标题可能与正文不一致，canonical 可能指向本机，JSON-LD 可能形成脚本注入，sitemap 可能只列出前 100 篇文章，会员中心也可能被错误加入索引。

当前项目把 SEO 拆成四个相互校验的出口：页面 metadata 描述当前内容，JSON-LD 给出机器可读实体，sitemap 提供公开 URL 清单，robots 表达爬虫访问策略。它们必须共享同一套 URL 和公开范围。

## 先明确四种机制分别解决什么

| 机制 | 主要回答 | 不能替代什么 |
| --- | --- | --- |
| `metadata` | 当前页面标题、描述、分享卡片是什么 | 不能保证页面可抓取 |
| JSON-LD | 页面中的文章实体有哪些结构字段 | 不能代替可见正文 |
| `sitemap.xml` | 本站希望搜索引擎发现哪些公开 URL | 不能强制收录 |
| `robots.txt` | 哪些路径允许或不建议抓取 | 不能作为权限控制 |

robots 中写了 `Disallow`，并不意味着页面有安全保护；任何私有数据仍必须由后端鉴权。反过来，URL 出现在 sitemap 中也不等于一定获得排名。

![SEO四件套](https://i-blog.csdnimg.cn/direct/ddcfbc867e824536a10395ea83834075.png)

## 动态 metadata 应与正文复用同一篇文章

详情页用 React `cache()` 包住文章读取，`generateMetadata` 与页面正文消费同一份请求结果：

```tsx
const load = cache(async (slug: string) => {
  return getArticle(slug).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await load((await params).slug)

  return {
    title: article.title,
    description: article.summary || undefined,
    alternates: { canonical: articleUrl(article) },
  }
}
```

如果 metadata 单独调用另一套接口，就可能在缓存再验证窗口里出现标题版本 A、正文版本 B。请求内复用不能解决所有跨时刻缓存问题，但至少消除了同一次渲染中的重复读取。

## Open Graph 需要真实字段，缺失就省略

```tsx
return {
  title: article.title,
  description: article.summary || undefined,
  openGraph: {
    title: article.title,
    description: article.summary || undefined,
    type: 'article',
    publishedTime: article.publishedAt || undefined,
    images: article.coverImage ? [article.coverImage] : undefined,
  },
}
```

没有封面时不应该填一条不存在的图片地址；没有摘要时，也不应截断 Markdown 源码塞进 description。默认站点图和默认描述可以在根 layout 统一配置，文章页只覆盖确实存在的内容字段。

canonical 则必须使用正式站点 origin。若部署时仍保留 `http://127.0.0.1:13001`，搜索引擎看到的规范地址就会错误。因此 `NEXT_PUBLIC_SITE_URL` 是上线配置的一部分，不是一项可忽略的本地便利变量。

## 所有文章链接统一经过 `articleUrl`

```ts
export const articleUrl = (article: { id: number; slug?: string | null }): string =>
  `/articles/${encodeURIComponent(article.slug || String(article.id))}`
```

页面链接、canonical、sitemap 和相关文章都调用同一函数。slug 存在时使用 slug，历史数据没有 slug 时回退 id。若四个出口分别拼接 URL，一次路由策略调整就可能制造重复地址。

更严格的系统还会将 id 旧地址 301 重定向到 slug 地址。当前项目允许两种标识被 API 读取，但公开链接统一优先 slug，减少主动产生重复 URL。

## JSON-LD 不是普通字符串拼接

文章页输出 `BlogPosting`：

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      datePublished: article.publishedAt || undefined,
      dateModified: article.updatedAt,
      author: {
        '@type': 'Person',
        name: article.authorName || '作者',
      },
      description: article.summary || undefined,
    }),
  }}
/>
```

危险点在于 `</script>` 可以提前闭合脚本标签。项目在序列化后转义小于号：

```ts
export const jsonLd = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c')
```

不要手写 JSON 字符串，也不要因为 MIME 类型是 `application/ld+json` 就认为插值天然安全。安全边界仍然是正确序列化与脚本闭合字符处理。

## sitemap 必须遍历完整分页

只请求 `pageSize=100` 并不等于站点最多只有 100 篇文章。当前实现按接口返回的总页数继续读取：

```ts
let page = 1
let totalPages = 1

do {
  const data = await listArticles({ page, pageSize: 100 })

  for (const article of data.list) {
    entries.push({
      url: new URL(articleUrl(article), origin).href,
      ...(article.updatedAt ? { lastModified: article.updatedAt } : {}),
    })
  }

  totalPages = data.pagination.totalPages
  page += 1
} while (page <= totalPages)
```

分类、标签和实际出现过的作者主页也被加入：

```ts
for (const category of flattenCategories(tree)) {
  if (category.slug) entries.push({ url: new URL(`/categories/${category.slug}`, origin).href })
}

for (const tag of allTags) {
  entries.push({ url: new URL(`/tags/${tag.slug}`, origin).href })
}
```

搜索结果、登录注册、会员中心和 API 不进入 sitemap。内容量明显增长后，还要评估生成时间、URL 去重和 sitemap 分片；当前全量遍历适合现阶段规模，不是无限扩展方案。

## robots 表达抓取策略，不承担鉴权

```ts
const robots = (): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    allow: '/',
    disallow: ['/member/', '/api/', '/login', '/register', '/search'],
  },
  sitemap: new URL('/sitemap.xml', SITE_URL).href,
})
```

搜索页被排除，是因为关键词组合可能无限扩张，容易制造低价值重复页面。会员 layout 还会输出 `noindex, nofollow` metadata：

```tsx
export const metadata = {
  title: '会员中心',
  robots: { index: false, follow: false },
}
```

两层表达可以减少误抓取，但真正的私有内容保护仍在 API 权限校验。知道 URL 的任何人都能忽略 robots.txt 发请求。

## 让四个出口互相核对

| 检查对象 | 应满足的不变量 |
| --- | --- |
| 页面 canonical | 与站内文章链接采用相同 slug 策略 |
| Open Graph URL/图片 | 使用可公开访问的绝对地址 |
| JSON-LD headline | 与可见的 `<h1>` 一致 |
| sitemap 文章 URL | 不漏分页，不含草稿和会员页 |
| robots sitemap 地址 | 使用正式站点 origin |
| 私有页面 | 不进 sitemap，同时带 noindex，且后端鉴权 |

![URL一致性](https://i-blog.csdnimg.cn/direct/86d5bd6d3d834e90b20fa1a60d6f7d92.png)

## 生产验收不能只看页面源代码

```bash
pnpm build
pnpm start
curl -s http://localhost:3000/sitemap.xml
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/articles/example-slug
```

至少要核对：详情页 title、description、canonical 和 JSON-LD 是否对应同一文章；第二页以后的文章是否出现在 sitemap；会员路径是否被排除；正式构建是否注入正确站点域名；包含 `</script>` 测试文本的标题或摘要不会提前闭合 JSON-LD。

本地通过仍不能证明搜索引擎已经抓取或收录。上线后还要通过搜索平台观察抓取错误、规范地址选择和结构化数据报告，这些属于生产证据。

## 适用边界

小型站点使用一个动态 sitemap 足够。达到数万或数十万 URL 后，应使用 sitemap index 分片，并避免每次生成都串行扫描全部内容。

结构化数据字段也不应为了“更丰富”而虚构。没有图片、出版组织或修改时间时，可以省略；错误字段比少字段更容易让机器理解与真实页面分叉。

## 小结

Next.js 提供了 metadata、sitemap 和 robots 的文件约定，却不会自动保证 SEO 正确。真正的质量来自同一套公开 URL、同一份文章事实和明确的公开范围。

当 canonical、站内链接、JSON-LD 与 sitemap 指向同一篇文章，会员与搜索页又被清楚排除，SEO 才从几段配置变成了可以验证的系统契约。

## 延伸阅读

- [文章阅读辅助](https://blog.csdn.net/fungleo/article/details/166885558)
- [数据获取与缓存](https://blog.csdn.net/fungleo/article/details/166784128)
- [站点设置如何驱动页头、页脚与 SEO]({{LINK:M3-19}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`SEO`、`Metadata`、`JSON-LD`、`Sitemap`、`Robots`

### 文章简介（250 字以内）

Next.js 能生成服务端 HTML，并不代表 SEO 自动正确。本文结合动态 metadata、安全 JSON-LD、完整分页 sitemap 和 robots 实现，说明如何统一 canonical、站内链接与公开 URL，并明确会员中心、搜索页和权限边界。

### 建议发布分类

前端开发 / Next.js / SEO

### 封面短标题

SEO 是一套 URL 契约

### 配图 AI 提示词

1. `M3-10-封面`：16:9 技术博客封面，中央是一篇文章页面，向四周连接 Metadata、JSON-LD、Sitemap、Robots 四个模块，所有箭头汇聚到同一个规范 URL；中文短标题“SEO 是一套 URL 契约”，深蓝背景、青绿线路，无人物、Logo 和水印。
2. `M3-10-SEO四件套`：16:9 四象限信息图，分别展示 metadata 的搜索摘要、JSON-LD 的实体结构、sitemap 的 URL 清单、robots 的抓取规则；底部注明“发现、理解、抓取不等于权限”，中文清晰。
3. `M3-10-URL一致性`：16:9 中心辐射图，中央为 `/articles/slug`，周围 canonical、站内链接、Open Graph、JSON-LD、sitemap 全部指向它，红色错误支路指向 localhost 和数字旧地址，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-04、09、19 发布后回填站内链接
- [ ] 上线前将示例域名替换为正式 `NEXT_PUBLIC_SITE_URL`
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中 JSON-LD、表格和命令正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
