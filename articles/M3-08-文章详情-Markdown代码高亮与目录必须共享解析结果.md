# 成为全栈·Next.js 网站前台篇·文章详情：Markdown、代码高亮与目录必须共享解析结果

> 目录和正文如果各自解析 Markdown，简单英文标题也许正常，中文、行内链接与重复标题很快就会让锚点失配。真正可靠的方案，是让它们从同一棵语法树里得到同一个 id。

{{IMG:M3-08-封面}}

## 前言

文章详情页最早的目录实现很直觉：用正则匹配 Markdown 里以 `##` 开头的行，把标题文字转成 slug，再渲染一组链接。正文交给 Markdown 组件，让另一个插件为标题加 id。

当测试文章只有“Installation”“Usage”时，这两套算法看起来一模一样。真实文章一出现“为什么选 **Next.js**”、“[缓存](...)的边界”或两个同名“小结”，目录生成的 href 与正文 id 就开始分叉。

这类 bug 特别会骗过代码审查，因为目录和正文都“显示出来了”，只有真正点第二个重复中文标题时才会发现错了。

## 正则看到的不是 Markdown 结构

Markdown 标题里可以有粗体、链接、行内代码和转义字符；代码围栏里也可以有以 `#` 开头的内容。用行正则很难同时回答这些问题：

- `## **Next.js** 缓存` 的可见文本是什么？
- `## [缓存](https://example.com) 边界` 是否应包含 URL？
- 代码块中的 `## title` 是不是标题？
- 第二个“小结”的 id 如何与第一个区分？
- 只有标点或 emoji 的标题去除字符后还剩什么？

语法树已经区分了标题节点、文本节点、链接子节点和代码节点。既然 Markdown 渲染器已经做了这份工作，目录没有必要在外面用字符串规则再猜一次。

## 一次遍历同时产生正文 id 和目录数据

`renderMarkdown` 在 ReactMarkdown 的 rehype 阶段访问已经变成 HTML 结构的树，将同一个 `assignHeadings` 变换器放进插件链：

```tsx
export const renderMarkdown = (content: string) => {
  let headings: Heading[] = []
  const collect = () => (tree: MarkdownNode) => {
    headings = assignHeadings(tree)
  }

  const rendered = ReactMarkdown({
    children: content,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [collect, [rehypeHighlight, {
      detect: false,
      ignoreMissing: true,
    }]],
  })

  return { headings, body: rendered }
}
```

`assignHeadings` 遍历 `h1` 到 `h6` 节点，递归提取子节点的可见文本，生成 id 后直接写回该标题节点，同时把 `{ id, text, level }` 收集到目录数组。

```ts
const base = text
  .toLowerCase()
  .trim()
  .replace(/[^\p{L}\p{N}\s_-]/gu, '')
  .replace(/\s+/g, '-') || 'section'

let id = base
let suffix = 1
while (used.has(id)) id = `${base}-${suffix++}`
```

正则里的 `\p{L}` 和 `\p{N}` 按 Unicode 字母与数字处理，中文不会被全部删掉。标题清理后为空时使用 `section`，重复标题依次变成 `小结`、`小结-1`、`小结-2`。

{{IMG:M3-08-共享解析树}}

因为目录数组与正文 id 来自同一次遍历，它们不需要“保持两套 slug 算法一致”。项目直接消除了两套算法。

## 插件顺序也是语义的一部分

Markdown 先通过 `remarkGfm` 识别表格、删除线、任务列表等 GFM 语法，再进入 rehype 的 HTML 树阶段。标题分配 id 与代码高亮都发生在 rehype 阶段。

当修改插件顺序、自定义 heading 渲染或引入新的 slug 插件时，不能只看正文样式。如果后一个插件覆盖了 `id`，目录手里仍然是前一个值，共享解析的保证会被悄悄破坏。

因此测试应该观察最终结果：渲染后的 heading id 和 TOC href 是否逐项对应，而不是只测 `assignHeadings` 返回了什么字符串。

## 代码高亮不应该靠自动猜测语言

`rehype-highlight` 配置了 `detect: false` 和 `ignoreMissing: true`。文章作者在围栏上写 `ts`、`bash` 或 `json` 时才按该语言高亮；没有声明或高亮库不认识的语言，就保留普通代码。

自动检测看似更聪明，却会对短代码和配置片段做出不稳定判断，增加服务端解析工作。内容创作已经有标准语言标识，让作者显式声明比每次猜测更可靠。

`pre` 还被替换为客户端 `CodeBlock`，为用户提供复制按钮。复制使用真实 Clipboard API，失败时给出反馈，而不是点击后无条件显示“已复制”。这块交互可以成为小型 Client Component，不需要让整篇 Markdown 进入客户端渲染。

```tsx
components: {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  a: ({ href = '', children }) => {
    const external = /^https?:\/\//.test(href)
    return <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  },
}
```

这三个覆盖分别处理复制、局部横向滚动和外部链接隔离。Markdown 渲染链不仅决定“能不能显示”，也要约束生成 DOM 的行为。

复制按钮只有在浏览器 API 真正成功后才反馈成功：

```tsx
async function copy() {
  try {
    await navigator.clipboard.writeText(code)
    setStatus('copied')
  } catch {
    setStatus('failed')
  }
}
```

## 表格和长代码应该在自己的边界里滚动

技术文章的表格和代码经常超过手机宽度。若直接给整个正文容器设置横向滚动，页面标题、段落与目录也会左右晃动。

当前 Markdown 为 table 包一层 `.table-scroll`，代码块由 `CodeBlock` 自己控制溢出。页面主体保持在视口内，只有宽内容所在的局部区域可横向滚动。长 URL 则允许换行，不要把所有宽内容都当成同一类问题。

## 原始 HTML 默认不执行

ReactMarkdown 默认不会把 Markdown 中的原始 HTML 当成可执行 DOM，项目也没有引入 `rehype-raw`。这意味着作者无法在文章中随意插入 script、iframe 或带事件属性的 HTML。

这不表示“使用 React 就自动免疫 XSS”。外部链接仍需要正确处理，结构化数据通过 `dangerouslySetInnerHTML` 输出时要单独将 `<` 转义为 `\u003c`。如果未来业务确实要支持原始 HTML，需要增加明确的允许列表清洗，不能只把插件打开。

## 目录是小型客户端岛

标题 id 和目录数组在服务端生成，目录的“当前章节”高亮则需要浏览器观察滚动位置。`Toc` 使用 `IntersectionObserver` 观察对应 heading，当标题进入阅读区域时更新 active id。

桌面端将目录放在侧栏，移动端放进正文前的 `<details>`。两处消费同一份 headings，并使用 `encodeURIComponent` 生成 hash，不再各自格式化一次中文 id。

浏览器实际验收了重复中文标题的第二个锚点，这比只看目录数组的单元测试更完整：它证明正文 DOM 上真有这个 id，点击链接也能到达正确位置。

```tsx
useEffect(() => {
  const elements = headings
    .map((heading) => document.getElementById(heading.id))
    .filter((element): element is HTMLElement => Boolean(element))

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting)
    if (visible) setActiveId(visible.target.id)
  }, { rootMargin: '-15% 0px -70% 0px' })

  elements.forEach((element) => observer.observe(element))
  return () => observer.disconnect()
}, [headings])
```

```tsx
<a
  href={`#${encodeURIComponent(heading.id)}`}
  aria-current={activeId === heading.id ? 'location' : undefined}
>
  {heading.text}
</a>
```

### 把锚点边界案例写成一张表

| Markdown 标题 | 可见文本 | 预期 id |
| --- | --- | --- |
| `## **Next.js** 缓存` | Next.js 缓存 | `nextjs-缓存` |
| `## [缓存](https://example.com) 边界` | 缓存 边界 | `缓存-边界` |
| 第一个 `## 小结` | 小结 | `小结` |
| 第二个 `## 小结` | 小结 | `小结-1` |
| `## 🎉` | 🎉 | `section` |
| 代码围栏内的 `## title` | 代码文本 | 不生成目录项 |

表中的标点清理结果必须与项目算法一致；真正的断言对象应是最终 DOM 的 `id` 与目录链接的 `href`，而不是只测中间字符串。

{{IMG:M3-08-锚点边界用例}}

### 最小浏览器回归步骤

```text
1. 打开含两个“测试标题”的文章
2. 点击目录中的第二个“测试标题”
3. 确认 URL hash 指向“测试标题-1”
4. 确认视口滚到第二个标题，aria-current 同步变化
5. 复制无语言代码块与 ts 代码块，分别检查内容和反馈
6. 在手机宽度横向滚动表格，正文不能整体左右移动
```

这些步骤同时覆盖服务端解析结果、浏览器 hash、滚动观察和局部交互，比单独给 slug 函数写几个输入输出更接近读者实际经历。

## 适用边界

如果文章只有两三个标题，不一定需要常驻侧边目录和滚动观察。当前页面也只在 headings 非空时渲染目录。

如果内容需要 MDX 中的交互组件、数学公式、Mermaid 或服务端预编译，当前 ReactMarkdown 运行时链路需要重新评估。但无论换哪种渲染器，“目录与正文共享最终标题 id”这条约束仍然成立。

## 小结

这次修正目录锚点，最关键的决定不是写出一个更复杂的 slug 正则，而是取消两套独立解析。语法树只遍历一次，正文标题与目录条目共用 id，中文、行内格式和重复标题自然不再分叉。

各位看官下次做文档目录时，先别问“什么 slug 库更好”。先问目录和正文是否正在观察同一棵树。如果答案是否，算法再精致，也只是尽力让两份副本偶然一致。

## 延伸阅读

- [服务端组件与客户端组件]({{LINK:M3-02}})
- [Markdown 编辑器：预览、暗色主题与连续图片粘贴](https://blog.csdn.net/fungleo/article/details/166107729)
- [文章阅读辅助]({{LINK:M3-09}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Next.js`、`React Markdown`、`Markdown`、`代码高亮`、`文章目录`、`Web 安全`

### 文章简介（250 字以内）

用正则扫描 Markdown 标题，再让渲染器生成另一套锚点，会在中文、行内格式和重复标题中失配。本文通过 ReactMarkdown、GFM、rehype-highlight 与共享语法树，说明如何一次生成正文 id 和目录数据，并处理原始 HTML、代码复制、宽表格与移动端目录。

### 建议发布分类

前端开发 / Next.js / Markdown

### 封面短标题

目录和正文只用一套锚点

### 配图 AI 提示词

1. `M3-08-封面`：16:9 技术博客封面，中央是一棵 Markdown 语法树，左边输出“正文 heading id”，右边输出“TOC href”，两边使用相同 id，重复中文标题显示“小结”和“小结-1”；中文短标题“目录和正文只用一套锚点”，深蓝背景，青绿连线，无 Logo 和水印。
2. `M3-08-共享解析树`：16:9 流程信息图，“Markdown 源文 → remarkGfm → HTML 语法树 → assignHeadings”，之后分为“写入正文 id”与“收集 headings 数组”两条箭头，最终汇入“锚点一致”，中文文字清晰，结构优先。
3. `M3-08-锚点边界用例`：16:9 六行测试用例信息图，展示粗体标题、链接标题、重复中文、纯 emoji 与代码围栏，并将 Markdown 输入连到最终 id，中文清晰。

### 发布前核对

- [ ] 替换 3 处配图占位符
- [ ] M3-02、09 发布后回填站内链接
- [ ] 保留重复中文标题的实际浏览器验证说明
- [ ] 确认 Tag 为 6 个、简介不超过 250 字
- [ ] CSDN 预览中正则、TSX 与中文锚点显示正常
- [ ] 已删除本辅助区

<!-- PUBLISH_ASSIST_END -->
