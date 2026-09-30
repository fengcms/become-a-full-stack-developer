# 成为全栈·Next.js 网站前台篇·多级分类、标签与 URL：让内容导航既可读又可索引

> 分类 id 用来建立数据关系，slug 用来稳定地址，name 用来给人阅读。这三者看起来都能代表一个分类，却不能在路由和接口里混着用。

![成为全栈·Next.js 网站前台篇·多级分类、标签与 URL：让内容导航既可读又可索引](https://i-blog.csdnimg.cn/direct/9e75ff3ccf4f48bb935ca94746017d2b.png)

## 前言

多级分类在后台里是一棵树，到前台却同时变成了导航菜单、分类归档、面包屑、文章卡片标签和 SEO URL。这些界面看起来只是在显示同一份数据，实际上对“这个分类是谁”有不同需求。

本项目曾出现过一类很典型的错误：文章摘要里有 `categoryId`，页面就把这个数字直接拼到 `/categories/12`。可路由页面实际按 slug 查找，最后数据是对的，链接却走到 404。

这不是某个组件少写了转换，而是标识语义没有被系统性地定下来。

## id、slug 和 name 各自只做一件事

| 字段 | 适合用途 | 不适合用途 |
| --- | --- | --- |
| `id` | 数据库关联、API 精确识别、稳定内部键 | 直接当给用户的语义 URL |
| `slug` | URL 路径、分类和标签查询 | 当数据库关联主键 |
| `name` | 导航文案、页面标题、面包屑显示 | 臆测 slug 或作为唯一键 |

文章摘要不一定直接带 `categorySlug`，因此页面会先获取分类树，用 `flattenCategories` 展平后按 `categoryId` 找到节点，再使用节点的 slug 生成链接。

```ts
const category = flattenCategories(tree)
  .find((item) => item.id === article.categoryId)

const href = category ? `/categories/${category.slug}` : undefined
```

这段映射看起来多走了一步，却让数据关联和网址语义各就各位。对标签也一样：文章上的标签字符串可能是名称或 slug，页面应该和完整标签列表核对后生成 URL，不能对中文名称自行小写和替换就当成真实 slug。

## 一棵四级树不能直接摊平到顶栏

后端契约允许分类树最深四级。如果把每个节点都平铺成顶部链接，桌面宽度不够，手机端更无法使用。如果只显示顶级，深层内容又失去入口。

当前导航使用递归 `CategoryItem`，有子项的节点用原生 `<details>` 与 `<summary>` 表达可展开分支：

```tsx
const CategoryItem = ({ node, depth = 0 }) =>
  node.children?.length ? (
    <details className={`nav-branch depth-${depth}`}>
      <summary>{node.name} <span aria-hidden="true">▾</span></summary>
      <div className="drop">
        <Link href={`/categories/${node.slug}`}>{node.name} · 全部</Link>
        {node.children.map((child) => (
          <CategoryItem node={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  ) : <Link href={`/categories/${node.slug}`}>{node.name}</Link>
```

顶部只直接放前三个根分类，其余收进“更多栏目”。点击分类后菜单收起，按 Escape 关闭并将焦点返回 summary，点击导航外部也会关闭。原生 disclosure 让键盘基础行为有可靠起点，但四级嵌套在手机端仍然需要真实触摸验收，不能只在桌面改窄浏览器就算通过。

![标识与路由](https://i-blog.csdnimg.cn/direct/404fcb546ba14041908a79e46b5a65a4.png)

## 父分类页应该看到子树文章

用户进入“前端开发”这样的父分类时，预期通常是看到它与下属 React、Vue、CSS 等子分类的文章。如果只按当前 category id 精确匹配，父分类页很可能显示空内容。

子树聚合已经是后端分类查询的契约能力：前端将 slug 传给文章列表接口，后端负责展开后代分类。前端不需要遍历整棵树后发出多个列表请求，更不应该把各子分类分页结果拼在一起再自己排序。

这是一个很典型的全栈边界：树怎么在页面里展开是前端问题，哪些文章属于这棵子树则是数据查询问题。若把后者交给浏览器，分页总数、排序与缓存都会变得不可靠。

## 分类页和全部文章页有不同的 URL 语义

全部文章页允许用查询串切换分类：

```text
/articles?category=react&sort=-publishedAt&page=2
```

它表示“在全部文章中使用一组筛选条件”。独立分类归档则使用：

```text
/categories/react?sort=-publishedAt&page=2
```

它表示“React 分类本身是当前内容主体”，页面有独立标题、描述和 canonical URL。两种页面复用同一个 `Archive`，但不把 URL 强行收敛成一种。

分页和排序也留在 URL 中，这样刷新、复制链接和浏览器返回都能保留上下文。`pageNumber` 会将负数、小数、超出安全整数或无法解析的值收敛到第 1 页；排序只允许 `-publishedAt` 和 `-viewCount`，不把任意查询字符串原样传给后端。

## 标签不是另一棵分类树

分类表达内容的主要归属，有父子关系；标签表达可跨分类的主题，是多对多关系。如果导航中把两者都做成层级菜单，读者会无法理解主路径。

因此顶部导航主要使用分类，标签在文章详情、侧栏热门标签与独立标签索引页中出现。侧栏标签按 `articleCount` 排序，它表达“内容数量较多”，并不等于实时搜索热度。

## 错误、空分类和不存在是三件事

`/categories/[slug]` 会先在分类树中寻找 slug，确认分类不存在才返回 404。已存在但没有文章的分类，显示“暂无文章”与子栏目入口。后端列表请求失败则进入错误边界，不冒充空内容。

这三种状态对用户的下一步完全不同：404 需要回到分类索引，空分类可以访问子分类或等待更新，请求失败则应该重试。一句统一的“没有数据”会把这些恢复路径全部抹掉。

### 文章卡片必须把内部 id 翻译成公开 slug

```tsx
const categoryById = new Map(
  flattenCategories(categories).map((category) => [category.id, category]),
)

const category = categoryById.get(article.categoryId)

return (
  <article>
    <Link href={articleUrl(article.slug || article.id)}>{article.title}</Link>
    {category && (
      <Link href={`/categories/${category.slug}`}>{category.name}</Link>
    )}
  </article>
)
```

如果接口未来直接返回 `categorySlug`，这层映射可以简化；在契约尚未提供前，集中翻译比让每张卡片各自猜 slug 更可靠。

### 分类路由先确认身份，再查询文章

```tsx
export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const tree = await getCategoryTree()
  const category = flattenCategories(tree).find((item) => item.slug === slug)

  if (!category) notFound()

  const query = await searchParams
  return <Archive category={category} page={pageNumber(query.page)} sort={safeSort(query.sort)} />
}
```

```ts
const safeSort = (value: unknown) =>
  value === '-viewCount' ? '-viewCount' : '-publishedAt'
```

`notFound()` 只由“分类身份不存在”触发。文章查询失败会抛到错误边界，查询成功但列表为空才渲染空状态。

### 分页链接要保留当前筛选上下文

```tsx
function pageHref(page: number) {
  const params = new URLSearchParams(searchParams)
  params.set('page', String(page))
  return `${pathname}?${params.toString()}`
}

return <Link href={pageHref(current + 1)}>下一页</Link>
```

如果翻页时只写 `?page=2`，当前的分类和排序会一起丢失。URL 是列表状态的公开副本，生成链接时必须在现有参数上修改，而不是从空字符串重建。

### 用例表比“点过菜单”更能发现标识混用

| 用例 | 输入 | 预期 |
| --- | --- | --- |
| 文章卡片分类 | `categoryId=12` | 链接使用树中对应 slug |
| 父分类归档 | `slug=frontend` | 包含后代分类文章 |
| 不存在分类 | `slug=missing` | 404 |
| 已存在空分类 | 有分类、列表为空 | 空状态与子分类入口 |
| 非法页码 | `page=-2` 或 `page=abc` | 收敛到第 1 页 |
| 非法排序 | `sort=drop-table` | 回退发布时间排序 |

![URL验收矩阵](https://i-blog.csdnimg.cn/direct/f737bbce97d741c28d5ef50289f5cb29.png)

## 适用边界

当站点只有五六个平级栏目时，没有必要为四级树提前建造复杂导航。契约支持深度不代表界面必须同时展开所有深度。

反过来，如果分类可以被重命名或调整 slug，还需要设计旧 URL 重定向。当前项目将 slug 视为稳定公开标识，没有实现 slug 历史表。运营上若经常改 slug，SEO 与外部链接就会成为新需求。

## 小结

多级分类的难点不是写一个递归组件，而是让数据关系、公开 URL 和用户文案使用正确的标识。id、slug 和 name 一旦混用，问题会从某张卡片的 404 一路扩散到面包屑、canonical 和 sitemap。

各位看官遇到树形导航时，可以先把三个词写在纸上：“内部关联”“公开地址”“用户显示”。它们如果分别对应 id、slug 和 name，后面大部分路由错误都能提前避免。

## 延伸阅读

- [分类树与标签管理：层级数据在后台怎么编辑](https://blog.csdn.net/fungleo/article/details/166353905)
- [内容门户首页](https://blog.csdn.net/fungleo/article/details/166784376)
- [文章列表：服务端首屏与客户端持续加载](https://blog.csdn.net/fungleo/article/details/166836287)

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`App Router`、`分类树`、`URL 设计`、`SEO`、`内容导航`

### 文章简介（250 字以内）

分类 id、slug 和 name 都能表示一个分类，却分别属于内部关联、公开 URL 和用户显示。本文结合四级分类导航、父分类聚合、标签索引与分页 URL，分析三种标识混用导致的 404 问题，并说清树形界面与子树查询的全栈边界。

### 建议发布分类

前端开发 / Next.js / Web 架构

### 封面短标题

id、slug、name 不能混用

### 配图 AI 提示词

1. `M3-06-封面`：16:9 技术博客封面，中央是一棵四层内容分类树，每个节点向右分出“id 内部关联”“slug 公开 URL”“name 用户显示”三条路径，中文短标题“id、slug、name 不能混用”，深蓝背景、青绿节点，结构清晰，无 Logo 和水印。
2. `M3-06-标识与路由`：16:9 三列对照信息图，左列“id → 数据库关联”，中列“slug → /categories/react”，右列“name → React 开发”，底部给出错误反例“/categories/12 → 404”，中文清晰，米白背景、编辑信息图风格。
3. `M3-06-URL验收矩阵`：16:9 测试矩阵信息图，覆盖卡片分类、父分类、空分类、不存在分类、非法页码与非法排序，标出对应 URL 和预期状态，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-05、07 发布后回填站内链接
- [ ] 核对父分类查询由后端包含后代分类
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中树形代码和 URL 示例正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
