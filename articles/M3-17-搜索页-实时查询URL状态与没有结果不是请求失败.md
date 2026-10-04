# 成为全栈·Next.js 网站前台篇·搜索页：实时查询、URL 状态与“没有结果”不是“请求失败”

> 空关键词、零条结果、接口失败和不存在页面是四种不同事实。搜索页只有把关键词、类型和页码写进 URL，并为每种状态提供对应动作，才真正可分享、可恢复。

![成为全栈·Next.js 网站前台篇·搜索页：实时查询、URL 状态与“没有结果”不是“请求失败”](https://i-blog.csdnimg.cn/direct/e5ef2d2910fe4f55b4f80a08c3f2c1a5.png)

## 前言

搜索框很简单：输入关键词，提交到 `/search`。真正麻烦的是结果页。关键词为空时不应请求，搜索无结果不是错误，后端 502 也不是 404；用户切换“文章/会员”后，关键词又不能丢。

当前搜索页由 Server Component 读取 URL 参数并动态查询。它不放进公共 60 秒缓存，也不让每次输入都在浏览器里悄悄请求，而是把一次搜索视为一个可复制、可返回的页面状态。

## URL 是搜索状态的公开副本

```text
/search?q=Next.js&type=article&page=2
```

| 参数 | 允许值 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `q` | 去除首尾空白后的字符串 | 空 | 搜索关键词 |
| `type` | `article` / `member` | `article` | 搜索对象 |
| `page` | 正安全整数 | `1` | 当前页 |

```tsx
const params = await searchParams
const q = params.q?.trim() || ''
const type = params.type === 'member' ? 'member' : 'article'
const page = pageNumber(params.page)
```

非法类型回退文章，非法页码收敛到第一页。页面刷新、浏览器返回和复制链接都能恢复同一搜索上下文。

![搜索状态](https://i-blog.csdnimg.cn/direct/441a88957e6d4c5e96ed4dc4314c24d6.png)

## 空关键词不发请求

```tsx
const response = q
  ? await search({ q, type, page })
  : null
```

```tsx
{!q ? (
  <Empty
    title="你想了解什么？"
    message="输入一个关键词，查找相关文章或作者。"
    href="/categories"
    action="浏览分类"
  />
) : (
  <SearchResults response={response} />
)}
```

空关键词是初始状态，不是“搜索结果为零”。因此它不显示“没有找到”，也不制造一次没有意义的 API 请求。

## 搜索表单使用浏览器原生 GET

```tsx
<form className="bigsearch" action="/search">
  <input
    aria-label="关键词"
    name="q"
    defaultValue={q}
    placeholder="搜索文章或会员"
    required
  />
  <input type="hidden" name="type" value={type} />
  <button type="submit">搜索</button>
</form>
```

GET 表单天然把输入写进 URL，无 JavaScript 时仍可使用。这里选择“提交后搜索”，避免每敲一个字都创建历史记录和服务端请求。需要实时联想时，应把建议列表作为单独客户端能力，并增加防抖、取消与键盘导航。

## 切换类型要保留关键词并重置页码

```tsx
{(['article', 'member'] as const).map((nextType) => (
  <Link
    key={nextType}
    className={type === nextType ? 'selected' : ''}
    href={`/search?${new URLSearchParams({ q, type: nextType })}`}
  >
    {nextType === 'article' ? '文章' : '会员'}
  </Link>
))}
```

链接没有复制旧 page，因此切换搜索类型后回到第一页。文章第 5 页不代表会员结果也有第 5 页。

## 两种结果共享外壳，不共享字段

```tsx
result.list.map((item) =>
  'title' in item ? (
    <ArticleCard key={item.id} article={item} categories={tree} />
  ) : (
    <div className="authorrow" key={item.id}>
      <div className="avatar">{item.nickname?.slice(0, 1) || '读'}</div>
      <div>
        <Link href={`/members/${item.id}`}>{item.nickname}</Link>
        <p>{item.articleCount} 篇公开文章</p>
      </div>
    </div>
  ),
)
```

会员搜索只显示昵称、公开文章数和公开主页，不把邮箱、角色或账号状态带进结果。共享分页与空状态，不代表可以抹平隐私字段差异。

## 零结果与请求失败的恢复路径不同

```tsx
{result?.list.length ? (
  <ResultList />
) : (
  <Empty
    title="没有找到相关内容"
    message="试试更简短的关键词，或从分类中查找。"
    href="/categories"
    action="浏览分类"
  />
)}
```

请求失败不会进入这段空状态，而会抛给路由错误边界：

```tsx
<button type="button" onClick={() => window.location.reload()}>
  重新加载
</button>
```

项目曾只调用错误边界 `reset()`，恢复后端后仍无法重新执行失败的服务端请求。改为完整页面加载后，搜索请求与会话恢复都会重新开始。代价是丢失局部客户端状态，但搜索状态在 URL 中，所以关键词、类型和页码仍然保留。

## 搜索请求使用 no-store

```ts
export const search = (query: SearchQuery) =>
  serverFetch<SearchResult>('/search', {
    query,
    cache: 'no-store',
  })
```

关键词组合几乎无限，结果又应反映最新公开内容。当前规模下不把它们放进首页公共缓存。将来访问量增长，可以为热门词建立专门缓存，但需要命中率、失效和隐私分析，不能顺手继承 60 秒规则。

## 分页链接保留查询上下文

```tsx
<Pagination
  page={result.pagination.page}
  totalPages={result.pagination.totalPages}
  path="/search"
  query={{ q, type }}
/>
```

分页是普通链接，搜索引擎和无脚本浏览器都能导航。不过搜索页 metadata 设置 `noindex, follow`，避免大量关键词 URL 成为低价值索引页：

```ts
export const metadata = {
  title: '搜索',
  robots: { index: false, follow: true },
}
```

## 搜索状态验收矩阵

| 场景 | 预期 |
| --- | --- |
| 直接打开 `/search` | 初始引导，不请求 API |
| `q` 只有空格 | 仍是初始状态 |
| 有文章结果 | 显示总数、列表与分页 |
| 有会员结果 | 只显示公开身份字段 |
| 零结果 | 保留关键词并给出换词/分类入口 |
| 后端停止 | 错误页，不冒充零结果或 404 |
| 后端恢复后重试 | 重新加载并恢复相同 URL 搜索 |
| 切换类型 | 保留 q，回到第一页 |
| 非法 page | 收敛到第一页 |

![四种状态](https://i-blog.csdnimg.cn/direct/433d275976a34232bfd99e06fce8cbc9.png)

实际浏览器验收应观察服务故障恢复，而不只是给 Empty 组件截图。只有错误发生、服务恢复、点击按钮又出现真实结果，恢复链路才算完成。

## 适用边界

数据库子串查询适合当前内容规模。数据量增长后，应考虑全文索引、分词、相关度、拼写建议和搜索分析；这些能力属于搜索服务与契约，不应由 React 在浏览器过滤全部文章替代。

实时输入搜索还要处理防抖、竞态与取消请求。当前提交式搜索更简单，也更容易形成稳定 URL。

## 小结

搜索页的价值不只在返回列表，而在准确表达状态：没输入、没结果、请求失败和资源不存在各有不同原因与下一步。

把关键词、类型和页码放进 URL，再让服务端按该 URL 查询，页面就具备分享、返回、刷新和故障恢复的共同基础。

## 延伸阅读

- [会员投稿工作流]({{LINK:M3-16}})
- [会员公开主页与通知中心]({{LINK:M3-18}})
- [响应式、可访问性与错误状态]({{LINK:M3-20}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`搜索功能`、`URL 状态`、`Server Components`、`错误处理`、`SEO`

### 文章简介（250 字以内）

空关键词、零结果、请求失败和 404 是四种不同状态。本文结合 Next.js 搜索页，讲清关键词、类型和页码如何进入 URL，文章与会员结果如何分界，以及 no-store、noindex、分页和完整页面重试如何形成可分享、可恢复的搜索体验。

### 建议发布分类

前端开发 / Next.js / 搜索

### 封面短标题

没有结果不是请求失败

### 配图 AI 提示词

1. `M3-17-封面`：16:9 技术博客封面，一个搜索框分出四条路径“未输入、找到结果、零结果、请求失败”，每条路径拥有不同界面；中文短标题“没有结果不是请求失败”，深蓝背景、青绿正常状态、橙色错误状态，无 Logo 和水印。
2. `M3-17-搜索状态`：16:9 URL 解剖图，展示 `/search?q=Next.js&type=article&page=2`，分别标注关键词、类型、页码以及刷新、分享、返回可恢复，中文清晰。
3. `M3-17-四种状态`：16:9 四象限状态图，空关键词显示引导、正常结果显示列表、零结果显示换词建议、请求失败显示重新加载，突出恢复动作不同，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-16、18、20 发布后回填站内链接
- [ ] 不把搜索零结果写成 404
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中 URL、表格和 TSX 正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
