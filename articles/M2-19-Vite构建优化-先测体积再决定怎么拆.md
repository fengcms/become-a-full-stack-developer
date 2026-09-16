# 成为全栈·React 管理后台篇·Vite 构建优化：先测体积，再决定怎么拆

> 构建出现大包告警时，先确认谁在首屏、谁按需加载、重量来自哪里。隐藏告警或机械拆包，都不等于性能优化。

## 前言

文章编辑页第一次构建出了 1.06MB chunk。最直接的反应是调高 `chunkSizeWarningLimit`，或者把所有依赖都塞进 vendor。这样终端不再报警，用户需要下载的代码却一字节没少。

本项目先用路由懒加载隔离页面，再用 visualizer 找到真正重量：Markdown 编辑器带入 CodeMirror、remark/rehype，以及 `refractor/all` 的 297 种高亮语言。优化由此从“包很大”变成了可验证的问题。

## 路由懒加载先隔离使用场景

登录、看板、文章、评论和设置页面都通过 `React.lazy` 加载。编辑器只在 `/articles/new` 和编辑路由需要，看板的 Recharts 也只由 `/dashboard` 承担。

```ts
const ArticleFormPage = lazy(() => import('@/pages/articles/ArticleFormPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
```

路由拆分解决“谁需要下载”，不能解决 chunk 自身为什么大。ArticleFormPage 仍把整套编辑器生态装在一个业务 chunk 中，于是继续用 `manualChunks` 隔离依赖。

## 按生态边界拆，而不是按包名随意切

Vite 配置维护一组编辑器相关包特征，把它们归入 `md-editor`：

```ts
manualChunks: (id) =>
  MD_EDITOR_PKGS.some((pkg) => id.includes(pkg)) ? 'md-editor' : null
```

拆分后 ArticleFormPage 从约 1.06MB 降到 8.79kB，重量进入独立编辑器 chunk。首次进入编辑页仍要下载它，但普通列表和其它页面不再被迫携带。

这叫隔离，不叫减重。真正减重来自下一步归因。

{{IMG:M2-19-分包前后}}

## visualizer 只在分析时启用

```ts
const enableBundleAnalyzer = process.env.ANALYZE === '1'

plugins: [
  react(),
  ...(enableBundleAnalyzer ? [visualizer({
    filename: 'dist/stats.html',
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
  })] : []),
]
```

`pnpm analyze` 才生成 treemap，正常构建和 CI 不产生 1.5MB 的 stats.html 噪音。图中同时看原始、gzip 与 brotli，不能只拿最漂亮的数字报告。

分析发现 `rehype-prism-plus` 默认入口引入 `refractor/all`，注册 297 种语言。中文技术博客绝大多数不会使用 abap、agda、apl，却要为它们支付下载成本。

## 297 种语言缩到 41 种

项目使用 refractor common 的 36 种语言，再补 jsx、tsx、nginx、docker、http：

```ts
const EXTRA_SYNTAXES = [jsx, tsx, nginx, docker, http]
for (const syntax of EXTRA_SYNTAXES) refractor.register(syntax)
```

Vite 只精确 alias `refractor/all`。不能连裸 `refractor` 一起替换，否则精简入口自己 import refractor 时会形成别名死循环；前缀匹配还可能错误改写 `refractor/jsx`。

结果是 md-editor 从 1059.87kB 降到 563.94kB，gzip 从 363.46kB 降到 180.24kB，约减半。jsx/tsx 经过目视验证，避免优化后高亮静默失效。

{{IMG:M2-19-Treemap归因}}

## 仍超过 500kB，为什么保留告警

编辑器 chunk 仍触发 Vite 告警。owner 接受这项取舍：文章系统需要成熟编辑器，而且它已被路由隔离。项目没有调高阈值，因为告警记录着真实成本，未来升级依赖时仍能提醒我们复查。

最终验收时共享入口约 146.28kB gzip；看板含 Recharts，但按路由加载；其余业务页保持小 chunk。性能判断要看用户路径，而不是要求每个文件都低于某个神奇数字。

## 小结

优化顺序是：测量用户路径，隔离按需页面，查看 treemap，找到根因，精简真实依赖，最后记录仍然接受的成本。调高告警线只会让问题失声。

各位看官，看到大包先别急着写 manualChunks。先问它何时下载、压缩后多大、由哪条 import 链带入，以及删掉内容会不会破坏真实功能。

## 延伸阅读

- [Vite + React + TypeScript：搭起一个有门禁的后台工程](https://blog.csdn.net/fungleo/article/details/165447601)
- [Markdown 编辑器]({{LINK:M2-10}})
- [前端质量门禁]({{LINK:M2-20}})

---

如果这篇文章对你有帮助，欢迎订阅我的 CSDN 专栏 **「成为全栈」**：

🔗 专栏地址：[https://blog.csdn.net/fungleo/category_13204651.html](https://blog.csdn.net/fungleo/category_13204651.html)

📦 本系列配套代码仓库：[https://github.com/fengcms/become-a-full-stack-developer](https://github.com/fengcms/become-a-full-stack-developer)

![成为全栈专栏订阅](https://i-blog.csdnimg.cn/direct/64327c7510ad45dcb8b997df3a151525.png)

<!-- PUBLISH_ASSIST_START：发布前辅助信息，发布时整段删除 -->

## 发布辅助信息

### 文章 Tag（6 个）

`Vite`、`React`、`前端性能`、`代码分割`、`Bundle分析`、`管理后台`

### 文章简介（250 字以内）

面对 1.06MB 的文章编辑页 chunk，调高告警线并不会减少用户下载。本文使用路由懒加载、manualChunks 和 visualizer 逐步归因，找出 refractor/all 带入 297 种高亮语言的问题，并精简为 41 种，使编辑器 chunk 约减半，同时说明为什么仍保留超过 500kB 的真实告警。

### 建议发布分类

前端开发 / Vite / 性能优化

### 封面短标题

先测体积，再决定怎么拆

### 配图 AI 提示词

#### 1. `M2-19-封面`
- 用途：封面；比例：16:9。
- 提示词：技术博客横版封面，巨大 JavaScript 包经过“路由隔离、Treemap 分析、语言精简”三道步骤变小，标题“先测体积，再决定怎么拆”，深蓝背景，青绿数据流，无 Logo、水印和人物。

#### 2. `M2-19-分包前后`
- 插入位置：“按生态边界拆”之后；比例：16:9。
- 提示词：前后对比图，拆分前 ArticleFormPage 1.06MB，拆分后业务页 8.79kB 与 md-editor 独立 chunk；标注普通页面无需下载编辑器。中文清晰。

#### 3. `M2-19-Treemap归因`
- 插入位置：“297 种语言缩到 41 种”之后；比例：16:9。
- 提示词：Treemap 对比，refractor/all 297 语言缩为 common 加 jsx、tsx、nginx、docker、http 共 41 种，md-editor 1059.87→563.94kB。深色数据图，中文准确。

### 发布前核对
- [ ] 6 个 Tag，简介不超过 250 字
- [ ] 三张配图已替换，M2 内链已回填
- [ ] 构建数字仍与最终验收一致
- [ ] 宣传图片存在，辅助区已删除

<!-- PUBLISH_ASSIST_END -->
